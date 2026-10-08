/** Phase 7 real SQL/Redis with FICTIONAL rubric/reference approvals, disposable only. */
import assert from 'node:assert/strict';
import {test,before,after} from 'node:test';
import {randomUUID,createHash} from 'node:crypto';
import {mkdtemp,writeFile,rm,readFile,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fixture} from './retrieval-fixture.mjs';
let f,q,repo,editor,service,evalService,ai,game,redis,knowledge,policy,directory,reference,source;
const owner=randomUUID(),other=randomUUID(),actor='fictional-rubric-human';
const events=[];const io={to:()=>({emit:(_event,data)=>events.push(data)})};
let calls=0,rewards=0,lastInput,fail=false,missing=false;
const baseResult=input=>({dimensions:{correctness:4,'concept-coverage':4,reasoning:3,'practical-application':2,'trade-off-awareness':1},concepts:input.rubric.concepts.map(c=>({id:c.id,judgment:missing?'missing':'satisfied',explanation:missing?'Concept not demonstrated':'Answer demonstrates concept',sourceIds:[c.sources[0]],span:missing?null:{artifact:'answer',start:0,end:Math.min(4,input.answer.length)}})),confidence:'high',abstained:false,reason:'',feedback:'Fixture feedback',communication:'Descriptive only',modelVersion:'fixture-model',promptVersion:'rubric-evaluator-v1'});
async function until(fn){for(let n=0;n<300;n++){if(await fn())return;await new Promise(r=>setTimeout(r,20));}throw new Error('Runtime did not finish');}
async function draft(version){return editor.createDraft({questionVersionId:version,concepts:[{key:'core-explanation',label:'Core mechanism',description:'Explain the observable technical mechanism',importance:1,required:true,sourceIds:[reference]}]});}
async function active({reviewed=true,count=3,coding=false}={}){
  const s=await repo.create({user:owner,role:'Backend Developer',level:'Junior',interviewType:'oral-only'});
  const versions=(await q("SELECT * FROM retrieval_entities WHERE purpose='question-selection' AND category=$2 ORDER BY entity_id LIMIT $1",[count,coding?'coding':'conceptual-oral'])).rows;
  const plan=await knowledge.createPlan(owner,{sessionId:s._id,contractVersion:'evaluation-fixture',plannerVersion:'fixture',taxonomyVersion:'junior-se-v1',corpusVersion:'fixture',role:'Backend Developer',mode:'oral',requestedCount:count,effectiveCount:count,requestedMinutes:30,effectiveMinutes:15,selectedCompetencies:['dsa']});
  s.questions=[];
  for(let i=0;i<versions.length;i++){
    const v=versions[i],d=await draft(v.entity_id),rubric=await editor.publish(d.id,d.hash,reviewed?actor:undefined);
    const item=await knowledge.addPlanItem(owner,{planId:plan,position:i,questionVersionId:v.entity_id,rubricVersionId:rubric,selectionReason:'FICTIONAL evaluation fixture',estimatedMinutes:3});
    s.questions.push({planItemId:item,questionVersionId:v.entity_id,primaryCompetency:v.primary_competency,questionText:v.text,questionType:coding?'coding':'oral',language:coding?'javascript':undefined,idealAnswer:'',isSubmitted:false,isEvaluated:false});
  }
  await q("UPDATE sessions SET interview_plan_id=$2,scoring_version='rubric-v1' WHERE id=$1",[s._id,plan]);s.scoringVersion='rubric-v1';s.planId=plan;s.status='in-progress';await repo.save(s);return s;
}
before(async()=>{
 f=await fixture();q=f.query;
 process.env.REDIS_URL='redis://127.0.0.1:16379/14';
 ({sessionRepository:repo}=await import('../dist/models/Session.js'));
 ({rubricEditor:editor}=await import('../dist/evaluation/rubrics.js'));
 ({sessionService:service}=await import('../dist/services/sessionService.js'));
 ({evaluationService:evalService}=await import('../dist/evaluation/service.js'));
 ({aiService:ai}=await import('../dist/services/aiService.js'));
 ({gamificationService:game}=await import('../dist/services/gamificationService.js'));
 ({default:redis}=await import('../dist/config/redisConfig.js'));
 ({knowledgeRepository:knowledge}=await import('../dist/repositories/knowledgeRepository.js'));
 policy=await import('../dist/evaluation/contracts.js');
 await redis.ping();
 for(const id of [owner,other])await q('INSERT INTO users(id,name,email) VALUES($1,$2,$3)',[id,'FICTIONAL fixture',id+'@example.invalid']);
 await f.r.registerReviewer(actor,'FICTIONAL HUMAN ONLY IN DISPOSABLE TEST DB','human');
 directory=await realpath(await mkdtemp(join(tmpdir(),'techvera-rubrics-')));
 const path=join(directory,'reference.json');const bytes=Buffer.from(JSON.stringify({schemaVersion:'local-v1',documents:[{key:'fixture-technical-ref',title:'FICTIONAL fixture reference',text:'A queue removes values in first-in first-out order. Explain the causal removal mechanism with a concrete example.',questions:[],experience:null}]}));await writeFile(path,bytes);
 const contract=JSON.parse(await readFile(new URL('../data/ingestion/seed-source-contract.json',import.meta.url),'utf8'));contract.allowedInputs=[path];contract.approvedInputHashes=[createHash('sha256').update(bytes).digest('hex')];contract.permissionEvidence='FICTIONAL test assumption only; no real human approval or external rights asserted';contract.licenseId='disposable-test-only';contract.attribution='Fictional fixture';
 source=await f.r.registerSource('fictional-reference','FICTIONAL fixture',contract);await f.r.approveSource(source,actor,(await f.r.inspectSource(source)).contractHash);
 const [record]=await f.r.ingestFile(source,path);await f.r.approveTechnicalReference(record,actor,(await f.r.inspect(record)).contentHash);await f.r.publishDocument(record);
 reference=(await q("SELECT entity_id FROM retrieval_entities WHERE purpose='technical-grounding'")).rows[0].entity_id;
 ai.evaluateRubric=async input=>{calls++;lastInput=input;if(fail)throw new Error('FICTIONAL provider failure');return baseResult(input);};
 ai.generateFollowUp=async()=>({question:'Explain the missing concept with an example',ideal_answer:'Must not be exposed',question_type:'oral'});
 const add=game.addXP.bind(game);game.addXP=async(...args)=>{rewards++;return add(...args);};
});
after(async()=>{try{if(redis){await redis.del(`user:${owner}:xp_buffer`);redis.disconnect();}if(directory)await rm(directory,{recursive:true,force:true});}finally{if(f)await f.cleanup();}});
test('migration 007 present; draft, provisional and hash-bound reviewed promotion stay distinct',async()=>{
 assert.equal((await q('SELECT count(*)::int AS n FROM schema_migrations')).rows[0].n,11);
 const version=(await q("SELECT entity_id FROM retrieval_entities WHERE purpose='question-selection' LIMIT 1")).rows[0].entity_id;
 const d=await draft(version);assert.equal((await editor.inspect(d.id)).content_hash,d.hash);
 const oversized=await editor.createDraft({questionVersionId:version,concepts:['one','two'].map(key=>({key,label:key,description:'Bounded fixture',importance:1,required:true,sourceIds:Array.from({length:6},()=>randomUUID())}))});await assert.rejects(()=>editor.publish(oversized.id,oversized.hash),/rubric_reference_limit/);
 await assert.rejects(()=>editor.publish(d.id,'a'.repeat(64),actor),/rubric_hash_mismatch/);
 await assert.rejects(()=>editor.publish(d.id,d.hash,'model-reviewer'),/human_reviewer_required/);
 const provisional=await editor.publish(d.id,d.hash);assert.equal((await editor.load(version,provisional)).kind,'provisional');
 const known=await editor.publish(d.id,d.hash,actor);assert.equal((await editor.load(version,known)).kind,'known');assert.notEqual(known,provisional);
 const lineage=(await q('SELECT rubric_id,version FROM rubric_versions WHERE id=ANY($1::uuid[]) ORDER BY version',[[provisional,known]])).rows;assert.equal(lineage[0].rubric_id,lineage[1].rubric_id);assert.equal(lineage[1].version,lineage[0].version+1);
 await assert.rejects(()=>q("UPDATE rubric_drafts SET content='{}' WHERE id=$1",[d.id]),e=>e.code==='23514');
 await assert.rejects(()=>q("UPDATE expected_concepts SET description='new' WHERE rubric_version_id=$1",[known]),e=>e.code==='23514');
 await assert.rejects(()=>q('DELETE FROM rubric_review_approvals WHERE rubric_version_id=$1',[known]),e=>e.code==='23514');
});
test('typed provider failure remains retryable, zero score/reward; concurrent retry commits one result/reward/socket',async()=>{
 const s=await active();const r0=rewards;fail=true;events.length=0;
 await service.submitSessionAnswer(s._id,owner,'0',null,null,null,null,io,'FIFO explained');
 await until(async()=>(await repo.findById(s._id)).questions[0].processingError);
 assert.equal((await repo.findById(s._id)).questions[0].isSubmitted,false);assert.equal(rewards,r0);
 assert.equal((await q('SELECT count(*)::int AS n FROM evaluations e JOIN answer_attempts a ON a.id=e.answer_attempt_id WHERE a.session_id=$1',[s._id])).rows[0].n,0);
 fail=false;calls=0;events.length=0;
 const runs=await Promise.allSettled([1,2,3].map(()=>service.submitSessionAnswer(s._id,owner,'0',null,null,null,null,io,'FIFO explained')));
 assert.equal(runs.filter(r=>r.status==='fulfilled').length,1);
 await until(async()=>(await repo.findById(s._id)).questions[0].isEvaluated);
 assert.equal(calls,1);assert.equal(rewards,r0+1);
 const saved=await repo.findById(s._id),e=saved.questions[0].evaluation;assert.equal(e.rubricStatus,'reviewed');assert.equal(e.evaluatorConfidence,'high');assert.equal(e.technicalScore,86.3);assert.equal(saved.questions[0].idealAnswer,'');
 assert.equal((await q('SELECT count(*)::int AS n FROM evaluation_evidence WHERE evaluation_id=$1',[e.id])).rows[0].n,1);
 const attempts=(await q('SELECT status,answer_text FROM answer_attempts WHERE session_id=$1 ORDER BY attempt',[s._id])).rows;assert.deepEqual(attempts.map(a=>a.status),['failed','evaluated']);assert.equal(attempts[1].answer_text,'FIFO explained');
 await until(()=>events.some(e=>e.status==='evaluation completed'));assert.deepEqual(events.map(e=>e.status),['AI_EVALUATING','evaluation completed']);
 await assert.rejects(()=>service.submitSessionAnswer(s._id,other,'1',null,null,null,null,io,'FIFO'),/Session not found/);
});
test('provisional output cannot be high or enter reviewed aggregate',async()=>{const s=await active({reviewed:false});await service.submitSessionAnswer(s._id,owner,'0',null,null,null,null,io,'FIFO');await until(async()=>(await repo.findById(s._id)).questions[0].isEvaluated);const saved=await repo.findById(s._id);assert.equal(saved.questions[0].evaluation.evaluatorConfidence,'medium');assert.equal(saved.reviewedSummary.technicalScore,null);assert.equal(saved.overallScore,null);});
test('missing rubric/grounding saves abstention, never a legacy substitution',async()=>{const s=await active();const original=s.questions[0];await q("UPDATE rubric_versions SET status='retired' WHERE id=(SELECT rubric_version_id FROM plan_items WHERE id=$1)",[original.planItemId]);await service.submitSessionAnswer(s._id,owner,'0',null,null,null,null,io,'FIFO');await until(async()=>(await repo.findById(s._id)).questions[0].isEvaluated);const saved=await repo.findById(s._id);assert.equal(saved.questions[0].evaluation.status,'abstained');assert.equal(saved.questions[0].evaluation.technicalScore,null);assert.equal(saved.questions[0].technicalScore,undefined);});
test('reevaluation revision preserves historical grade and rejects forged score/evidence/lineage',async()=>{
 const s=await active();await service.submitSessionAnswer(s._id,owner,'0',null,null,null,null,io,'FIFO');await until(async()=>(await repo.findById(s._id)).questions[0].isEvaluated);const saved=await repo.findById(s._id),e=saved.questions[0].evaluation;
 const stored=await knowledge.findEvaluationForUser(e.id,owner);assert.equal(await knowledge.findEvaluationForUser(e.id,other),null);
 await assert.rejects(()=>q('UPDATE evaluations SET technical_score=1 WHERE id=$1',[e.id]),x=>x.code==='23514');
 await assert.rejects(()=>q("UPDATE answer_attempts SET answer_text='Changed' WHERE id=$1",[e.answerAttemptId]),x=>x.code==='23514');
 await assert.rejects(()=>q("UPDATE evaluation_evidence SET explanation='Changed' WHERE evaluation_id=$1",[e.id]),x=>x.code==='23514');
 const input={answerAttemptId:e.answerAttemptId,rubricVersionId:e.rubricVersionId,scoringPolicyVersion:'rubric-v1',revision:2,supersedesId:e.id,status:'abstained',evaluatorConfidence:'low',reasonCodes:['ambiguous'],rubricKindSnapshot:'reviewed',feedback:'Revision abstains'};
 const revision=await knowledge.recordEvaluation(owner,input);assert.notEqual(revision,e.id);assert.equal((await knowledge.findEvaluationForUser(e.id,owner)).technical_score,stored.technical_score);
 await assert.rejects(()=>knowledge.recordEvaluation(other,{...input,revision:3}),/Owned answer/);
 await assert.rejects(()=>knowledge.recordEvaluation(owner,{...input,status:'succeeded',technicalScore:100,evaluatorConfidence:'high',dimensions:{correctness:4}}),x=>x.code==='23514');
 await assert.rejects(()=>knowledge.recordEvaluation(owner,{...input,revision:3,supersedesId:revision,status:'succeeded',technicalScore:100,evaluatorConfidence:'high',dimensions:Object.fromEntries(Object.keys(policy.WEIGHTS).map(k=>[k,4]))}),x=>x.code==='23514');
 const beforeRewards=rewards;const revised=await evalService.reevaluate(owner,e.answerAttemptId);assert.notEqual(revised.id,e.id);assert.equal(rewards,beforeRewards);assert.equal((await repo.findById(s._id)).questions[0].evaluation.id,e.id);assert.equal((await knowledge.findEvaluationForUser(revised.id,owner)).revision,3);
});
test('concept-driven probes reserve at most two and never follow up a follow-up',async()=>{
 const s=await active();missing=true;
 for(let i=0;i<3;i++){await service.submitSessionAnswer(s._id,owner,String(i),null,null,null,null,io,'Partial answer');await until(async()=>{const x=await repo.findById(s._id);return x.questions[i].isEvaluated && !x.questions[i].followUpPending;});}
 const saved=await repo.findById(s._id);assert.equal(saved.questions.length,5);assert.ok(saved.questions[3].followUpConceptId);assert.ok(saved.questions[3].parentEvaluationId);assert.equal(saved.questions[3].idealAnswer,'');
 await service.submitSessionAnswer(s._id,owner,'3',null,null,null,null,io,'Partial answer');await until(async()=>(await repo.findById(s._id)).questions[3].isEvaluated);const after=await repo.findById(s._id);assert.equal(after.questions.length,5);assert.equal(after.questions[3].evaluation.rubricStatus,'provisional');missing=false;
});
test('actual coding pipeline preserves hard execution failure against provider prose',async()=>{const s=await active({coding:true});const code='function solution(){throw new Error();}';await evalService.recordExecution(s._id,owner,0,code,'javascript','failed');await service.submitSessionAnswer(s._id,owner,'0',code,'javascript',null,null,io,'FIFO explained');await until(async()=>(await repo.findById(s._id)).questions[0].isEvaluated);const e=(await repo.findById(s._id)).questions[0].evaluation;assert.equal(e.dimensions.correctness,0);assert.equal(e.evaluatorConfidence,'medium');assert.equal(e.objective.status,'failed');assert.ok(e.reasons.includes('objective_failure'));assert.equal(e.technicalScore,41.3);});
test('server execution evidence matches exact code/language and distinguishes runtime from tests',async()=>{const s=await active();await evalService.recordExecution(s._id,owner,0,'console.log(1)','javascript','failed');assert.equal((await evalService.objective(s._id,0,'console.log(1)','javascript')).status,'failed');assert.equal((await evalService.objective(s._id,0,'console.log(2)','javascript')).status,'unavailable');assert.equal((await evalService.objective(s._id,0,'console.log(1)','python')).status,'unavailable');await evalService.recordExecution(s._id,owner,0,'console.log(1)','javascript','passed');assert.equal((await evalService.objective(s._id,0,'console.log(1)','javascript')).kind,'runtime');});
test('withdrawal during computation rejects stale persistence and later GET redacts score; owned deletion cascades history',async()=>{
 const s=await active();await service.submitSessionAnswer(s._id,owner,'0',null,null,null,null,io,'FIFO');await until(async()=>(await repo.findById(s._id)).questions[0].isEvaluated);const e=(await repo.findById(s._id)).questions[0].evaluation;
 const inFlight=await repo.findById(s._id);inFlight.questions[1].isSubmitted=true;await repo.save(inFlight);const prepared=await evalService.prepare(s._id,owner,1,'FIFO','');const computed=await evalService.compute(prepared);
 await q("UPDATE sources SET state='suspended' WHERE id=$1",[source]);await assert.rejects(()=>evalService.commit(owner,prepared.attempt,computed.view,computed.provider),/withdrawn/);await evalService.fail(prepared.attempt,owner);assert.equal(await editor.load(s.questions[0].questionVersionId,e.rubricVersionId),null);
 const view=await service.getSessionDetails(s._id,owner);assert.equal(view.questions[0].evaluation.technicalScore,null);assert.equal(view.questions[0].evaluation.concepts.length,0);assert.deepEqual(view.questions[0].evaluation.dimensions,{});
 const listed=(await repo.listForUser(owner,1,100)).find(x=>x._id===s._id);assert.equal(listed.overallScore,null);
 await q("UPDATE sessions SET status='completed' WHERE id=$1",[s._id]);const completed=(await repo.listCompletedForUser(owner)).find(x=>x._id===s._id);assert.equal(completed.reviewedSummary.eligible,0);assert.equal(completed.overallScore,null);
 await repo.delete(await repo.findById(s._id));assert.equal((await q('SELECT count(*)::int AS n FROM evaluations WHERE id=$1',[e.id])).rows[0].n,0);assert.equal((await q('SELECT count(*)::int AS n FROM answer_attempts WHERE session_id=$1',[s._id])).rows[0].n,0);assert.ok((await q('SELECT id FROM rubric_versions WHERE id=$1',[e.rubricVersionId])).rows.length);
});
