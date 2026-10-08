/** One continuous deterministic Phase 8.5 source-to-report path in disposable local stores. */
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createHash,randomUUID} from 'node:crypto';
import {runtimeFixture,until} from './runtime-fixture.mjs';

const f=await runtimeFixture();
const hash=value=>createHash('sha256').update(value).digest('hex');
const questions=[
  'What does a hash table provide for a junior engineer?',
  'How do collisions affect a hash table lookup?',
  'When would an array be simpler than a hash table?',
  'How should a developer explain a basic lookup trade-off?',
  'What does a hash table provide for a junior engineer? (duplicate repost)',
];
const articleText=questions.join('\n');
const reference=f.reference;
const appServer=createServer((_req,res)=>{
  res.writeHead(200,{'content-type':'application/json','etag':'"phase85-source-v1"'});
  res.end(JSON.stringify({items:[{id:'integrated-report-1',title:'Fictional interview experience',text:articleText,
    url:'https://fixture.example.invalid/report/1',role:'Backend Developer',company:null,roundType:'technical',
    topics:['hash tables','lookup'],occurredOn:new Date().toISOString().slice(0,10)}]}));
});
let runtime,staleRuntime,releaseStale,sourceServerClosed=false;
const oldExtract=f.state.extractInterviewExperience;
const {aiService}=await import('../dist/services/aiService.js');
const oldExtraction=aiService.extractInterviewExperience,oldDraft=aiService.draftRubric;
const {contentEditorial}=await import('../dist/contentIntelligence/editorial.js');
const {sourceRegistry}=await import('../dist/contentIntelligence/sourceRegistry.js');
const {contentTrends}=await import('../dist/contentIntelligence/trends.js');
const {PlannerService}=await import('../dist/planner/service.js');
const {sessionRepository}=await import('../dist/models/Session.js');
const {sessionService}=await import('../dist/services/sessionService.js');
const {publicEvaluationSession}=await import('../dist/evaluation/readModel.js');
const {InterviewRuntime}=await import('../dist/runtime/worker.js');
const {contentOperations}=await import('../dist/runtime/contentOperations.js');

try{
  await new Promise(resolve=>appServer.listen(0,'127.0.0.1',resolve));
  const port=appServer.address().port;
  await f.query('UPDATE ingestion_reviewers SET user_id=$2 WHERE id=$1',[f.actor,f.owner]);
  const taxonomy=(await f.query("SELECT id FROM competencies WHERE taxonomy_version='junior-se-v1' AND kind='child' AND status='active' AND id LIKE 'dsa.%' ORDER BY id LIMIT 1")).rows[0]?.id;
  assert.ok(taxonomy,'fixture requires an existing DSA taxonomy child');
  const sourceInput={sourceType:'official_api',name:'Fictional integrated E2E source',baseUrl:'https://fixture.example.invalid/api/items',
    termsUrl:'https://fixture.example.invalid/terms',permissionBasis:'disposable deterministic fixture grant',
    permissionEvidence:'Fictional test content only; no third-party source or human-review claim',attribution:'Aptlyra test fixture',
    allowedHosts:['fixture.example.invalid','127.0.0.1'],allowedPaths:['/api/items','/report/1'],intervalMinutes:60,rawRetentionDays:7,
    fullTextStorage:true,derivedDataStorage:true,modelProcessingAllowed:true};
  const created=await sourceRegistry.create(f.owner,sourceInput),source=await sourceRegistry.get(f.owner,created.id);
  await sourceRegistry.reviewPermission(f.owner,created.id,source.permission_evidence_hash);
  await sourceRegistry.setEnabled(f.owner,created.id,true);
  await f.query('UPDATE sources SET origin=$2,next_due_at=now() WHERE id=$1',[created.id,`http://127.0.0.1:${port}/api/items`]);

  aiService.extractInterviewExperience=async({sourceText,role,company,occurredOn,datePrecision,roundType,topics})=>({contractVersion:'interview-extraction-v1',candidates:questions.map((question,index)=>{
    const start=Array.from(sourceText).join('').indexOf(question);
    return {question,role,company:company||null,occurredOn,datePrecision,roundType:roundType||null,
      taxonomy,category:'conceptual-oral',difficulty:'standard',language:'en',topics:topics?.length?topics:['hash tables'],
      derivationType:index===4?'direct':'direct',evidenceStart:start,evidenceEnd:start+question.length,evidenceText:question,confidence:.9};
  })});
  const queued=await sourceRegistry.collect(f.owner,created.id,'manual');
  runtime=await (await import('../dist/runtime/worker.js')).startInterviewRuntime();
  const run=await until(async()=>{
    const value=(await f.query('SELECT * FROM source_collection_runs WHERE operation_id=$1',[queued.operationId])).rows[0];
    if(value?.status==='terminal_failed'||value?.status==='retryable_failed'){
      const operation=(await f.query('SELECT status,error_code FROM durable_operations WHERE id=$1',[queued.operationId])).rows[0];
      throw new Error(`integrated source collection ${value.status}: ${value.safe_error_category}; operation=${operation?.status}/${operation?.error_code}`);
    }
    return value?.status==='succeeded'?value:null;
  },'integrated source collection');
  assert.equal(run.discovered_count,1);assert.equal(run.quarantined_count,1);
  const imported=(await f.query(`SELECT r.id,r.input_hash,r.state,v.status,v.content_hash,e.company_label,e.role,e.occurred_on
    FROM ingestion_records r JOIN source_document_versions v ON v.id=r.document_version_id
    JOIN interview_experience_records e ON e.document_version_id=v.id WHERE r.source_id=$1`,[created.id])).rows[0];
  assert.equal(imported.state,'review_required');assert.equal(imported.status,'quarantined');assert.equal(imported.company_label,null);
  const collectionCursor=(await f.query("SELECT collection_cursor FROM sources WHERE id=$1",[created.id])).rows[0].collection_cursor;
  assert.equal(collectionCursor.etag,'"phase85-source-v1"',JSON.stringify({collectionCursor,result:(await f.query('SELECT result FROM durable_operations WHERE id=$1',[queued.operationId])).rows[0].result}));
  const extraction=await until(async()=>{
    const op=(await f.query("SELECT * FROM durable_operations WHERE source_id=$1 AND operation_type='source_extraction' ORDER BY created_at DESC LIMIT 1",[created.id])).rows[0];
    if(op?.status==='terminal_failed'||op?.status==='retryable_failed'){
      const rec=(await f.query('SELECT id,input_hash FROM ingestion_records WHERE source_id=$1',[created.id])).rows[0];
      try{await contentEditorial.extractSubmission(f.owner,rec.id,rec.input_hash,'permission-authorized-worker');}
      catch(error){throw new Error(`integrated extraction ${op.status}: ${op.error_code}; direct=${error instanceof Error?error.stack:String(error)}`);}
      throw new Error(`integrated extraction ${op.status}: ${op.error_code}; direct extraction unexpectedly succeeded`);
    }
    return op?.status==='succeeded'?op:null;
  },'durable extraction proposal');
  assert.ok(extraction.result);
  assert.equal((await f.query("SELECT count(*)::int AS n FROM ingestion_candidates WHERE record_id=$1 AND state='review_required'",[imported.id])).rows[0].n,5);
  assert.equal((await f.query("SELECT count(*)::int AS n FROM ingestion_review_events WHERE record_id=$1 AND action='approved'",[imported.id])).rows[0].n,0);

  await contentEditorial.approveSourceRecord(f.owner,imported.id,imported.input_hash);
  await contentEditorial.publishSourceRecord(f.owner,imported.id);
  const candidates=(await f.query('SELECT id,content_hash,specification FROM ingestion_candidates WHERE record_id=$1 ORDER BY evidence_start,id',[imported.id])).rows;
  assert.equal(candidates.length,5);
  const edited={...candidates[0].specification,text:'What does a hash table provide to a junior engineer?'};
  await contentEditorial.editApproveQuestion(f.owner,candidates[0].id,candidates[0].content_hash,edited,'paraphrased');
  const editedHash=(await f.query('SELECT content_hash FROM ingestion_candidates WHERE id=$1',[candidates[0].id])).rows[0].content_hash;
  for(const candidate of candidates.slice(1,4))await contentEditorial.approveQuestion(f.owner,candidate.id,candidate.content_hash);
  await contentEditorial.duplicateQuestion(f.owner,candidates[4].id,candidates[4].content_hash,candidates[0].id,'duplicate-repost');
  const activeCandidates=[candidates[0],...candidates.slice(1,4)];
  const versions=[];
  for(let i=0;i<activeCandidates.length;i++){
    const candidate=activeCandidates[i],candidateHash=i===0?editedHash:candidate.content_hash;
    const publication=await contentEditorial.publishQuestion(f.owner,candidate.id,candidateHash,{
      async embed(texts){return {modelId:'sentence-transformers/paraphrase-MiniLM-L3-v2',modelRevision:'4ca70771034acceecb2e72475f72050fcdde4ddc',dimension:384,
        normalization:'l2',embeddingVersion:'onnx-mean-l2-v1',vectors:texts.map(()=>[1,...Array(383).fill(0)]),processingMs:1};}});
    assert.equal(publication.embeddingReady,true);versions.push(publication.questionVersionId);
  }
  await contentEditorial.linkQuestionFamily(f.owner,candidates[1].id,candidates[1].content_hash,candidates[2].id);
  await f.query('UPDATE ingestion_candidates SET state=\'published\' WHERE id=$1',[candidates[2].id]);
  assert.ok((await f.query('SELECT duplicate_links FROM ingestion_candidates WHERE id=$1',[candidates[1].id])).rows[0].duplicate_links.length);
  const {RetrievalService}=await import('../dist/retrieval/service.js');
  const retrieval=new RetrievalService({async embed(texts){return {modelId:'sentence-transformers/paraphrase-MiniLM-L3-v2',modelRevision:'4ca70771034acceecb2e72475f72050fcdde4ddc',dimension:384,normalization:'l2',embeddingVersion:'onnx-mean-l2-v1',vectors:texts.map(()=>[1,...Array(383).fill(0)]),processingMs:1};}});
  for(let i=0;i<3;i++){
    const qv=versions[i];await contentEditorial.addTechnicalReference(f.owner,qv,reference);
    aiService.draftRubric=async question=>({concepts:[{key:'hash-table-mechanism',label:'Lookup mechanism',description:`Explain the hash table mechanism for ${question}`,
      importance:100,required:true,sourceIds:[reference]}],evidenceIndicators:[],misconceptions:[],dimensionGuidance:[],followUpConcepts:[],codingObjectiveEvidence:null});
    const draft=await contentEditorial.draftScoringPacket(f.owner,qv);
    const approved=await contentEditorial.approveScoringPacket(f.owner,draft.id,draft.hash);
    assert.equal(approved.publicationClass,'reviewed/scoring-ready');
  }
  await contentEditorial.addTechnicalReference(f.owner,versions[3],reference);
  const provisionalDraft=await f.editor.createDraft({questionVersionId:versions[3],concepts:[{key:'hash-table-mechanism',label:'Lookup mechanism',
    description:'Explain the basic lookup mechanism',importance:100,required:true,sourceIds:[reference]}]});
  const provisionalRubric=await f.editor.publish(provisionalDraft.id,provisionalDraft.hash);
  assert.equal((await f.query('SELECT publication_class FROM content_question_readiness WHERE question_version_id=$1',[versions[3]])).rows[0].publication_class,'fresh/provisional');

  const trends=await contentTrends.list(f.owner,30,'Backend Developer');
  assert.ok(trends.some(t=>t.topic==='hash tables'&&t.company===null&&t.distinctRecords===1));
  assert.ok(trends.every(t=>t.independentSources===1));
  const entityRows=(await f.query('SELECT * FROM retrieval_entities WHERE purpose=\'question-selection\' AND entity_id=ANY($1::uuid[]) ORDER BY entity_id',[versions])).rows;
  assert.equal(entityRows.length,4);
  const rootIds=(await f.query("SELECT id FROM competencies WHERE taxonomy_version='junior-se-v1' AND kind='root' AND id='dsa'")).rows;
  assert.equal(rootIds.length,1);
  const deterministicRetriever={async retrieveQuestions(request){
    const current=(await f.query('SELECT e.*,ready.publication_class FROM retrieval_entities e JOIN content_question_readiness ready ON ready.question_version_id=e.entity_id WHERE e.purpose=\'question-selection\' AND e.entity_id=ANY($1::uuid[]) ORDER BY e.entity_id',[versions])).rows;
    assert.ok(current.every(row=>Array.isArray(row.provenance)&&row.provenance.length>0),JSON.stringify(current.map(row=>({id:row.entity_id,provenance:row.provenance}))));
    const {knowledgeRepository}=await import('../dist/repositories/knowledgeRepository.js');
    const operationId=await knowledgeRepository.recordRetrieval(f.owner,{operationKey:randomUUID(),sessionId:request.ownership.sessionId,
      queryHash:hash(request.query),filters:request.filters||{},embeddingMetadata:{modelId:'sentence-transformers/paraphrase-MiniLM-L3-v2',purpose:'question-selection'},
      corpusVersion:request.expectedCorpusGeneration,sourcePolicyRevision:'phase85-fixture-policy',outcome:'success',results:current.map((row,index)=>({
        questionVersionId:row.entity_id,rank:index+1,similarity:1,selected:true,reason:'fixture',provenanceSnapshot:row.provenance}))});
    const evidence=(await f.query(`SELECT e.user_id,e.session_id,e.corpus_version,e.outcome,r.question_version_id,r.selected,r.provenance_snapshot
      FROM retrieval_evidence e JOIN retrieval_results r ON r.retrieval_id=e.id WHERE e.id=$1`,[operationId])).rows;
    assert.equal(evidence.length,current.length);assert.ok(evidence.every(row=>row.user_id===f.owner&&row.session_id===request.ownership.sessionId&&row.corpus_version===request.expectedCorpusGeneration&&row.outcome==='success'&&row.selected&&row.provenance_snapshot.length>0),JSON.stringify(evidence));
    return {operationId,outcome:'success',reason:'fixture',cacheHit:false,corpusGeneration:request.expectedCorpusGeneration,
      timings:{embeddingMs:0,databaseMs:0,totalMs:0},hits:current.map((row,index)=>({questionId:row.question_id,questionVersionId:row.entity_id,
        familyKey:row.family_key,text:row.text,competency:row.primary_competency,category:row.category,difficulty:row.difficulty,origin:row.origin,
        provenance:row.provenance,provenanceAvailable:true,similarity:1,rank:index+1,reason:'fixture',retrievalOperationId:operationId,
        model:{modelId:'sentence-transformers/paraphrase-MiniLM-L3-v2',modelRevision:'4ca70771034acceecb2e72475f72050fcdde4ddc',dimension:384,normalization:'l2',embeddingVersion:'onnx-mean-l2-v1',purpose:'question-selection'},
        corpusGeneration:request.expectedCorpusGeneration}))};
  }};
  const planner=new PlannerService(deterministicRetriever),setup={role:'Backend Developer',level:'junior',taxonomyVersion:'junior-se-v1',competencies:['dsa'],difficulty:'standard',mode:'oral',
    count:4,minutes:30,language:'en',codeLanguage:'javascript',includeRecentTrends:true,modifiers:{}};
  const withoutRecent=await planner.preview(f.owner,{...setup,count:3,includeRecentTrends:false});
  assert.equal(withoutRecent.items.some(item=>item.questionVersionId===versions[3]),false);
  const plan=await planner.preview(f.owner,setup);
  assert.equal(plan.canConfirm,true);assert.equal(plan.effectiveCount,4);
  assert.equal(plan.items.filter(item=>item.publicationClass==='fresh/provisional').length,1);
  assert.ok(plan.items.some(item=>item.questionVersionId===versions[3]&&item.selectionReason==='recent_signal'));
  await planner.confirm(f.owner,{planId:plan.id,revision:plan.revision});
  let session=await sessionRepository.findByIdForUser(plan.sessionId,f.owner);
  assert.equal(session.questions.length,4);
  const evalRuntime=new InterviewRuntime();
  try{
    for(let i=0;i<session.questions.length;i++){
      const operation=await sessionService.submitSessionAnswer(session._id,f.owner,String(i),null,null,null,null,null,'A hash table maps a key to a bucket using a hash function.');
      assert.ok(operation?.id);
      await evalRuntime.process(operation.id);
      session=await sessionRepository.findByIdForUser(session._id,f.owner);
      assert.equal(session.questions[i].isEvaluated,true);
    }
    let reportOp=(await f.query("SELECT * FROM durable_operations WHERE session_id=$1 AND operation_type='report' ORDER BY created_at DESC LIMIT 1",[session._id])).rows[0];
    assert.ok(reportOp);
    await evalRuntime.process(reportOp.id);
    session=await sessionRepository.findByIdForUser(session._id,f.owner);
    session=await publicEvaluationSession(session);
    assert.equal(session.status,'completed');assert.ok(session.report);assert.equal(session.reviewedSummary.eligible,3,JSON.stringify({questions:session.questions.map(q=>({id:q.questionVersionId,status:q.evaluation?.rubricStatus,rubric:q.evaluation?.rubricVersionId})),items:(await f.query('SELECT question_version_id,rubric_version_id FROM plan_items WHERE plan_id=$1 ORDER BY position',[plan.id])).rows}));
    assert.equal(session.reviewedSummary.provisional,1);
    const historicalQuestion=session.questions.find(q=>q.questionVersionId===versions[0]);
    const historicalText=historicalQuestion.questionText,historicalRubric=historicalQuestion.evaluation.rubricVersionId;
    const snapshot=(await f.query('SELECT questions,summary FROM interview_reports WHERE session_id=$1',[session._id])).rows[0];
    assert.equal(snapshot.summary.reviewedSummary.eligible,3);
    await f.query('UPDATE interview_questions SET family_key=$1 WHERE id=ANY(SELECT question_id FROM question_versions WHERE id=ANY($2::uuid[]))',
      ['phase85-integrated-question-family',versions]);
    const familyTrend=(await contentTrends.list(f.owner,30,'Backend Developer')).find(t=>t.topic===taxonomy);
    assert.equal(familyTrend?.questionFamilies,1);
    await contentEditorial.supersedeQuestion(f.owner,candidates[1].id,candidates[1].content_hash,candidates[0].id);
    await contentEditorial.supersedeQuestion(f.owner,candidates[2].id,candidates[2].content_hash,candidates[1].id);
    await contentEditorial.supersedeQuestion(f.owner,candidates[3].id,candidates[3].content_hash,candidates[2].id);
    await contentEditorial.withdrawQuestion(f.owner,candidates[3].id,candidates[3].content_hash,'question-withdrawn');
    assert.equal((await contentTrends.list(f.owner,30,'Backend Developer')).some(t=>t.topic===taxonomy),false);

    let release;
    const staleId=await contentOperations.enqueue({type:'source_collection',scopeType:'source',scopeId:created.id,sourceId:created.id,
      idempotencyKey:'stale-after-withdrawal',payload:{runId:randomUUID()},requestedBy:f.owner,maxAttempts:3});
    staleRuntime=new InterviewRuntime({contentHandlers:{source_collection:async()=>{await new Promise(resolve=>{release=resolve;});return {committed:true};}}});
    const staleProcessing=staleRuntime.process(staleId.id);
    await until(()=>release,'stale collector claimed');
    await sourceRegistry.withdraw(f.owner,created.id,'fictional fixture permission withdrawn');
    release();await staleProcessing;
    assert.notEqual((await f.query('SELECT status FROM durable_operations WHERE id=$1',[staleId.id])).rows[0].status,'succeeded');
    assert.equal((await f.query('SELECT publication_class FROM content_question_readiness WHERE question_version_id=$1',[versions[0]])).rows[0].publication_class,'unavailable');
    assert.deepEqual(await contentTrends.list(f.owner,30,'Backend Developer'),[]);
    const afterWithdrawal=await planner.preview(f.owner,setup);
    assert.equal(afterWithdrawal.items.some(item=>versions.includes(item.questionVersionId)),false);
    const reread=await publicEvaluationSession(await sessionRepository.findByIdForUser(session._id,f.owner));
    assert.equal(reread.status,'completed');assert.ok(reread.report);assert.equal(reread.reviewedSummary.eligible,3,JSON.stringify({questions:reread.questions.map(q=>({id:q.questionVersionId,status:q.evaluation?.rubricStatus,score:q.evaluation?.technicalScore,reason:q.evaluation?.reasons,rubric:q.evaluation?.rubricVersionId})),entities:(await f.query("SELECT entity_id FROM retrieval_entities WHERE purpose='question-selection' AND entity_id=ANY($1::uuid[])",[versions])).rows,refs:(await f.query("SELECT entity_id FROM retrieval_entities WHERE purpose='technical-grounding' AND entity_id=$1",[reference])).rows}));
    assert.equal(reread.questions.find(q=>q.questionVersionId===versions[0]).questionText,historicalText);
    assert.equal(reread.questions.find(q=>q.questionVersionId===versions[0]).evaluation.rubricVersionId,historicalRubric);
    assert.deepEqual((await f.query('SELECT questions,summary FROM interview_reports WHERE session_id=$1',[session._id])).rows[0],snapshot);
  }finally{await evalRuntime.stop(true);}
}finally{
  aiService.extractInterviewExperience=oldExtraction;aiService.draftRubric=oldDraft;
  if(staleRuntime)await staleRuntime.stop(true).catch(()=>{});
  if(runtime)await runtime.stop(true).catch(()=>{});
  if(!sourceServerClosed){appServer.closeAllConnections();await new Promise(resolve=>appServer.close(resolve));sourceServerClosed=true;}
  await f.cleanup();
}
