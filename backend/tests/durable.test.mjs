import assert from 'node:assert/strict';
import {test,before,after,afterEach} from 'node:test';
import {fork} from 'node:child_process';
import {writeFile,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {runtimeFixture,until} from './runtime-fixture.mjs';
let f,Runtime,operations,evaluation,workers=[],children=[],pendingReleases=[];const events=[];
const io={to:()=>({emit:(_event,data)=>events.push(data)})};
const submit=(s,index=0,text='FIFO explains the mechanism.')=>f.service.submitSessionAnswer(s._id,f.owner,String(index),null,null,null,null,io,text);
const rows=(sql,args=[])=>f.query(sql,args).then(r=>r.rows);
const op=id=>rows('SELECT * FROM durable_operations WHERE id=$1',[id]).then(r=>r[0]);
function worker(options={}){const w=new Runtime({io,leaseMs:1000,pollMs:50,retryMs:50,...options});workers.push(w);return w;}
async function drain(s,w){for(let n=0;n<10;n++){const queued=await rows("SELECT id FROM durable_operations WHERE session_id=$1 AND status='queued' ORDER BY created_at",[s._id]);if(!queued.length)return;for(const row of queued)await w.process(row.id);}throw new Error('Unexpected unbounded operation chain');}
async function child(){const c=fork(fileURLToPath(new URL('./runtime-worker-child.mjs',import.meta.url)),[],{env:{...process.env},stdio:['ignore','ignore','pipe','ipc']});children.push(c);let error='';c.stderr.on('data',b=>{error+=b.toString();});const ready=await new Promise((resolve,reject)=>{c.once('message',resolve);c.once('exit',code=>reject(new Error(`Worker exited ${code}: ${error.slice(0,300)}`)));});c.owner=ready.owner;return c;}
async function stopChild(c,signal='SIGTERM'){if(c.exitCode!==null || c.signalCode)return;c.kill(signal);await new Promise(r=>c.once('exit',r));}
before(async()=>{f=await runtimeFixture();({InterviewRuntime:Runtime}=await import('../dist/runtime/worker.js'));operations=await import('../dist/runtime/operations.js');({evaluationService:evaluation}=await import('../dist/evaluation/service.js'));});
afterEach(async()=>{for(const release of pendingReleases)release();pendingReleases=[];if(f){f.state.mode='normal';f.state.gate=null;f.state.probeGate=null;}for(const c of children)await stopChild(c);});
after(async()=>{if(!f)return;f.state.gate=null;f.state.probeGate=null;for(const c of children)await stopChild(c);for(const w of workers)await w.stop(true).catch(()=>{});await f.cleanup();});

test('answer claimed before worker/provider; duplicate delivery and conflicting input cannot create another attempt',async()=>{
 const s=await f.active(),before=f.state.calls;
 const [a,b]=await Promise.all([submit(s),submit(s)]);assert.equal(a.id,b.id);assert.equal(f.state.calls,before);
 assert.equal((await rows('SELECT status FROM answer_attempts WHERE session_id=$1',[s._id]))[0].status,'received');
 assert.equal((await rows('SELECT count(*)::int AS n FROM transactional_outbox WHERE operation_id=$1',[a.id]))[0].n,1);
 await assert.rejects(()=>submit(s,0,'Changed content'),/already claimed/);
 await assert.rejects(()=>submit(s,1),/current operation/);
 await assert.rejects(()=>f.service.endInterviewSession(s._id,f.owner,io),/accepted answers/);
 const w=worker();await Promise.all([w.process(a.id),w.process(a.id)]);
 assert.equal(f.state.calls,before+1);assert.equal((await op(a.id)).status,'succeeded');
 assert.equal((await rows('SELECT count(*)::int AS n FROM evaluations WHERE answer_attempt_id IN (SELECT id FROM answer_attempts WHERE session_id=$1)',[s._id]))[0].n,1);
 assert.equal((await rows('SELECT amount FROM reward_ledger WHERE session_id=$1',[s._id]))[0].amount,50);
 assert.equal((await submit(s)).id,a.id);await w.process(a.id);assert.equal(f.state.calls,before+1);
 assert.ok(events.length);for(const e of events){assert.ok(e.eventId);assert.ok(Number.isSafeInteger(e.revision));assert.deepEqual(Object.keys(e).sort(),['errorCode','eventId','operationId','revision','sessionId','state']);}
});
test('three transient attempts, visible manual retry and frozen pins reuse the same answer/grade/reward identity',async()=>{
 const s=await f.active(),a=await submit(s),w=worker();f.state.mode='transient';const before=f.state.calls;
 for(let i=0;i<3;i++){await w.process(a.id);if(i<2)await f.query("UPDATE durable_operations SET next_retry_at=now()-interval '1 second' WHERE id=$1",[a.id]);}
 const failed=await op(a.id);assert.equal(failed.attempts,3);assert.equal(failed.status,'retryable_failed');assert.equal(failed.next_retry_at,null);assert.equal(f.state.calls,before+3);
 await w.process(a.id);assert.equal(f.state.calls,before+3);
 const views=await operations.ownedOperations(s._id,f.owner);assert.equal(views[0].retryAvailable,true);
 await assert.rejects(()=>operations.retryOperation(s._id,f.other,a.id),/not found/);
 f.state.mode='normal';await operations.retryOperation(s._id,f.owner,a.id);await w.process(a.id);
 const done=await op(a.id);assert.equal(done.status,'succeeded');assert.equal(done.total_attempts,4);assert.equal(done.manual_retries,1);
 assert.equal((await rows('SELECT count(*)::int AS n FROM answer_attempts WHERE session_id=$1',[s._id]))[0].n,1);
 assert.equal((await rows('SELECT count(*)::int AS n FROM evaluations WHERE answer_attempt_id IN (SELECT id FROM answer_attempts WHERE session_id=$1)',[s._id]))[0].n,1);
 const answer=(await rows('SELECT * FROM answer_attempts WHERE id=$1',[done.answer_attempt_id]))[0];assert.equal(answer.runtime_prepared,true);
 await assert.rejects(()=>f.query("UPDATE answer_attempts SET selected_rubric_id=NULL WHERE id=$1",[answer.id]),e=>e.code==='23514');
});
test('permanent failure stops without automatic retry; cancellation releases accepted work and preserves history',async()=>{
 const s=await f.active(),a=await submit(s),w=worker();f.state.mode='permanent';await w.process(a.id);f.state.mode='normal';
 assert.equal((await op(a.id)).status,'terminal_failed');assert.equal((await op(a.id)).attempts,1);
 assert.equal((await operations.ownedOperations(s._id,f.owner))[0].retryAvailable,false);
 await assert.rejects(()=>operations.retryOperation(s._id,f.owner,a.id),/manual retry/);
 const replacement=await submit(s,0,'A corrected new answer explains FIFO.');assert.notEqual(replacement.id,a.id);
 await operations.cancelOperation(s._id,f.owner,replacement.id);await w.process(replacement.id);
 assert.equal((await op(replacement.id)).error_code,'cancelled_by_user');assert.equal((await rows('SELECT count(*)::int AS n FROM evaluations WHERE answer_attempt_id IN (SELECT id FROM answer_attempts WHERE session_id=$1)',[s._id]))[0].n,0);
});
test('audio staging survives upload deletion, transcription survives evaluation retry, typed input skips STT',async()=>{
 const s=await f.active(),path=join(f.directory,'audio.wav');await writeFile(path,Buffer.from('RIFF fictional bounded audio fixture'));
 const a=await f.service.submitSessionAnswer(s._id,f.owner,'0',null,null,path,null,io),w=worker(),before=f.state.speechCalls;
 const fs=await import('node:fs/promises');await fs.unlink(path);
 assert.equal((await rows('SELECT input_kind,status FROM answer_attempts WHERE session_id=$1',[s._id]))[0].input_kind,'audio');
 f.state.mode='transient';await w.process(a.id);assert.equal(f.state.speechCalls,before+1);
 f.state.mode='normal';await f.query("UPDATE durable_operations SET next_retry_at=now()-interval '1 second' WHERE id=$1",[a.id]);await w.process(a.id);
 assert.equal(f.state.speechCalls,before+1);const stored=await f.repo.findById(s._id);assert.match(stored.questions[0].userAnswerText,/FIFO/);assert.equal(stored.questions[0].speechMetricsStatus,'unavailable');assert.equal(stored.questions[0].speechMetrics,undefined);
 assert.equal((await rows('SELECT count(*)::int AS n FROM staged_interview_media WHERE session_id=$1',[s._id]))[0].n,0);
 const typed=await submit(s,1);await w.process(typed.id);assert.equal(f.state.speechCalls,before+1);
 const large=join(f.directory,'large.wav');await writeFile(large,Buffer.alloc(10*1024*1024+1));await assert.rejects(()=>f.service.submitSessionAnswer(s._id,f.owner,'2',null,null,large,null,io),/invalid_audio_size/);
});
test('probe reservations recover provider interruption, stay capped, and derived grades remain provisional',async()=>{
 const s=await f.active(),w=worker();f.state.mode='missing';
 for(let i=0;i<3;i++){const a=await submit(s,i);await w.process(a.id);await drain(s,w);}
 let saved=await f.repo.findById(s._id);assert.equal(saved.questions.length,5);assert.equal((await rows("SELECT count(*)::int AS n FROM durable_operations WHERE session_id=$1 AND operation_type='follow-up'",[s._id]))[0].n,2);
 assert.ok(saved.questions[3].followUpConceptId);assert.ok(saved.questions[3].parentEvaluationId);assert.ok(saved.questions[3].followUpRationale);
 const a=await submit(s,3);await w.process(a.id);saved=await f.repo.findById(s._id);assert.equal(saved.questions[3].evaluation.rubricStatus,'provisional');assert.equal(saved.questions[3].evaluation.evaluatorConfidence,'medium');assert.equal(saved.reviewedSummary.planned,3);assert.equal(saved.questions.length,5);f.state.mode='normal';
});
test('report failure retries independently; finishing/restored completion and reward replay are idempotent',async()=>{
 const s=await f.active({count:1}),w=worker({buildReport:async()=>{throw new Error('Fictional unexpected report storage failure');}});
 const a=await submit(s);await w.process(a.id);assert.equal((await f.repo.findById(s._id)).runtimeState,'finishing');
 const report=(await rows("SELECT * FROM durable_operations WHERE session_id=$1 AND operation_type='report'",[s._id]))[0];
 for(let i=0;i<3;i++){await w.process(report.id);if(i<2)await f.query("UPDATE durable_operations SET next_retry_at=now()-interval '1 second' WHERE id=$1",[report.id]);}
 assert.equal((await op(report.id)).status,'retryable_failed');assert.equal((await op(report.id)).error_code,'report_unavailable');assert.equal((await rows('SELECT reward_key FROM reward_ledger WHERE session_id=$1',[s._id])).length,1);
 assert.equal((await f.service.endInterviewSession(s._id,f.owner,io)).runtimeState,'finishing');
 await operations.retryOperation(s._id,f.owner,report.id);const recovered=worker();await recovered.process(report.id);
 const publicSession=await f.service.getSessionDetails(s._id,f.owner);assert.equal(publicSession.status,'completed');assert.ok(publicSession.report);assert.equal(publicSession.overallScore,null);assert.equal(publicSession.reviewedSummary.reason,'insufficient_reviewed_coverage');
 const xp=(await rows('SELECT xp FROM users WHERE id=$1',[f.owner]))[0].xp;
 await f.service.endInterviewSession(s._id,f.owner,io);await recovered.process(report.id);assert.equal((await rows('SELECT xp FROM users WHERE id=$1',[f.owner]))[0].xp,xp);
 assert.deepEqual((await rows('SELECT reward_key,amount FROM reward_ledger WHERE session_id=$1 ORDER BY reward_key',[s._id])).map(r=>[r.reward_key,r.amount]),[['answer:0',50],['completion',200]]);
 const before=publicSession.report;await evaluation.reevaluate(f.owner,publicSession.questions[0].evaluation.answerAttemptId);
 assert.deepEqual((await f.service.getSessionDetails(s._id,f.owner)).report,before);
 await assert.rejects(()=>f.query("UPDATE interview_reports SET summary='{}' WHERE session_id=$1",[s._id]),e=>e.code==='23514');
 const legacy=await f.active({legacy:true});const complete=await f.service.endInterviewSession(legacy._id,f.owner,io);assert.equal(complete.overallScore,65);assert.equal(complete.scoringVersion,'legacy');
});
test('two independent workers, duplicate Redis deliveries and client retries commit one grade and reward',async()=>{
 const c1=await child(),c2=await child(),s=await f.active();let release;f.state.gate=new Promise(r=>{release=r;pendingReleases.push(r);});const before=f.state.calls,a=await submit(s);
 await until(async()=>(await op(a.id)).status==='running','worker SQL claim');
 const {Queue}=await import('bullmq'),queue=new Queue('aptlyra-interview-operations',{connection:f.redis});
 await queue.add('duplicate-delivery',{operationId:a.id},{jobId:'duplicate-'+a.id,removeOnComplete:true});
 c1.send({operationId:a.id});c2.send({operationId:a.id});assert.equal((await submit(s)).id,a.id);
 release();f.state.gate=null;await until(async()=>(await op(a.id)).status==='succeeded','one committed grade');
 assert.equal(f.state.calls,before+1);assert.equal((await rows('SELECT count(*)::int AS n FROM evaluations WHERE answer_attempt_id IN (SELECT id FROM answer_attempts WHERE session_id=$1)',[s._id]))[0].n,1);assert.equal((await rows('SELECT count(*)::int AS n FROM reward_ledger WHERE session_id=$1',[s._id]))[0].n,1);
 await queue.close();await stopChild(c1);await stopChild(c2);
});
test('worker process crash after provider request, Redis flush and startup recovery retain SQL intent',async()=>{
 const c1=await child(),s=await f.active();let release;f.state.gate=new Promise(r=>{release=r;pendingReleases.push(r);});const before=f.state.calls,a=await submit(s);
 await until(async()=>(await op(a.id)).status==='running','crash fixture claim');await until(()=>f.state.calls>before,'provider request');
 await stopChild(c1,'SIGKILL');await f.redis.flushdb();release();f.state.gate=null;
 const c2=await child();await until(async()=>(await op(a.id)).status==='succeeded','startup lease recovery');
 assert.equal((await op(a.id)).total_attempts,2);assert.equal((await rows('SELECT count(*)::int AS n FROM evaluations WHERE answer_attempt_id IN (SELECT id FROM answer_attempts WHERE session_id=$1)',[s._id]))[0].n,1);
 await stopChild(c2);
});
test('outbox publisher failure and Redis loss before delivery recover without duplicate persisted effects',async()=>{
 const s=await f.active(),a=await submit(s),broken=worker({publish:async()=>{throw new Error('FICTIONAL publisher unavailable');}});
 await broken.tick();assert.equal((await op(a.id)).status,'queued');assert.equal((await rows('SELECT status FROM transactional_outbox WHERE operation_id=$1',[a.id]))[0].status,'failed');
 await f.redis.flushdb();const restored=worker();await restored.start();await until(async()=>(await op(a.id)).status==='succeeded','outbox republish');await restored.stop();workers=workers.filter(w=>w!==restored);
});
test('stale revisions, completed sessions, withdrawn evidence and deletion during provider latency fence every late result',async()=>{
 const w=worker();
 for(const condition of ['revision','completed','delete','withdraw']){
   const s=await f.active(),a=await submit(s);let release;f.state.gate=new Promise(r=>{release=r;pendingReleases.push(r);});const before=f.state.calls;
   const pending=w.process(a.id);await until(()=>f.state.calls>before,'delayed provider');
   if(condition==='revision')await f.query('UPDATE sessions SET runtime_revision=runtime_revision+1 WHERE id=$1',[s._id]);
   if(condition==='completed')await f.query("UPDATE sessions SET status='completed',runtime_state='completed' WHERE id=$1",[s._id]);
   if(condition==='delete'){await assert.rejects(()=>f.service.deleteInterviewSession(s._id,f.other),/not found/);await f.service.deleteInterviewSession(s._id,f.owner);}
   if(condition==='withdraw')await f.query("UPDATE sources SET state='suspended' WHERE id=$1",[f.source]);
   release();f.state.gate=null;await pending;
   assert.equal((await rows('SELECT count(*)::int AS n FROM evaluations WHERE answer_attempt_id IN (SELECT id FROM answer_attempts WHERE session_id=$1)',[s._id]))[0].n,0);assert.equal((await rows('SELECT count(*)::int AS n FROM reward_ledger WHERE session_id=$1',[s._id]))[0].n,0);
   if(condition==='delete'){assert.equal(await f.repo.findById(s._id),null);assert.equal(await op(a.id),undefined);}
   else assert.equal((await op(a.id)).status,'terminal_failed');
   if(condition==='withdraw')await f.query("UPDATE sources SET state='enabled' WHERE id=$1",[f.source]);
 }
});
test('an expired worker that later returns cannot overwrite the replacement lease/result',async()=>{
 const s=await f.active(),a=await submit(s),old=worker();let release;f.state.gate=new Promise(r=>{release=r;pendingReleases.push(r);});const before=f.state.calls;
 const late=old.process(a.id);await until(()=>f.state.calls>before,'old provider request');await old.stop(true);workers=workers.filter(w=>w!==old);
 f.state.gate=null;const replacement=worker();await replacement.tick();await f.query("UPDATE durable_operations SET next_retry_at=now()-interval '1 second' WHERE id=$1",[a.id]);await replacement.process(a.id);
 release();await late;assert.equal((await op(a.id)).status,'succeeded');assert.equal((await op(a.id)).total_attempts,2);
 assert.equal((await rows('SELECT count(*)::int AS n FROM evaluations WHERE answer_attempt_id IN (SELECT id FROM answer_attempts WHERE session_id=$1)',[s._id]))[0].n,1);
 assert.equal((await rows('SELECT count(*)::int AS n FROM reward_ledger WHERE session_id=$1',[s._id]))[0].n,1);
});
test('probe generation failure keeps its reservation and resumes exactly once',async()=>{
 const s=await f.active(),a=await submit(s);f.state.mode='missing';
 const failing=worker({beforeCommit:async op=>{if(op.operation_type==='follow-up')throw new (await import('../dist/runtime/contracts.js')).RuntimeFailure('provider_timeout',true);}});
 await failing.process(a.id);const probe=(await rows("SELECT * FROM durable_operations WHERE session_id=$1 AND operation_type='follow-up'",[s._id]))[0];
 await failing.process(probe.id);assert.equal((await f.repo.findById(s._id)).questions.length,3);assert.equal((await f.repo.findById(s._id)).questions[0].followUpPending,true);
 await f.query("UPDATE durable_operations SET next_retry_at=now()-interval '1 second' WHERE id=$1",[probe.id]);const recovered=worker();await recovered.process(probe.id);await recovered.process(probe.id);
 const saved=await f.repo.findById(s._id);assert.equal(saved.questions.length,4);assert.equal(saved.questions[0].followUpPending,false);assert.equal((await op(probe.id)).status,'succeeded');
});
test('genuine missing grounding commits an abstention that survives report recovery without provider substitution',async()=>{
 const s=await f.active({count:1}),a=await submit(s),w=worker(),before=f.state.calls;
 await f.query("UPDATE sources SET state='suspended' WHERE id=$1",[f.source]);
 try{await w.process(a.id);assert.equal(f.state.calls,before);const saved=await f.repo.findById(s._id);assert.equal(saved.questions[0].evaluation.status,'abstained');assert.equal(saved.overallScore,null);assert.equal(saved.runtimeState,'finishing');}
 finally{await f.query("UPDATE sources SET state='enabled' WHERE id=$1",[f.source]);}
 const restored=worker();await drain(s,restored);const view=await f.service.getSessionDetails(s._id,f.owner);assert.equal(view.status,'completed');assert.equal(view.questions[0].evaluation.technicalScore,null);assert.equal(view.overallScore,null);assert.equal(view.reviewedSummary.abstained,1);
});
test('cancellation/deletion clean private staged audio; no owned cascade changes shared knowledge',async()=>{
 const s=await f.active(),path=join(f.directory,'pending.wav');await writeFile(path,Buffer.from('RIFF private fixture'));
 const a=await f.service.submitSessionAnswer(s._id,f.owner,'0',null,null,path,null,io);const count=(await rows('SELECT count(*)::int AS n FROM question_versions'))[0].n;
 const media=(await rows('SELECT filename FROM staged_interview_media WHERE session_id=$1',[s._id]))[0].filename;
 await f.service.deleteInterviewSession(s._id,f.owner);assert.equal((await readdir(process.env.INTERVIEW_MEDIA_DIR)).includes(media),false);assert.equal(await op(a.id),undefined);
 assert.equal((await rows('SELECT count(*)::int AS n FROM question_versions'))[0].n,count);
});
