/** Full content editorial fixture. It uses only temporary localhost PostgreSQL and fake provider/embedding seams. */
import assert from 'node:assert/strict';
import { createHash,randomUUID } from 'node:crypto';
import { before,after,test } from 'node:test';
import pg from 'pg';
import express from 'express';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import request from 'supertest';
for(const key of ['DATABASE_URL','NEON_DATABASE_URL','REDIS_URL','UPSTASH_REDIS_URL'])if(process.env[key])throw new Error(`Unset ${key}: content E2E uses disposable localhost fixtures only`);
const fixtureUrl='postgresql://techvera_test:techvera_local_fixture@127.0.0.1:15432/techvera_test';
const admin=new pg.Pool({connectionString:fixtureUrl,ssl:false}),dbName=`aptlyra_content_e2e_${randomUUID().replaceAll('-','')}`;
const userId=randomUUID(),reviewerId='phase85-e2e-reviewer';
process.env.REDIS_URL='redis://127.0.0.1:16379/14';
let pool,query,submissions,editorial,aiService,sessionRepository,app,originalExtract,originalDraft,originalReview;
const hash=value=>createHash('sha256').update(value).digest('hex');
const successEmbedder={async embed(texts){return {modelId:'sentence-transformers/paraphrase-MiniLM-L3-v2',modelRevision:'4ca70771034acceecb2e72475f72050fcdde4ddc',dimension:384,normalization:'l2',embeddingVersion:'onnx-mean-l2-v1',vectors:texts.map(()=>[1,...Array(383).fill(0)]),processingMs:1};}};
const failedEmbedder={async embed(){throw new Error('fixture embedding outage');}};

before(async()=>{
  await admin.query(`CREATE DATABASE ${dbName}`);
  process.env.DATABASE_URL=fixtureUrl.replace(/\/[^/]+$/,'/'+dbName);process.env.DATABASE_SSL='false';process.env.NODE_ENV='test';
  delete process.env.INTERNAL_API_KEY;delete process.env.AI_SERVICE_URL;
  ({pool,query}=await import('../dist/config/db.js'));
  const {runMigrations}=await import('../dist/database/migrations.js');await runMigrations(pool);
  ({contentSubmissions:submissions}=await import('../dist/contentIntelligence/submissions.js'));
  ({contentEditorial:editorial}=await import('../dist/contentIntelligence/editorial.js'));
  ({aiService}=await import('../dist/services/aiService.js'));
  ({sessionRepository}=await import('../dist/models/Session.js'));
  process.env.JWT_SECRET='phase95-content-e2e-fixture-secret';
  const {default:contentRoutes}=await import('../dist/routes/contentIntelligenceRoutes.js');
  const {default:plannerRoutes}=await import('../dist/routes/plannerRoutes.js');
  const {default:requestIdMiddleware}=await import('../dist/middleware/requestId.js');
  app=express();app.use(express.json());app.use(cookieParser());app.use(requestIdMiddleware);app.use('/api/content-intelligence',contentRoutes);app.use('/api/interview-plans',plannerRoutes);
  originalExtract=aiService.extractInterviewExperience;originalDraft=aiService.draftRubric;originalReview=aiService.reviewEditorialCandidate;
  await query("INSERT INTO users(id,name,email,app_role) VALUES($1,$2,$3,'reviewer')",[userId,'Disposable editorial fixture','editorial-fixture@example.invalid']);
  await query("INSERT INTO ingestion_reviewers(id,display_name,kind,user_id) VALUES($1,'Disposable human reviewer','human',$2)",[reviewerId,userId]);
});

after(async()=>{
  try{if(aiService){aiService.extractInterviewExperience=originalExtract;aiService.draftRubric=originalDraft;aiService.reviewEditorialCandidate=originalReview;}if(pool)await pool.end();
    await admin.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);}
  finally{await admin.end();delete process.env.DATABASE_URL;delete process.env.DATABASE_SSL;delete process.env.INTERNAL_API_KEY;delete process.env.AI_SERVICE_URL;}
});

test('quarantine → extraction → human reviews → technical grounding/rubric → pgvector publication → immediate retrieval',async()=>{
  const reviewerCookie=`jwt=${jwt.sign({id:userId},process.env.JWT_SECRET)}`;
  await request(app).get('/api/content-intelligence/review/manual-references').expect(401);
  const initialManualQueue=await request(app).get('/api/content-intelligence/review/manual-references').set('Cookie',reviewerCookie).expect(200);
  assert.deepEqual(initialManualQueue.body,[],'the exact installed manual-reference route returns an empty queue');
  assert.deepEqual((await request(app).get('/api/content-intelligence/seed-review').set('Cookie',reviewerCookie).expect(200)).body,[]);
  const readinessBefore=await request(app).get('/api/interview-plans/capabilities').set('Cookie',reviewerCookie).expect(200);
  assert.equal(readinessBefore.body.eligibleReviewedQuestions,0);
  const questions=['What does a SQL index do?','How does a transaction help a database?','Why do database systems use locks?'];
  const submitted=await submissions.create(userId,{role:'Backend Developer',roundType:'technical',topics:['SQL indexing','transactions'],questions,
    practiceConsent:true,rightToShare:true,aiProcessingConsent:true});
  const row=(await query(`SELECT r.source_id,r.input_hash,v.normalized_text FROM ingestion_records r JOIN source_document_versions v ON v.id=r.document_version_id WHERE r.id=$1`,[submitted.id])).rows[0];
  aiService.extractInterviewExperience=async input=>({contractVersion:'interview-extraction-v1',candidates:questions.map(question=>{
    const evidenceStart=Array.from(input.sourceText).join('').indexOf(question);
    return {question,role:'Backend Developer',company:null,occurredOn:null,datePrecision:'unknown',roundType:'technical',taxonomy:'dbms-sql.transactions-indexes',
      category:'sql',difficulty:'standard',language:'en',topics:['SQL'],derivationType:'direct',evidenceStart,evidenceEnd:evidenceStart+question.length,
      evidenceText:question,confidence:.9};
  })});
  const extraction=await editorial.extractSubmission(userId,submitted.id,row.input_hash);
  assert.equal(extraction.aiApproved,false);assert.equal(extraction.candidateIds.length,3);
  const reExtraction=await editorial.extractSubmission(userId,submitted.id,row.input_hash);
  assert.equal(reExtraction.candidateIds.length,0);
  assert.equal((await query("SELECT count(*)::int AS n FROM ingestion_review_events WHERE record_id=$1 AND action='re-extraction-requested'",[submitted.id])).rows[0].n,1);
  const candidates=(await query('SELECT id,content_hash FROM ingestion_candidates WHERE record_id=$1 ORDER BY id',[submitted.id])).rows;
  aiService.reviewEditorialCandidate=async()=>({contractVersion:'editorial-review-v1',relevance:'relevant',verdict:'recommend-edit',taxonomy:'dbms-sql.transactions-indexes',
    category:'sql',difficulty:'standard',duplicateWarning:false,wordingIssues:['Could ask for a concrete trade-off'],correctedQuestion:'What trade-offs come with adding a database index?',
    technicalCorrectness:'uncertain',expectedConcepts:['faster lookups','write and storage cost'],evidenceStatus:'weak',evidenceSummary:'Experience reports are weak technical evidence.',
    rubricGuidance:['Assess lookup benefit and write cost.'],confidence:'high',flags:['weak-evidence','needs-human-review']});
  const firstPacket=await editorial.reviewCandidate(userId,candidates[0].id,candidates[0].content_hash);
  const secondPacket=await editorial.reviewCandidate(userId,candidates[0].id,candidates[0].content_hash);
  assert.equal(firstPacket.aiApproved,false);assert.equal(firstPacket.version,1);assert.equal(secondPacket.version,2);
  assert.equal(firstPacket.packet.confidence,'medium','fresh content must never carry high AI confidence');
  assert.equal(firstPacket.packet.referenceStatus,'no-reviewed-reference');
  assert.notEqual(firstPacket.id,secondPacket.id);
  assert.equal((await query('SELECT state FROM ingestion_candidates WHERE id=$1',[candidates[0].id])).rows[0].state,'review_required');
  assert.equal((await query('SELECT count(*)::int AS n FROM candidate_ai_review_packets WHERE candidate_id=$1',[candidates[0].id])).rows[0].n,2);
  const httpQuestion='How do transactions preserve database consistency?';
  aiService.extractInterviewExperience=async input=>({contractVersion:'interview-extraction-v1',candidates:[{question:httpQuestion,role:'Backend Developer',company:null,occurredOn:null,datePrecision:'unknown',
    roundType:'technical',taxonomy:'dbms-sql.transactions-indexes',category:'sql',difficulty:'standard',language:'en',topics:['SQL transactions'],derivationType:'direct',
    evidenceStart:input.sourceText.indexOf(httpQuestion),evidenceEnd:input.sourceText.indexOf(httpQuestion)+httpQuestion.length,evidenceText:httpQuestion,confidence:.9}]});
  const httpSubmission=await request(app).post('/api/content-intelligence/submissions').set('Cookie',reviewerCookie)
    .send({role:'Backend Developer',roundType:'technical',topics:['SQL transactions'],questions:[httpQuestion],
      practiceConsent:true,rightToShare:true,aiProcessingConsent:true}).expect(201);
  const httpHash=(await query('SELECT input_hash FROM ingestion_records WHERE id=$1',[httpSubmission.body.id])).rows[0].input_hash;
  const httpExtraction=await request(app).post(`/api/content-intelligence/review/submissions/${httpSubmission.body.id}/extract`)
    .set('Cookie',reviewerCookie).send({expectedHash:httpHash}).expect(200);
  assert.equal(httpExtraction.body.aiApproved,false);assert.equal(httpExtraction.body.candidateIds.length,1);
  const providerFailureSubmission=await submissions.create(userId,{role:'Backend Developer',roundType:'technical',topics:['SQL'],questions:['Explain an index scan.'],practiceConsent:true,rightToShare:true,aiProcessingConsent:true});
  const providerFailureHash=(await query('SELECT input_hash FROM ingestion_records WHERE id=$1',[providerFailureSubmission.id])).rows[0].input_hash;
  const workingExtractor=aiService.extractInterviewExperience;
  aiService.extractInterviewExperience=async()=>{throw Object.assign(new Error('safe fixture'),{code:'provider_unavailable',upstreamStatus:503});};
  const providerUnavailable=await request(app).post(`/api/content-intelligence/review/submissions/${providerFailureSubmission.id}/extract`)
    .set('Cookie',reviewerCookie).send({expectedHash:providerFailureHash}).expect(503);
  assert.equal(providerUnavailable.body.code,'ai-provider-unavailable');assert.equal(providerUnavailable.headers['x-request-id'],providerUnavailable.body.requestId);
  aiService.extractInterviewExperience=async()=>{throw Object.assign(new Error('safe fixture'),{code:'invalid_extraction_output',upstreamStatus:502,category:'schema_validation'});};
  const invalidExtraction=await request(app).post(`/api/content-intelligence/review/submissions/${providerFailureSubmission.id}/extract`)
    .set('Cookie',reviewerCookie).send({expectedHash:providerFailureHash}).expect(502);
  assert.equal(invalidExtraction.body.code,'invalid-ai-output');
  aiService.extractInterviewExperience=async()=>{throw Object.assign(new Error('safe fixture'),{code:'extraction_schema_validation_failed',upstreamStatus:502,category:'schema_validation'});};
  const typedExtraction=await request(app).post(`/api/content-intelligence/review/submissions/${providerFailureSubmission.id}/extract`)
    .set('Cookie',reviewerCookie).send({expectedHash:providerFailureHash}).expect(502);
  assert.equal(typedExtraction.body.code,'extraction_schema_validation_failed');
  assert.match(typedExtraction.body.message,/after one correction attempt/);
  aiService.extractInterviewExperience=workingExtractor;
  const httpCandidate=(await query('SELECT content_hash FROM ingestion_candidates WHERE id=$1',[httpExtraction.body.candidateIds[0]])).rows[0];
  const httpProposal=await request(app).post(`/api/content-intelligence/review/candidates/${httpExtraction.body.candidateIds[0]}/ai-review`)
    .set('Cookie',reviewerCookie).send({expectedHash:httpCandidate.content_hash}).expect(200);
  assert.equal(httpProposal.body.aiApproved,false);
  assert.equal((await query('SELECT state FROM ingestion_candidates WHERE id=$1',[httpExtraction.body.candidateIds[0]])).rows[0].state,'review_required');
  const scopedReviewInputs=[];
  const scopedReview=aiService.reviewEditorialCandidate;
  aiService.reviewEditorialCandidate=async(input,requestId)=>{scopedReviewInputs.push(input);return scopedReview(input,requestId);};
  const routeReview=await request(app).post(`/api/content-intelligence/review/candidates/${candidates[1].id}/ai-review`)
    .set('Cookie',reviewerCookie).send({expectedHash:candidates[1].content_hash}).expect(200);
  assert.equal(routeReview.body.aiApproved,false);
  const routedQuestion=(await query('SELECT specification FROM ingestion_candidates WHERE id=$1',[candidates[1].id])).rows[0].specification.text;
  assert.equal(scopedReviewInputs.length,1,'one AI-review request invokes the provider once for one candidate');
  assert.equal(scopedReviewInputs[0].question,routedQuestion,'the provider receives only the selected candidate question');
  assert.deepEqual(scopedReviewInputs[0].similarQuestions,[],'other candidate question text is not sent with the review request');
  assert.equal((await query('SELECT state FROM ingestion_candidates WHERE id=$1',[candidates[1].id])).rows[0].state,'review_required',
    'the actual HTTP review route must save only an AI proposal, never approve submitted questions');
  const activeReview=aiService.reviewEditorialCandidate;
  aiService.reviewEditorialCandidate=async()=>{throw Object.assign(new Error('fixture unavailable'),{code:'fixture-provider-down'});};
  const unavailableReview=await request(app).post(`/api/content-intelligence/review/candidates/${candidates[1].id}/ai-review`)
    .set('Cookie',reviewerCookie).send({expectedHash:candidates[1].content_hash}).expect(503);
  assert.equal(unavailableReview.body.code,'ai-provider-unavailable');
  aiService.reviewEditorialCandidate=async()=>{throw Object.assign(new Error('fixture invalid review'),{code:'editorial_schema_validation_failed',category:'schema_validation'});};
  const typedInvalidReview=await request(app).post(`/api/content-intelligence/review/candidates/${candidates[1].id}/ai-review`)
    .set('Cookie',reviewerCookie).send({expectedHash:candidates[1].content_hash}).expect(502);
  assert.equal(typedInvalidReview.body.code,'editorial_schema_validation_failed');
  assert.match(typedInvalidReview.body.message,/retried once/);
  aiService.reviewEditorialCandidate=async()=>({contractVersion:'bad-output'});
  const invalidReview=await request(app).post(`/api/content-intelligence/review/candidates/${candidates[1].id}/ai-review`)
    .set('Cookie',reviewerCookie).send({expectedHash:candidates[1].content_hash}).expect(502);
  assert.equal(invalidReview.body.code,'invalid-review-output');
  aiService.reviewEditorialCandidate=activeReview;
  const noConsent=await submissions.create(userId,{role:'Backend Developer',roundType:'technical',topics:['SQL'],questions:['Why might a query use an index?'],practiceConsent:true,rightToShare:true,aiProcessingConsent:false});
  const noConsentRow=(await query('SELECT r.input_hash FROM ingestion_records r WHERE r.id=$1',[noConsent.id])).rows[0];
  const consentResponse=await request(app).post(`/api/content-intelligence/review/submissions/${noConsent.id}/extract`)
    .set('Cookie',reviewerCookie).send({expectedHash:noConsentRow.input_hash}).expect(403);
  assert.equal(consentResponse.body.code,'ai-processing-consent-required');
  const sourcePermissionSubmission=await submissions.create(userId,{role:'Backend Developer',roundType:'technical',topics:['SQL'],questions:['How does a query planner use an index?'],practiceConsent:true,rightToShare:true,aiProcessingConsent:true});
  const sourcePermissionRow=(await query('SELECT r.input_hash,r.source_id FROM ingestion_records r WHERE r.id=$1',[sourcePermissionSubmission.id])).rows[0];
  await query('UPDATE sources SET model_processing_allowed=false WHERE id=$1',[sourcePermissionRow.source_id]);
  const sourcePermissionResponse=await request(app).post(`/api/content-intelligence/review/submissions/${sourcePermissionSubmission.id}/extract`)
    .set('Cookie',reviewerCookie).send({expectedHash:sourcePermissionRow.input_hash}).expect(403);
  assert.equal(sourcePermissionResponse.body.code,'source-ai-processing-disallowed','source permission remains distinct from submitter consent');
  await query('UPDATE sources SET model_processing_allowed=true WHERE id=$1',[sourcePermissionRow.source_id]);
  const deniedCandidate=(await query('SELECT id,content_hash FROM ingestion_candidates WHERE record_id=$1 ORDER BY id LIMIT 1',[submitted.id])).rows[0];
  await query('UPDATE sources SET model_processing_allowed=false WHERE id=$1',[row.source_id]);
  const candidatePermission=await request(app).post(`/api/content-intelligence/review/candidates/${deniedCandidate.id}/ai-review`)
    .set('Cookie',reviewerCookie).send({expectedHash:deniedCandidate.content_hash}).expect(403);
  assert.equal(candidatePermission.body.code,'source-ai-processing-disallowed');
  await query('UPDATE sources SET model_processing_allowed=true WHERE id=$1',[row.source_id]);
  const earlySourcePublish=await request(app).post(`/api/content-intelligence/review/records/${providerFailureSubmission.id}/publish`)
    .set('Cookie',reviewerCookie).expect(409);
  assert.equal(earlySourcePublish.body.code,'source-record-not-ready');
  const providerQuestion='Explain an index scan.';
  aiService.extractInterviewExperience=async input=>({contractVersion:'interview-extraction-v1',candidates:[{question:providerQuestion,role:'Backend Developer',company:null,
    occurredOn:null,datePrecision:'unknown',roundType:'technical',taxonomy:'dbms-sql.transactions-indexes',category:'sql',difficulty:'standard',language:'en',
    topics:['SQL'],derivationType:'direct',evidenceStart:input.sourceText.indexOf(providerQuestion),evidenceEnd:input.sourceText.indexOf(providerQuestion)+providerQuestion.length,
    evidenceText:providerQuestion,confidence:.9}]});
  await editorial.extractSubmission(userId,providerFailureSubmission.id,providerFailureHash);
  const providerCandidate=(await query('SELECT id,content_hash FROM ingestion_candidates WHERE record_id=$1',[providerFailureSubmission.id])).rows[0];
  await request(app).post(`/api/content-intelligence/review/candidates/${providerCandidate.id}/approve`)
    .set('Cookie',reviewerCookie).send({expectedHash:providerCandidate.content_hash}).expect(200);
  await request(app).post(`/api/content-intelligence/review/records/${providerFailureSubmission.id}/publish`)
    .set('Cookie',reviewerCookie).expect(200);
  assert.equal((await query('SELECT state FROM ingestion_records WHERE id=$1',[providerFailureSubmission.id])).rows[0].state,'published',
    'the internal source-record lifecycle endpoint completes against the current schema');
  aiService.extractInterviewExperience=workingExtractor;
  for(const candidate of candidates)await editorial.approveQuestion(userId,candidate.id,candidate.content_hash);
  await assert.rejects(()=>editorial.reviewCandidate(userId,candidates[0].id,'f'.repeat(64)),/review-hash-mismatch/);
  await assert.rejects(()=>query("UPDATE candidate_ai_review_packets SET version=3 WHERE candidate_id=$1",[candidates[0].id]),/append-only/);
  assert.equal((await query('SELECT state FROM ingestion_records WHERE id=$1',[submitted.id])).rows[0].state,'approved');

  const referenceText='A database index is a data structure that can reduce the rows examined by a query, with storage and update costs.';
  const [sourceId,documentId,versionId,chunkId,recordId]=[randomUUID(),randomUUID(),randomUUID(),randomUUID(),randomUUID()];
  const permissionHash=hash('fictional disposable technical-reference permission');
  await query(`INSERT INTO sources(id,stable_key,source_type,title,license_id,terms_revision,policy_revision,permission_status,permission_evidence,
    attribution,review_status,state,reviewed_by,reviewed_at,adapter_name,permission_basis,permission_evidence_hash)
    VALUES($1,'fixture:sql-index-reference','licensed-reference','Fictional SQL reference','fixture-license','fixture-terms-v1','fixture-policy-v1',
    'permitted','Fictional disposable permission; not an external source','Disposable test fixture','approved','enabled',$2,now(),'operator-import','fixture-only',$3)`,
  [sourceId,reviewerId,permissionHash]);
  await query("INSERT INTO ingestion_adapters(source_id,adapter_id,adapter_version,contract) VALUES($1,'operator-import','1','{\"fixture\":false}')",[sourceId]);
  await query('INSERT INTO source_documents(id,source_id,external_key) VALUES($1,$2,$3)',[documentId,sourceId,'fixture-reference-v1']);
  const refHash=hash(referenceText);
  await query(`INSERT INTO source_document_versions(id,document_id,version,title,fetched_at,reviewed_at,reviewed_by,content_hash,normalized_text,
    policy_revision,permission_status,review_status,quality,pii_status,confidentiality_status,status)
    VALUES($1,$2,1,'Fictional SQL reference',now(),now(),$3,$4,$5,'fixture-policy-v1','permitted','approved','technical-reference','clear','clear','published')`,
  [versionId,documentId,reviewerId,refHash,referenceText]);
  await query(`INSERT INTO source_chunks(id,document_version_id,chunk_index,excerpt,content_hash,chunker_version,section,start_offset,end_offset,status)
    VALUES($1,$2,0,$3,$4,'fixture-v1','Indexes',0,char_length($3),'active')`,[chunkId,versionId,referenceText,refHash]);
  await query(`INSERT INTO ingestion_records(id,source_id,document_version_id,input_hash,state,reviewed_by,reviewed_at)
    VALUES($1,$2,$3,$4,'published',$5,now())`,[recordId,sourceId,versionId,refHash,reviewerId]);

  const {EmbeddingClient}=await import('../dist/retrieval/embeddingClient.js');
  const originalEmbed=EmbeddingClient.prototype.embed;
  EmbeddingClient.prototype.embed=successEmbedder.embed;
  const first=candidates[0];let firstPublishResponse;
  try{firstPublishResponse=await request(app).post(`/api/content-intelligence/review/candidates/${first.id}/publish`)
    .set('Cookie',reviewerCookie).send({expectedHash:first.content_hash}).expect(200);}
  finally{EmbeddingClient.prototype.embed=originalEmbed;}
  const firstPublished=firstPublishResponse.body;
  assert.equal(firstPublished.embeddingReady,true);assert.equal(firstPublished.publicationClass,'fresh/provisional');
  assert.equal((await query('SELECT publication_class FROM content_question_readiness WHERE question_version_id=$1',[firstPublished.questionVersionId])).rows[0].publication_class,'fresh/provisional');
  await editorial.addTechnicalReference(userId,firstPublished.questionVersionId,chunkId);
  const session=await sessionRepository.create({user:userId,role:'Backend Developer',level:'junior',interviewType:'oral-only'});
  session.questions=[{questionVersionId:firstPublished.questionVersionId,questionText:questions[0],questionType:'oral',isSubmitted:false,isEvaluated:false}];
  await sessionRepository.save(session);
  aiService.draftRubric=async question=>({concepts:[{key:'index-basics',label:'Index behavior',description:`Explain how an index supports this question: ${question}`,
    importance:100,required:true,sourceIds:[chunkId]}],
    evidenceIndicators:[{conceptKey:'index-basics',supportedEvidence:['Mentions lookup acceleration'],missingEvidence:['Omits update cost'],sourceIds:[chunkId]}],
    misconceptions:[{conceptKey:'index-basics',description:'Assumes indexes are free to maintain',sourceIds:[chunkId]}],
    dimensionGuidance:[{dimension:'trade-off-awareness',guidance:'Look for storage and update costs',sourceIds:[chunkId]}],
    followUpConcepts:[{key:'index-selectivity',label:'Selectivity',description:'Explain when an index helps',sourceIds:[chunkId]}],codingObjectiveEvidence:null});
  const goodDraft=aiService.draftRubric;
  aiService.draftRubric=async()=>{throw Object.assign(new Error('safe fixture'),{code:'rubric_draft_schema_validation_failed'});};
  const failedDraft=await request(app).post(`/api/content-intelligence/scoring/${firstPublished.questionVersionId}/draft`)
    .set('Cookie',reviewerCookie).expect(502);
  assert.equal(failedDraft.body.code,'rubric_draft_schema_validation_failed');
  assert.equal(failedDraft.body.requestId,failedDraft.headers['x-request-id']);
  aiService.draftRubric=goodDraft;
  const draftResponse=await request(app).post(`/api/content-intelligence/scoring/${firstPublished.questionVersionId}/draft`)
    .set('Cookie',reviewerCookie).expect(200);
  const draft=draftResponse.body;
  assert.equal(draft.content.misconceptions.length,1);assert.equal(draft.content.followUpConcepts[0].key,'index-selectivity');
  const approved=await editorial.approveScoringPacket(userId,draft.id,draft.hash);
  assert.equal(approved.publicationClass,'reviewed/scoring-ready');

  const provisional=await editorial.publishQuestion(userId,candidates[1].id,candidates[1].content_hash,successEmbedder);
  assert.equal(provisional.publicationClass,'fresh/provisional');
  assert.equal((await query('SELECT publication_class FROM content_question_readiness WHERE question_version_id=$1',[provisional.questionVersionId])).rows[0].publication_class,'fresh/provisional');
  const readinessAfter=await request(app).get('/api/interview-plans/capabilities').set('Cookie',reviewerCookie).expect(200);
  assert.equal(readinessAfter.body.eligibleReviewedQuestions,1,'planner readiness increases only after reference, rubric approval, and retrieval embedding are all present');
  assert.equal(readinessAfter.body.provisionalQuestions,1,'provisional questions remain separate from reviewed planner eligibility');
  const {RetrievalService}=await import('../dist/retrieval/service.js');
  const retrieval=new RetrievalService(successEmbedder);
  const {plannerService}=await import('../dist/planner/service.js');
  plannerService.retriever=retrieval;
  const provisionalCheck=await plannerService.preview(userId,{role:'Backend Developer',level:'junior',taxonomyVersion:'junior-se-v1',
    competencies:['dbms-sql'],difficulty:'standard',mode:'coding',count:3,minutes:45,language:'en',codeLanguage:'javascript',modifiers:{}});
  assert.ok(provisionalCheck.items.length>0,'a reviewed dynamic item remains usable while newer provisional content is present');
  assert.ok(provisionalCheck.items.every(item=>['DYNAMIC_REVIEWED','DYNAMIC_PROVISIONAL'].includes(item.inventoryClass)));
  await editorial.linkQuestionFamily(userId,candidates[1].id,candidates[1].content_hash,candidates[0].id);
  assert.ok((await query('SELECT duplicate_links FROM ingestion_candidates WHERE id=$1',[candidates[1].id])).rows[0].duplicate_links.some(link=>link.kind==='family'&&link.candidateId===candidates[0].id));

  const result=await retrieval.retrieveQuestions({query:questions[0],filters:{taxonomyVersion:'junior-se-v1',role:'Backend Developer'},limit:5,minimumSimilarity:0});
  assert.equal(result.outcome,'success');assert.ok(result.hits.some(hit=>hit.questionVersionId===firstPublished.questionVersionId));
  await editorial.removeTechnicalReference(userId,firstPublished.questionVersionId,chunkId,'reference-withdrawn');
  assert.equal((await query('SELECT publication_class FROM content_question_readiness WHERE question_version_id=$1',[firstPublished.questionVersionId])).rows[0].publication_class,'fresh/provisional');

  const unavailable=await editorial.publishQuestion(userId,candidates[2].id,candidates[2].content_hash,failedEmbedder);
  assert.equal(unavailable.embeddingReady,false);assert.equal(unavailable.publicationClass,'approved-not-retrieval-ready');
  assert.equal((await query("SELECT count(*)::int AS n FROM embedding_metadata WHERE question_version_id=$1 AND purpose='question-selection' AND status='active'",[unavailable.questionVersionId])).rows[0].n,0);
  await editorial.supersedeQuestion(userId,candidates[2].id,candidates[2].content_hash,candidates[0].id);
  assert.equal((await query('SELECT state FROM ingestion_candidates WHERE id=$1',[candidates[0].id])).rows[0].state,'superseded');
  assert.equal((await query('SELECT status FROM question_versions WHERE id=$1',[firstPublished.questionVersionId])).rows[0].status,'retired');
  const historical=await sessionRepository.findByIdForUser(session._id,userId);
  assert.equal(historical.questions[0].questionVersionId,firstPublished.questionVersionId);
  assert.equal(historical.questions[0].questionText,questions[0]);

  const manualReference=await request(app).post('/api/content-intelligence/review/manual-references').set('Cookie',reviewerCookie)
    .send({title:'Fictional SQL index reference',text:referenceText,permissionEvidence:'Authored for this disposable fixture; no external material used.',
      attribution:'Aptlyra fixture',authorshipAttested:true}).expect(201);
  const manualQueue=await request(app).get('/api/content-intelligence/review/manual-references').set('Cookie',reviewerCookie).expect(200);
  const staged=manualQueue.body.find(item=>item.record_id===manualReference.body.recordId);
  assert.ok(staged);assert.equal(staged.content_hash,hash(referenceText));
  assert.equal((await query("SELECT count(*)::int AS n FROM retrieval_entities WHERE entity_id=$1 AND purpose='technical-reference'",[manualReference.body.recordId])).rows[0].n,0);
  const staleApproval=await request(app).post(`/api/content-intelligence/review/manual-references/${staged.record_id}/approve`)
    .set('Cookie',reviewerCookie).send({expectedHash:'f'.repeat(64)}).expect(409);
  assert.equal(staleApproval.body.code,'review-hash-mismatch');
  EmbeddingClient.prototype.embed=successEmbedder.embed;
  let approvedReferenceResponse;
  try{approvedReferenceResponse=await request(app).post(`/api/content-intelligence/review/manual-references/${staged.record_id}/approve`)
    .set('Cookie',reviewerCookie).send({expectedHash:staged.content_hash}).expect(200);}
  finally{EmbeddingClient.prototype.embed=originalEmbed;}
  const approvedReference=approvedReferenceResponse.body;
  assert.equal(approvedReference.state,'published');assert.equal(approvedReference.embeddingReady,true);
  const manualAudit=(await query('SELECT action,content_hash FROM ingestion_review_events WHERE record_id=$1 ORDER BY created_at,id',[staged.record_id])).rows;
  assert.deepEqual(new Set(manualAudit.map(row=>row.action)),new Set(['received','review-required','source-approved','approved','published']));
  assert.ok(manualAudit.every(row=>row.content_hash===staged.content_hash));

  const manuallyCreated=await request(app).post('/api/content-intelligence/review/manual-questions').set('Cookie',reviewerCookie)
    .send({question:'How can an index improve reads while increasing write cost?',topic:'dbms-sql.transactions-indexes',mode:'oral',
      difficulty:'standard',sourceNote:'Written for this disposable review fixture.',authorshipAttested:true,allowAi:false}).expect(201);
  assert.equal(manuallyCreated.body.aiApproved,false);
  const manualQueueBefore=await request(app).get('/api/content-intelligence/review/candidates').set('Cookie',reviewerCookie).expect(200);
  assert.ok(manualQueueBefore.body.some(item=>item.candidate_id===manuallyCreated.body.candidateId));
  assert.equal((await query('SELECT count(*)::int AS n FROM candidate_ai_review_packets WHERE candidate_id=$1',[manuallyCreated.body.candidateId])).rows[0].n,0,
    'a manual question does not require an AI proposal and AI did not approve it');
  await request(app).post(`/api/content-intelligence/review/candidates/${manuallyCreated.body.candidateId}/approve`)
    .set('Cookie',reviewerCookie).send({expectedHash:manuallyCreated.body.contentHash}).expect(200);
  assert.equal((await query('SELECT state FROM ingestion_candidates WHERE id=$1',[manuallyCreated.body.candidateId])).rows[0].state,'approved');
  const originalQuestionEmbed=EmbeddingClient.prototype.embed;
  EmbeddingClient.prototype.embed=successEmbedder.embed;
  let manuallyPublished;
  try{manuallyPublished=await request(app).post(`/api/content-intelligence/review/candidates/${manuallyCreated.body.candidateId}/publish`)
    .set('Cookie',reviewerCookie).send({expectedHash:manuallyCreated.body.contentHash}).expect(200);}
  finally{EmbeddingClient.prototype.embed=originalQuestionEmbed;}
  assert.equal(manuallyPublished.body.publicationClass,'fresh/provisional');
  await editorial.addTechnicalReference(userId,manuallyPublished.body.questionVersionId,chunkId);
  const manualDraft=await request(app).post(`/api/content-intelligence/scoring/${manuallyPublished.body.questionVersionId}/draft`)
    .set('Cookie',reviewerCookie).expect(200);
  const manualRubric=await request(app).post(`/api/content-intelligence/scoring/drafts/${manualDraft.body.id}/approve`)
    .set('Cookie',reviewerCookie).send({expectedHash:manualDraft.body.hash}).expect(200);
  assert.equal(manualRubric.body.publicationClass,'reviewed/scoring-ready');
  const finalBank=await request(app).get('/api/content-intelligence/interview-bank').set('Cookie',reviewerCookie).expect(200);
  assert.equal(finalBank.body.approvedNewQuestions,1);
  assert.equal(finalBank.body.totalAvailable,1);
  assert.ok(finalBank.body.questions.some(item=>item.question_version_id===manuallyPublished.body.questionVersionId));
  const manualQueueAfter=await request(app).get('/api/content-intelligence/review/candidates').set('Cookie',reviewerCookie).expect(200);
  assert.ok(!manualQueueAfter.body.some(item=>item.candidate_id===manuallyCreated.body.candidateId),
    'a reviewed dynamic question leaves Review Queue and appears in Interview Bank');
  const completedScoring=await request(app).get('/api/content-intelligence/scoring-queue').set('Cookie',reviewerCookie).expect(200);
  assert.ok(!completedScoring.body.some(item=>item.question_version_id===manuallyPublished.body.questionVersionId));
  await query('DROP VIEW IF EXISTS content_question_readiness');
  await query('DROP VIEW IF EXISTS content_question_readiness_base');
  await query('DROP TABLE seed_question_review_approvals');
  const missingSeedSchema=await request(app).get('/api/content-intelligence/seed-review').set('Cookie',reviewerCookie).expect(503);
  assert.equal(missingSeedSchema.body.code,'seed-review-schema-unavailable');
  assert.equal(missingSeedSchema.body.requestId,missingSeedSchema.headers['x-request-id']);
});
