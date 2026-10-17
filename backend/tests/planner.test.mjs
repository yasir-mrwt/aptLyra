/** Disposable actual pgvector/persistence/auth APIs. Encoder is a deterministic fixture, not a relevance measurement. */
import assert from 'node:assert/strict';
import {before,after,test} from 'node:test';
import {randomUUID,createHash} from 'node:crypto';
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
 // The seed artifact has source approval only. Give eight isolated questions a complete, explicitly fictional
 // AI proposal and hash-bound test reviewer decision, then add fixture evidence and scoring packets.
 const reviewerId='planner-test-reviewer',sourceId=randomUUID(),documentId=randomUUID(),versionId=randomUUID(),chunkId=randomUUID(),recordId=randomUUID();
 await f.query("INSERT INTO ingestion_reviewers(id,display_name,kind,user_id) VALUES($1,'Fictional planner test reviewer','human',$2)",[reviewerId,owner]);
 await f.query("UPDATE users SET app_role='reviewer' WHERE id=$1",[owner]);
 const permissionHash=createHash('sha256').update('fictional planner fixture permission').digest('hex');
 await f.query(`INSERT INTO sources(id,stable_key,source_type,title,license_id,terms_revision,policy_revision,permission_status,permission_evidence,
   attribution,review_status,state,reviewed_by,reviewed_at,adapter_name,permission_basis,permission_evidence_hash,model_processing_allowed)
   VALUES($1,'fixture:planner-reference','licensed-reference','Fictional planner reference','fixture-license','fixture-terms-v1','fixture-policy-v1',
   'permitted','Fictional disposable permission; no external source','Disposable test fixture','approved','enabled',$2,now(),'operator-import','fixture-only',$3,true)`,
 [sourceId,reviewerId,permissionHash]);
 await f.query("INSERT INTO ingestion_adapters(source_id,adapter_id,adapter_version,contract) VALUES($1,'operator-import','1','{\"fixture\":false}')",[sourceId]);
 await f.query('INSERT INTO source_documents(id,source_id,external_key) VALUES($1,$2,$3)',[documentId,sourceId,'planner-reference-v1']);
 const referenceText='Fictional reference text for deterministic planner readiness tests.';
 const referenceHash=createHash('sha256').update(referenceText).digest('hex');
 await f.query(`INSERT INTO source_document_versions(id,document_id,version,title,fetched_at,reviewed_at,reviewed_by,content_hash,normalized_text,
   policy_revision,permission_status,review_status,quality,pii_status,confidentiality_status,status)
   VALUES($1,$2,1,'Fictional planner reference',now(),now(),$3,$4,$5,'fixture-policy-v1','permitted','approved','technical-reference','clear','clear','published')`,
 [versionId,documentId,reviewerId,referenceHash,referenceText]);
 await f.query(`INSERT INTO source_chunks(id,document_version_id,chunk_index,excerpt,content_hash,chunker_version,section,start_offset,end_offset,status)
   VALUES($1,$2,0,$3,$4,'fixture-v1','Planner tests',0,char_length($3),'active')`,[chunkId,versionId,referenceText,referenceHash]);
 await f.query(`INSERT INTO ingestion_records(id,source_id,document_version_id,input_hash,state,reviewed_by,reviewed_at)
   VALUES($1,$2,$3,$4,'published',$5,now())`,[recordId,sourceId,versionId,referenceHash,reviewerId]);
 const dsa=(await f.query(`SELECT entity_id FROM retrieval_entities WHERE purpose='question-selection' AND primary_competency LIKE 'dsa.%' ORDER BY category,difficulty,entity_id LIMIT 4`)).rows;
 const programming=(await f.query(`SELECT entity_id FROM retrieval_entities WHERE purpose='question-selection' AND primary_competency LIKE 'programming.%' ORDER BY category,difficulty,entity_id LIMIT 4`)).rows;
 const ready=[...dsa,...programming];
 assert.equal(ready.length,8);
 const {contentEditorial}=await import('../dist/contentIntelligence/editorial.js');
 const {aiService}=await import('../dist/services/aiService.js');const originalDraft=aiService.draftRubric,originalReview=aiService.reviewEditorialCandidate;
 aiService.reviewEditorialCandidate=async input=>({contractVersion:'editorial-review-v1',relevance:'relevant',verdict:'recommend-approve',
   taxonomy:input.allowedCompetencies[0],category:input.allowedCategories[0],difficulty:'standard',duplicateWarning:false,wordingIssues:[],
   correctedQuestion:null,technicalCorrectness:'uncertain',expectedConcepts:['Explain the central mechanism'],evidenceStatus:'missing',
   evidenceSummary:'Fictional disposable planner fixture.',rubricGuidance:['Check correctness and trade-offs.'],confidence:'medium',flags:['needs-human-review']});
 aiService.draftRubric=async(_question,refs)=>({concepts:[{key:'fixture-mechanism',label:'Fixture mechanism',description:'Fictional deterministic planner fixture',importance:100,required:true,sourceIds:[refs[0].id]}]});
 for(const q of ready){
   const seed=(await f.query(`SELECT c.id,c.content_hash FROM ingestion_candidates c WHERE c.question_version_id=$1 AND c.state='published'`,[q.entity_id])).rows[0];
   assert.ok(seed,'planner fixture question must map to a published seed candidate');
   const proposal=await contentEditorial.reviewCandidate(owner,seed.id,seed.content_hash);
   await contentEditorial.approveSeedQuestion(owner,seed.id,seed.content_hash,proposal.packet_hash);
   await contentEditorial.addTechnicalReference(owner,q.entity_id,chunkId);
   const draft=await contentEditorial.draftScoringPacket(owner,q.entity_id);
   await contentEditorial.approveScoringPacket(owner,draft.id,draft.hash);
 }
 aiService.draftRubric=originalDraft;aiService.reviewEditorialCandidate=originalReview;
 const {RetrievalService}=await import('../dist/retrieval/service.js'),{PlannerService,plannerService}=await import('../dist/planner/service.js');
 const retriever=new RetrievalService(fake);service=new PlannerService(retriever);
 const preview=service.preview.bind(service);service.preview=async(...args)=>{try{return await preview(...args);}catch(e){if(e.cause)console.error("Planner fixture cause:",e.cause);throw e;}};
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
test('preview pins its selected order and reasons across reloads without consuming history',async()=>{
 const p=await service.preview(owner,setup());assert.deepEqual((await service.get(owner,p.id)).items,p.items);assert.equal(p.selection.repeatedCount,0);
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
test('retrieval model outage uses only unchanged hash-bound reviewed seed questions with null semantic similarity',async()=>{
 const {RetrievalService}=await import('../dist/retrieval/service.js'),{PlannerService}=await import('../dist/planner/service.js');
 const {RetrievalFailure}=await import('../dist/retrieval/contracts.js');
 const fallback=new PlannerService(new RetrievalService({embed:async()=>{throw new RetrievalFailure('model_unavailable');}}));
 const p=await fallback.preview(owner,setup({competencies:['dsa'],mode:'mixed',count:3}));assert.ok(p.canConfirm);assert.ok(p.items.every(i=>i.selectionReason==='reviewed_seed'&&i.inventoryClass==='TRUSTED_BASELINE'));
 const similarities=(await f.query('SELECT similarity FROM retrieval_results WHERE retrieval_id=ANY($1::uuid[])',[p.items.map(i=>i.retrievalId)])).rows;
 assert.ok(similarities.every(r=>r.similarity===null));assert.ok(p.shortages.includes('reviewed_fallback_used'));
});
test('healthy trusted ranking covers three exact starters without structured outage fallback',async()=>{
 const {PlannerService}=await import('../dist/planner/service.js');
 const calls=[],ranker=new (await import('../dist/retrieval/service.js')).RetrievalService({embed:async texts=>({...MODEL,processingMs:0,vectors:texts.map(()=>[-1,...Array(383).fill(0)])})});
 const seedRetriever={retrieveQuestions:async request=>{calls.push(request);return ranker.retrieveQuestions(request);}};
 const p=await new PlannerService(seedRetriever).preview(owner,setup({competencies:['programming'],mode:'coding',count:3}));
 assert.equal(p.canConfirm,true);assert.equal(p.items.length,3);assert.ok(p.items.every(i=>i.inventoryClass==='TRUSTED_BASELINE'));
 assert.equal(calls.length,1,'one complete root pool replaces repeated stage retrieval');
 assert.ok(calls.every(c=>c.plannerPool&&c.filters.interviewEligible));
 assert.ok(calls.every(c=>c.strategy!=='structured-seed'));
});
test('difficulty fallback records reasons while the trusted baseline does not need dynamic scoring readiness',async()=>{
 const p=await service.preview(owner,setup({competencies:['dsa'],mode:'oral',difficulty:'standard',count:5}));
 assert.ok(p.items.some(i=>i.selectionReason==='adjacent_difficulty'));
 assert.ok(p.items.every(i=>i.inventoryClass==='TRUSTED_BASELINE'));
 assert.ok(p.shortages.includes('difficulty_target_shortage'));
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
 const p=await service.preview(owner,setup({competencies:['oop'],mode:'oral',count:10}));
 const active=await service.preview(owner,setup({competencies:['oop'],mode:'oral',count:10}));await service.confirm(owner,{planId:active.id,revision:1});
 const q=active.items.find(i=>p.items.some(j=>j.questionVersionId===i.questionVersionId)).questionVersionId;
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


test('unclassified unindexed content cannot block the intact trusted interview corpus',async()=>{
 const rollback=new Error('rollback isolated readiness fixture');
 await assert.rejects(()=>f.withDatabaseLock('fixture:unclassified-index',async()=>{
  const row=(await f.query(`SELECT e.entity_id,c.record_id FROM retrieval_entities e JOIN ingestion_candidates c ON c.question_version_id=e.entity_id
    WHERE e.purpose='question-selection' AND e.primary_competency LIKE 'os.%' LIMIT 1`)).rows[0];
  // Simulate a non-baseline published import in this rolled-back disposable transaction.
  await f.query("UPDATE ingestion_records SET input_hash=$2 WHERE id=$1",[row.record_id,'f'.repeat(64)]);
  await f.query("UPDATE embedding_metadata SET status='staged' WHERE question_version_id=$1",[row.entity_id]);
  assert.equal((await f.query('SELECT inventory_class FROM content_question_readiness WHERE question_version_id=$1',[row.entity_id])).rows[0].inventory_class,null);
  const plan=await service.preview(owner,setup({competencies:['programming'],mode:'coding',count:3}));
  assert.equal(plan.effectiveCount,3);assert.equal(plan.canConfirm,true);
  assert.ok(plan.items.every(item=>item.inventoryClass==='TRUSTED_BASELINE'&&item.questionVersionId!==row.entity_id));
  throw rollback;
 }),error=>error===rollback);
});

test('history policies reserve only confirmed assignments, isolate users, disclose exhaustion and serialize strict confirmation',async()=>{
 const a=randomUUID(),b=randomUUID();
 for(const id of [a,b])await f.query('INSERT INTO users(id,name,email) VALUES($1,$2,$3)',[id,'Repeat policy fixture',id+'@example.invalid']);
 const s=setup({competencies:['programming'],mode:'coding',count:3,minutes:45,repeatPolicy:'only-new'});
 const first=await service.preview(a,s),parallel=await service.preview(a,s);
 assert.equal(first.selection.newCount,3);assert.equal(first.selection.repeatedCount,0);
 const outcomes=await Promise.allSettled([service.confirm(a,{planId:first.id,revision:1}),service.confirm(a,{planId:parallel.id,revision:1})]);
 assert.equal(outcomes.filter(r=>r.status==='fulfilled').length,1);
 assert.equal(outcomes.find(r=>r.status==='rejected').reason.code,'repeat_history_changed');
 const winner=outcomes[0].status==='fulfilled'?first:parallel;
 const again=await service.confirm(a,{planId:winner.id,revision:1});assert.equal(again.sessionId,winner.sessionId);
 const shortage=await service.preview(a,s);assert.equal(shortage.canConfirm,false);assert.equal(shortage.effectiveCount,0);
 assert.ok(shortage.shortages.includes('only_new_shortage:0:3'));assert.deepEqual(shortage.setup.competencies,s.competencies);
 await assert.rejects(()=>service.confirm(a,{planId:shortage.id,revision:1}),e=>e.code==='plan_not_ready');
 const independent=await service.preview(b,s);assert.equal(independent.canConfirm,true);assert.equal(independent.selection.newCount,3);
 const revision=await service.preview(a,{...s,repeatPolicy:'revision'});assert.equal(revision.selection.repeatedCount,3);assert.ok(revision.items.every(i=>i.repeat.reason==='revision_due'));
 const fresh=await service.preview(a,{...s,repeatPolicy:'fresh-first'});assert.equal(fresh.selection.repeatedCount,3);
 const capabilities=await request(app).get('/api/interview-plans/capabilities').set('Cookie',await cookie(a));
 assert.equal(capabilities.body.savedSetup.repeatPolicy,'fresh-first');assert.equal(capabilities.body.savedSetup.selection,undefined);
 assert.equal(JSON.stringify(fresh).includes('duplicate:'),false);
 const {RetrievalService}=await import('../dist/retrieval/service.js'),{PlannerService}=await import('../dist/planner/service.js');
 const offline=new PlannerService(new RetrievalService({embed:async()=>{throw new Error('controlled embedding outage');}}));
 const fallback=await offline.preview(a,s);assert.equal(fallback.canConfirm,false);assert.equal(fallback.effectiveCount,0);
 assert.ok(fallback.shortages.some(s=>s.startsWith('retrieval_unavailable:')));
});

test('fresh allocation finds unseen feasible combinations rather than greedy repeats; strict reports two of three',async()=>{
 const {weightCandidates,identityKeys,exposureFor}=await import('../dist/planner/history.js');
 const s=validateSetup(setup({competencies:['dsa'],mode:'oral',count:3,minutes:30}));
 const cs=[candidate('dsa',1),candidate('dsa',2),candidate('dsa',3,'easy'),candidate('dsa',4,'easy')];
 cs[0].hit.questionId='original';cs[0].hit.text='Original question';cs[1].hit.text='Different question';
 const hist=[{assignment:'past',at:1,keys:identityKeys({questionId:'original',text:'Original question',familyKey:cs[0].hit.familyKey,group:cs[0].group}),weakness:0}];
 const weighted=weightCandidates(cs,hist,'fresh-first',100,()=>0.5);
 // Exact difficulty needs two standard: one repeat is unavoidable under that constraint.
 const first=allocate(s,weighted);assert.equal(first.items.filter(c=>c.history.count).length,1);
 const extra=candidate('dsa',5);extra.hit.text='Another fresh question';
 const allFresh=allocate(s,weightCandidates([...cs,extra],hist,'fresh-first',100,()=>0.5));assert.equal(allFresh.items.filter(c=>c.history.count).length,0);
 const strict=allocate({...s,repeatPolicy:'only-new'},weightCandidates(cs.slice(0,3),hist,'only-new',100,()=>0.5));
 assert.equal(strict.items.length,2);assert.equal(strict.canConfirm,false);assert.ok(strict.shortages.includes('only_new_shortage:2:3'));
 assert.equal(exposureFor(identityKeys({questionId:'original',familyKey:'new-family',text:'Changed version'}),hist).count,1);
 assert.equal(exposureFor(identityKeys({questionId:'new-id',familyKey:cs[0].hit.familyKey,text:'Changed wording'}),hist).count,1);
 assert.equal(exposureFor(identityKeys({text:'  ORIGINAL   question '}),hist).count,1);
 assert.equal(exposureFor(identityKeys({text:'Unrelated question'}),hist).count,0);
 const collision=[...cs,extra];collision[1]={...collision[1],group:extra.group};
 const unique=allocate(s,weightCandidates(collision,hist,'fresh-first'));assert.equal(new Set(unique.items.map(c=>c.group)).size,unique.items.length);
});

test('revision weights age and reviewed weakness; unscored exposures are neutral and fresh fallback is explicit',async()=>{
 const {weightCandidates,identityKeys}=await import('../dist/planner/history.js');
 const cs=[candidate('dsa',1),candidate('dsa',2),candidate('dsa',3,'easy')];
 const at=Date.now()-10*86400000;
 const histories=cs.map((c,i)=>({keys:identityKeys({familyKey:c.hit.familyKey}),assignment:String(i),at,weakness:i===0?0.8:0}));
 const weighted=weightCandidates(cs,histories,'revision',Date.now(),()=>0.5);
 assert.ok(weighted[0].history.priority>weighted[1].history.priority);assert.equal(weighted[1].history.priority,weighted[2].history.priority);
 const fresh=allocate(validateSetup(setup({competencies:['dsa'],mode:'oral',count:3,repeatPolicy:'revision'})),weightCandidates(cs,[],'revision'));
 assert.ok(fresh.shortages.includes('revision_fresh_fallback'));
 assert.throws(()=>validateSetup(setup({repeatPolicy:'anything'})));
});

test('fresh search backtracks across root/family conflicts and randomizes equivalent choices',async()=>{
 const {weightCandidates}=await import('../dist/planner/history.js');
 const s=validateSetup(setup({competencies:['dsa','programming'],mode:'oral',count:3}));
 const a=candidate('dsa',1),b=candidate('dsa',2),c=candidate('dsa',3,'easy'),d=candidate('programming',4);
 a.group=d.group='shared-duplicate';a.hit.familyKey=d.hit.familyKey='shared-family';
 const weighted=weightCandidates([a,b,c,d],[],'fresh-first',100,()=>0.5);
 const result=allocate(s,weighted);assert.equal(result.items.length,3);assert.equal(result.canConfirm,true);
 assert.ok(!result.items.includes(weighted[0]));assert.ok(result.items.every(c=>c.history.count===0));
 const pool=Array.from({length:6},(_,i)=>candidate('dsa',i,i<3?'standard':'easy'));
 const only=validateSetup(setup({competencies:['dsa'],mode:'oral',count:3}));
 let n=0;const left=allocate(only,weightCandidates(pool,[],'fresh-first',100,()=>++n/10));
 n=6;const right=allocate(only,weightCandidates(pool,[],'fresh-first',100,()=>--n/10));
 assert.notDeepEqual(left.items.map(c=>c.hit.questionVersionId),right.items.map(c=>c.hit.questionVersionId));
});

test('same-user successive Fresh first sessions exhaust compatible unseen questions before repeating',async()=>{
 const id=randomUUID();await f.query('INSERT INTO users(id,name,email) VALUES($1,$2,$3)',[id,'Back-to-back fixture',id+'@example.invalid']);
 const s=setup({competencies:['os','networks'],mode:'oral',count:3,minutes:30,repeatPolicy:'fresh-first'});
 const first=await service.preview(id,s);assert.equal(first.canConfirm,true);assert.equal(first.selection.newCount,3);
 await service.confirm(id,{planId:first.id,revision:1});
 const next=await service.preview(id,s);assert.equal(next.canConfirm,true);assert.equal(next.selection.newCount,3);
 assert.ok(next.items.every(i=>!first.items.some(j=>i.questionVersionId===j.questionVersionId)));
 const {selectionHistory}=await import('../dist/planner/history.js');
 const history=await selectionHistory(id);assert.ok(history.length===3 && history.every(h=>h.weakness===0));
});

test('repeat-budget search agrees with exhaustive feasible subsets, including repeats in the last slot',async()=>{
 for(let trial=0;trial<32;trial++){
  const cs=Array.from({length:6},(_,i)=>({...candidate('dsa',i,i<3?'standard':'easy'),history:{keys:['key'+i],count:(trial>>i)&1,lastAssigned:1,weakness:0,priority:(i*3+trial)%7}}));
  let minimum=Infinity;
  for(let a=0;a<cs.length;a++)for(let b=a+1;b<cs.length;b++)for(let c=b+1;c<cs.length;c++){
   const items=[cs[a],cs[b],cs[c]];
   if(items.filter(i=>i.hit.difficulty==='standard').length===2)minimum=Math.min(minimum,items.filter(i=>i.history.count).length);
  }
  const result=allocate(validateSetup(setup({competencies:['dsa'],mode:'oral',count:3,repeatPolicy:'fresh-first'})),cs);
  assert.equal(result.items.length,3);assert.equal(result.items.filter(i=>i.history.count).length,minimum,`trial ${trial}`);
 }
});

test('retained historical sessions exclude exact bank content without trusting legacy scores',async()=>{
 const id=randomUUID();await f.query('INSERT INTO users(id,name,email) VALUES($1,$2,$3)',[id,'Historical fixture',id+'@example.invalid']);
 const {sessionRepository}=await import('../dist/models/Session.js');
 const session=await sessionRepository.create({user:id,role:'Software Engineer',level:'Junior',interviewType:'coding-mix'});
 const bank=(await f.query("SELECT text FROM retrieval_entities WHERE purpose='question-selection' AND primary_competency LIKE 'programming.%' AND category='coding'")).rows;
 assert.equal(bank.length,3);
 session.status='completed';session.questions=bank.map(row=>({questionText:row.text,questionType:'coding',idealAnswer:'',technicalScore:1,isSubmitted:true,isEvaluated:true}));await sessionRepository.save(session);
 const p=await service.preview(id,setup({competencies:['programming'],mode:'coding',count:3,repeatPolicy:'only-new'}));
 assert.equal(p.canConfirm,false);assert.equal(p.effectiveCount,0);
 const {selectionHistory}=await import('../dist/planner/history.js');assert.ok((await selectionHistory(id)).every(h=>h.weakness===0));
});

test('activation starts server time once after confirmation; refresh and concurrent retry cannot extend it',async()=>{
 const p=await service.preview(other,setup({competencies:['os','networks'],mode:'oral',count:3,minutes:30,repeatPolicy:'revision'}));
 assert.equal(p.canConfirm,true);await service.confirm(other,{planId:p.id,revision:p.revision});
 const before=(await f.query('SELECT activation_required,activated_at FROM sessions WHERE id=$1',[p.sessionId])).rows[0];
 assert.equal(before.activation_required,true);assert.equal(before.activated_at,null);
 const {activateInterview}=await import('../dist/runtime/activation.js');
 await assert.rejects(()=>activateInterview(p.sessionId,owner),e=>e.status===404);
 const [a,b]=await Promise.all([activateInterview(p.sessionId,other),activateInterview(p.sessionId,other)]);
 assert.equal(a.activatedAt,b.activatedAt);assert.equal(a.deadline,b.deadline);
 const refreshed=await activateInterview(p.sessionId,other);assert.deepEqual(refreshed,a);
 assert.ok(Date.parse(a.deadline)>Date.parse(a.activatedAt));
});
