/** Disposable actual pgvector/persistence/auth APIs. Encoder is a deterministic fixture, not a relevance measurement. */
import assert from 'node:assert/strict';
import {before,after,test} from 'node:test';
import {randomUUID} from 'node:crypto';
import {fixture} from './retrieval-fixture.mjs';
import {allocate} from '../dist/planner/allocate.js';
import {validateSetup,adjacent,estimateMinutes} from '../dist/planner/contracts.js';
import {MODEL} from '../dist/retrieval/contracts.js';
let f,service,app,request,owner=randomUUID(),other=randomUUID(),saved;
const setup=(patch={})=>({role:'Software Engineer',level:'junior',taxonomyVersion:'junior-se-v1',competencies:['dsa','programming'],difficulty:'standard',mode:'mixed',count:5,minutes:45,language:'en',codeLanguage:'javascript',modifiers:{},...patch});
const fake={embed:async texts=>({...MODEL,processingMs:0,vectors:texts.map(()=>[1,...Array(383).fill(0)])})};
function candidate(root,i,difficulty='standard',category='conceptual-oral',reason='filtered_retrieval') {
 return {root,group:`${root}-${i}`,reason,minutes:estimateMinutes(category),hit:{questionVersionId:`${root}-${i}`,familyKey:`${root}-${i}`,difficulty,category,similarity:1}};
}
before(async()=>{
 f=await fixture({sourceKey:'techvera-junior-se-v1'});process.env.JWT_SECRET='phase6-auth-fixture-only';process.env.REDIS_URL='redis://127.0.0.1:16379/15';
 for(const id of [owner,other])await f.query('INSERT INTO users(id,name,email) VALUES($1,$2,$3)',[id,'Planner fixture',id+'@example.invalid']);
 const {embedCorpus}=await import('../dist/retrieval/corpus.js');await embedCorpus(fake);
 const {RetrievalService}=await import('../dist/retrieval/service.js'),{PlannerService,plannerService}=await import('../dist/planner/service.js');
 const retriever=new RetrievalService(fake);service=new PlannerService(retriever);
 // Actual authenticated router with controlled embedding computation only.
 plannerService.retriever=retriever;
 const express=(await import('express')).default,cookieParser=(await import('cookie-parser')).default;
 const router=(await import('../dist/routes/plannerRoutes.js')).default;
 app=express();app.use(express.json());app.use(cookieParser());app.use('/api/interview-plans',router);
 app.use((err,req,res,next)=>{void next;res.status(err.statusCode || err.status || 500).json({message:err.message});});
 request=(await import('supertest')).default;
});
after(async()=>{if(f){const redis=(await import('../dist/config/redisConfig.js')).default;await redis.quit();await f.cleanup();}});
async function cookie(id=owner) {return 'jwt='+(await import('jsonwebtoken')).default.sign({id},process.env.JWT_SECRET);}

test('strict supported setup rejects out-of-scope modes/roles/levels/competencies/count/time/language/modifiers and arbitrary IDs',()=>{
 assert.deepEqual(validateSetup(setup()).competencies,['dsa','programming']);
 for(const patch of [{role:'Architect'},{level:'senior'},{competencies:[]},{competencies:['dsa','dsa']},{competencies:['dsa','os','oop','programming','networks']},{competencies:['unknown']},{count:2},{count:11},{count:true},{minutes:14},{minutes:61},{minutes:NaN},{language:'fr'},{codeLanguage:'rust'},{mode:'company-specific'},{questionIds:[randomUUID()]},{modifiers:{resumeId:randomUUID()}},{modifiers:{jd:'text'}},{modifiers:{occurredAfter:'2026-02-30'}},{modifiers:{occurredAfter:'2026-10-01',occurredBefore:'2026-01-01'}}])assert.throws(()=>validateSetup(setup(patch)));
 assert.throws(()=>validateSetup(setup({count:3,competencies:['dsa','oop','os','networks']})));
 assert.throws(()=>validateSetup(setup({mode:'oral',modifiers:{designLite:true}})));
});
test('pure deterministic coverage round-robin, exact feasible 60/40 difficulty, stable order and no repeated families',()=>{
 const s=validateSetup(setup({mode:'oral',minutes:45}));const cs=['dsa','programming'].flatMap(root=>Array.from({length:6},(_,i)=>candidate(root,i,i<3?'standard':'easy')));
 const first=allocate(s,cs),second=allocate(s,[...cs].reverse());
 assert.deepEqual(first,second);assert.deepEqual(first.coverage,{dsa:3,programming:2});assert.deepEqual(first.difficultyDistribution,{easy:2,standard:3,stretch:0});
 assert.equal(new Set(first.items.map(c=>c.hit.familyKey)).size,5);assert.deepEqual(first.items.map(c=>c.root),['dsa','programming','dsa','programming','dsa']);
});
test('budget reduces count before coverage and rejects impossible minimum coverage',()=>{
 const cs=['dsa','programming'].flatMap(root=>Array.from({length:6},(_,i)=>candidate(root,i,i<3?'standard':'easy','coding')));
 const result=allocate(validateSetup(setup({mode:'coding',minutes:30})),cs);assert.equal(result.items.length,3);assert.equal(result.timeBudget.totalMinutes,30);assert.ok(Object.values(result.coverage).every(n=>n>0));
 const impossible=allocate(validateSetup(setup({mode:'coding',minutes:15})),cs);assert.equal(impossible.canConfirm,false);assert.equal(impossible.items.length,0);
 assert.equal(adjacent('easy'),'standard');assert.equal(adjacent('standard'),'easy');assert.equal(adjacent('stretch'),'standard');
});
test('mixed requires actual oral+code, design remains optional and duplicate groups cannot inflate coverage',()=>{
 const oral=Array.from({length:8},(_,i)=>candidate('dsa',i,i<4?'standard':'easy'));
 assert.equal(allocate(validateSetup(setup({competencies:['dsa']})),oral).canConfirm,false);
 const duplicates=oral.map(c=>({...c,group:'same-group'}));assert.equal(allocate(validateSetup(setup({mode:'oral',competencies:['dsa']})),duplicates).items.length,1);
});
test('owned preview persists complete plan/items/evidence; GET hides all question text and answers',async()=>{
 saved=await service.preview(owner,setup());assert.equal(saved.canConfirm,true);assert.equal(saved.plannerVersion,'deterministic-v1');assert.equal(saved.effectiveCount,5);
 assert.equal(saved.status,'ready');assert.equal(saved.revision,1);assert.ok(Object.values(saved.coverage).every(n=>n>0));
 assert.equal(saved.items.length,saved.effectiveCount);assert.equal(new Set(saved.items.map(i=>i.id)).size,saved.items.length);
 assert.ok(saved.items.every(i=>i.retrievalId && i.available && i.provenance.length));assert.ok(saved.timeBudget.totalMinutes<=45);
 assert.equal(JSON.stringify(saved).includes('questionText'),false);assert.equal(JSON.stringify(saved).includes('idealAnswer'),false);
 const session=(await f.query('SELECT * FROM sessions WHERE id=$1',[saved.sessionId])).rows[0];assert.deepEqual(session.questions,[]);assert.equal(session.status,'pending');
 const evidence=(await f.query('SELECT * FROM retrieval_evidence WHERE plan_id=$1',[saved.id])).rows;assert.ok(evidence.length>0);assert.ok(evidence.every(e=>e.user_id===owner && e.session_id===saved.sessionId && e.redacted_query===null));
 const loaded=await service.get(owner,saved.id);assert.deepEqual(loaded.items,saved.items);
 await assert.rejects(()=>service.get(other,saved.id),e=>e.status===404);
});
test('same setup and corpus select identical question versions/order/reasons across previews',async()=>{
 const p=await service.preview(owner,setup());assert.deepEqual(p.items.map(i=>[i.questionVersionId,i.selectionReason]),saved.items.map(i=>[i.questionVersionId,i.selectionReason]));
 assert.ok(p.items.every((i,n)=>i.id!==saved.items[n].id)); // IDs belong to each immutable owned plan.
});
test('complete 48-question preflight accepts supported three-question setup; absent/incomplete/model-mismatched corpus fails before session writes',async()=>{
 const counts=(await f.query(`SELECT (SELECT count(*)::int FROM retrieval_entities WHERE purpose='question-selection') AS entities,
   (SELECT count(*)::int FROM embedding_metadata WHERE status='active' AND purpose='question-selection') AS indexed`)).rows[0];
 assert.deepEqual(counts,{entities:48,indexed:48});
 const p=await service.preview(owner,setup({count:3,minutes:45}));
 assert.equal(p.canConfirm,true);assert.equal(p.effectiveCount,3);assert.ok(p.coverage.dsa>0 && p.coverage.programming>0);
 for(const [sql,code] of [
  ["UPDATE embedding_generations SET status='retired' WHERE status='active'",'corpus_unavailable'],
  ["UPDATE embedding_metadata SET status='staged' WHERE id=(SELECT id FROM embedding_metadata WHERE status='active' LIMIT 1)",'corpus_unavailable'],
  ["UPDATE embedding_generations SET model_revision='incompatible-fixture' WHERE status='active'",'model_mismatch']
 ])await assert.rejects(()=>f.withDatabaseLock('ingestion:editorial:v1',async()=>{
  const before=(await f.query('SELECT count(*)::int AS n FROM sessions')).rows[0].n;
  await f.query(sql);
  await assert.rejects(()=>service.preview(owner,setup({count:3})),e=>e.code===code && e.status===503);
  assert.equal((await f.query('SELECT count(*)::int AS n FROM sessions')).rows[0].n,before);
  throw new Error('rollback preflight simulation');
 }),/rollback preflight simulation/);
});
test('confirm is owned, revision-checked, idempotent and atomically projects server-selected stable items to existing runner',async()=>{
 await assert.rejects(()=>service.confirm(other,{planId:saved.id,revision:1}),e=>e.status===404);
 await assert.rejects(()=>service.confirm(owner,{planId:saved.id,revision:9}),e=>e.status===409);
 await assert.rejects(()=>service.confirm(owner,{planId:saved.id,revision:1,questionIds:[randomUUID()]}));
 const result=await service.confirm(owner,{planId:saved.id,revision:1});assert.equal(result.revision,2);
 assert.deepEqual(await service.confirm(owner,{planId:saved.id,revision:1}),result);
 const session=(await f.query('SELECT * FROM sessions WHERE id=$1',[saved.sessionId])).rows[0];assert.equal(session.status,'in-progress');
 assert.deepEqual(session.questions.map(q=>q.planItemId),saved.items.map(i=>i.id));assert.deepEqual(session.questions.map(q=>q.questionVersionId),saved.items.map(i=>i.questionVersionId));
 assert.ok(session.questions.every(q=>q.idealAnswer==='' && !q.isEvaluated));
});
test('company/date constraints survive every fallback and produce a non-confirmable persisted shortage',async()=>{
 const p=await service.preview(owner,setup({modifiers:{company:'No real company',occurredAfter:'2026-01-01'}}));assert.equal(p.effectiveCount,0);assert.equal(p.canConfirm,false);
 assert.ok(p.shortages.includes('company_date_evidence_unavailable_constraints_preserved'));assert.equal(p.setup.modifiers.company,'No real company');
 const evidence=(await f.query('SELECT filters FROM retrieval_evidence WHERE plan_id=$1',[p.id])).rows;
 assert.ok(evidence.length>0 && evidence.every(e=>e.filters.company==='No real company' && e.filters.occurredAfter==='2026-01-01'));
 await assert.rejects(()=>service.confirm(owner,{planId:p.id,revision:1}),e=>e.status===409);
});
test('retrieval model outage uses only unchanged reviewed approved templates with null semantic similarity',async()=>{
 const {RetrievalService}=await import('../dist/retrieval/service.js'),{PlannerService}=await import('../dist/planner/service.js');
 const {RetrievalFailure}=await import('../dist/retrieval/contracts.js');
 const fallback=new PlannerService(new RetrievalService({embed:async()=>{throw new RetrievalFailure('model_unavailable');}}));
 const p=await fallback.preview(owner,setup({competencies:['dsa'],mode:'mixed',count:3}));assert.ok(p.canConfirm);assert.ok(p.items.every(i=>i.selectionReason==='approved_template'));
 const similarities=(await f.query('SELECT similarity FROM retrieval_results WHERE retrieval_id=ANY($1::uuid[])',[p.items.map(i=>i.retrievalId)])).rows;
 assert.ok(similarities.every(r=>r.similarity===null));assert.ok(p.shortages.includes('reviewed_fallback_used'));
});
test('adjacent and reviewed-seed fallback explicitly record reasons and actual difficulty shortfall',async()=>{
 const p=await service.preview(owner,setup({competencies:['dsa'],mode:'oral',difficulty:'standard',count:5}));
 assert.ok(p.items.some(i=>i.selectionReason==='adjacent_difficulty'));assert.ok(p.items.some(i=>i.selectionReason==='reviewed_seed'));assert.ok(p.shortages.includes('difficulty_target_shortage'));
});
test('count/time/mode shortages preserve minimum competency coverage and cannot confirm an impossible plan',async()=>{
 const p=await service.preview(owner,setup({mode:'coding',count:4,minutes:15}));assert.equal(p.canConfirm,false);assert.equal(p.effectiveCount,0);assert.ok(p.shortages.includes('time_or_mode_coverage_shortage'));
});
test('stale corpus rejects confirmation without changing preview or session',async()=>{
 const p=await service.preview(owner,setup({mode:'oral',count:3}));
 await assert.rejects(()=>f.withDatabaseLock('ingestion:editorial:v1',async()=>{
  // Synthetic generation switch stays inside this deliberately rolled-back transaction.
  await f.query("UPDATE embedding_metadata SET status='staged' WHERE status='active'");
  await f.query("UPDATE embedding_generations SET status='retired' WHERE status='active'");
  await f.query("INSERT INTO embedding_generations(id,model_id,model_revision,dimension,normalization,embedding_version,entity_count,status) VALUES($1,$2,$3,384,'l2',$4,0,'active')",['corpus-'+'0'.repeat(64),MODEL.modelId,MODEL.modelRevision,MODEL.embeddingVersion]);
  await assert.rejects(()=>service.confirm(owner,{planId:p.id,revision:1}),e=>e.code==='stale_corpus');
  assert.deepEqual((await f.query('SELECT questions FROM sessions WHERE id=$1',[p.sessionId])).rows[0].questions,[]);
  throw new Error('rollback synthetic generation');
 }),/rollback synthetic generation/);
 const {PlannerService}=await import('../dist/planner/service.js');
 const bad=new PlannerService({retrieveQuestions:async()=>({outcome:'success',corpusGeneration:'corpus-'+'0'.repeat(64),operationId:randomUUID(),hits:[]})});
 await assert.rejects(()=>bad.preview(owner,setup()),e=>e.code==='stale_retrieval');
 assert.equal((await service.get(owner,p.id)).status,'ready');
 await assert.rejects(()=>f.withDatabaseLock('ingestion:editorial:v1',async()=>{
  await f.query("UPDATE embedding_metadata SET status='staged' WHERE question_version_id=$1",[p.items[0].questionVersionId]);
  assert.equal((await service.get(owner,p.id)).canConfirm,false);
  await assert.rejects(()=>service.confirm(owner,{planId:p.id,revision:1}),e=>e.code==='corpus_unavailable');
  throw new Error('rollback incomplete index');
 }),/rollback incomplete index/);
 await assert.rejects(()=>f.withDatabaseLock('ingestion:editorial:v1',async()=>{
  await f.query("UPDATE sources SET title='Changed attribution snapshot' WHERE id=$1",[f.sourceId]);
  assert.equal((await service.get(owner,p.id)).canConfirm,false);
  await assert.rejects(()=>service.confirm(owner,{planId:p.id,revision:1}),e=>e.code==='stale_retrieval');
  throw new Error('rollback changed provenance');
 }),/rollback changed provenance/);
});
test('database guards reject changed snapshot, item IDs/order, forged provenance and count/budget tampering',async()=>{
 await assert.rejects(()=>f.query("UPDATE interview_plans SET effective_count=1 WHERE id=$1",[saved.id]),e=>e.code==='23514');
 await assert.rejects(()=>f.query("UPDATE plan_items SET position=99 WHERE plan_id=$1",[saved.id]),e=>e.code==='23514');
 await assert.rejects(()=>f.query("UPDATE plan_items SET provenance_refs='[]' WHERE plan_id=$1",[saved.id]),e=>e.code==='23514');
});
test('actual authenticated preview/confirm/get routes reject missing auth and cross-user IDs; capability metadata truthful',async()=>{
 assert.equal((await request(app).post('/api/interview-plans/preview').send(setup())).status,401);
 const caps=await request(app).get('/api/interview-plans/capabilities').set('Cookie',await cookie());assert.equal(caps.status,200);assert.deepEqual(caps.body.companies,[]);assert.equal(caps.body.modifiers.resume,false);
 const preview=await request(app).post('/api/interview-plans/preview').set('Cookie',await cookie()).send(setup({mode:'oral',count:3}));assert.equal(preview.status,201);
 assert.equal((await request(app).get('/api/interview-plans/'+preview.body.id).set('Cookie',await cookie(other))).status,404);
 const c=await request(app).post('/api/interview-plans/confirm').set('Cookie',await cookie()).send({planId:preview.body.id,revision:preview.body.revision});assert.equal(c.status,200);assert.equal(c.body.sessionId,preview.body.sessionId);
 assert.equal((await request(app).post('/api/interview-plans/preview').set('Cookie',await cookie()).send({...setup(),questionIds:[randomUUID()]})).status,400);
});
test('owned draft/session deletion still cascades plans; legacy JSONB sessions remain unchanged',async()=>{
 const p=await service.preview(owner,setup({mode:'oral',count:3}));
 const {sessionService}=await import('../dist/services/sessionService.js');await sessionService.deleteInterviewSession(p.sessionId,owner);
 assert.equal((await f.query('SELECT count(*)::int AS n FROM interview_plans WHERE id=$1',[p.id])).rows[0].n,0);
 const {sessionRepository}=await import('../dist/models/Session.js');const old=await sessionRepository.create({user:owner,role:'Architect',level:'Senior',interviewType:'oral-only'});
 old.questions=[{questionText:'Historical question',questionType:'oral',idealAnswer:'Historical answer',isEvaluated:true,isSubmitted:true}];old.status='completed';await sessionRepository.save(old);
 const loaded=await sessionRepository.findByIdForUser(old._id,owner);assert.equal(loaded.planId,undefined);assert.deepEqual(loaded.questions,old.questions);
});
test('withdrawn preview items are redacted from fresh preview reads and cannot be confirmed',async()=>{
 const p=await service.preview(owner,setup({mode:'oral',count:3}));const q=p.items[0].questionVersionId;
 const active=await service.preview(owner,setup({mode:'oral',count:3}));await service.confirm(owner,{planId:active.id,revision:1});
 const record=(await f.query('SELECT id FROM ingestion_candidates WHERE question_version_id=$1',[q])).rows[0];await f.r.withdrawQuestion(record.id,'muhammad-yasir','phase6-withdrawal-check');
 const loaded=await service.get(owner,p.id);assert.equal(loaded.canConfirm,false);assert.ok(loaded.items.some(i=>!i.available && i.provenance.length===0));
 await assert.rejects(()=>service.confirm(owner,{planId:p.id,revision:1}),e=>e.code==='stale_retrieval');
 assert.deepEqual((await f.query('SELECT questions FROM sessions WHERE id=$1',[p.sessionId])).rows[0].questions,[]);
 const {sessionService}=await import('../dist/services/sessionService.js');
 const details=await sessionService.getSessionDetails(active.sessionId,owner);const index=details.questions.findIndex(i=>i.questionVersionId===q);
 assert.ok(index>=0);assert.equal(details.questions[index].evidenceUnavailable,true);assert.equal(details.questions[index].idealAnswer,'');
 assert.match(details.questions[index].questionText,/no longer available/);
 await assert.rejects(()=>sessionService.submitSessionAnswer(active.sessionId,owner,String(index),null,null,'unused',null,null),e=>e.status===409);
 // Historic persisted snapshot is retained; fresh serving is redacted.
 assert.equal((await f.query('SELECT questions FROM sessions WHERE id=$1',[active.sessionId])).rows[0].questions[index].evidenceUnavailable,undefined);
});
