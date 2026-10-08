/** Full content editorial fixture. It uses only temporary localhost PostgreSQL and fake provider/embedding seams. */
import assert from 'node:assert/strict';
import { createHash,randomUUID } from 'node:crypto';
import { before,after,test } from 'node:test';
import pg from 'pg';
for(const key of ['DATABASE_URL','NEON_DATABASE_URL','REDIS_URL','UPSTASH_REDIS_URL'])if(process.env[key])throw new Error(`Unset ${key}: content E2E uses disposable localhost fixtures only`);
const fixtureUrl='postgresql://techvera_test:techvera_local_fixture@127.0.0.1:15432/techvera_test';
const admin=new pg.Pool({connectionString:fixtureUrl,ssl:false}),dbName=`aptlyra_content_e2e_${randomUUID().replaceAll('-','')}`;
const userId=randomUUID(),reviewerId='phase85-e2e-reviewer';
let pool,query,submissions,editorial,aiService,sessionRepository,originalExtract,originalDraft;
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
  originalExtract=aiService.extractInterviewExperience;originalDraft=aiService.draftRubric;
  await query('INSERT INTO users(id,name,email) VALUES($1,$2,$3)',[userId,'Disposable editorial fixture','editorial-fixture@example.invalid']);
  await query("INSERT INTO ingestion_reviewers(id,display_name,kind,user_id) VALUES($1,'Disposable human reviewer','human',$2)",[reviewerId,userId]);
});

after(async()=>{
  try{if(aiService){aiService.extractInterviewExperience=originalExtract;aiService.draftRubric=originalDraft;}if(pool)await pool.end();
    await admin.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);}
  finally{await admin.end();delete process.env.DATABASE_URL;delete process.env.DATABASE_SSL;delete process.env.INTERNAL_API_KEY;delete process.env.AI_SERVICE_URL;}
});

test('quarantine → extraction → human reviews → technical grounding/rubric → pgvector publication → immediate retrieval',async()=>{
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
  for(const candidate of candidates)await editorial.approveQuestion(userId,candidate.id,candidate.content_hash);
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

  const first=candidates[0],firstPublished=await editorial.publishQuestion(userId,first.id,first.content_hash,successEmbedder);
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
  const draft=await editorial.draftScoringPacket(userId,firstPublished.questionVersionId);
  assert.equal(draft.content.misconceptions.length,1);assert.equal(draft.content.followUpConcepts[0].key,'index-selectivity');
  const approved=await editorial.approveScoringPacket(userId,draft.id,draft.hash);
  assert.equal(approved.publicationClass,'reviewed/scoring-ready');

  const provisional=await editorial.publishQuestion(userId,candidates[1].id,candidates[1].content_hash,successEmbedder);
  assert.equal(provisional.publicationClass,'fresh/provisional');
  assert.equal((await query('SELECT publication_class FROM content_question_readiness WHERE question_version_id=$1',[provisional.questionVersionId])).rows[0].publication_class,'fresh/provisional');
  await editorial.linkQuestionFamily(userId,candidates[1].id,candidates[1].content_hash,candidates[0].id);
  assert.ok((await query('SELECT duplicate_links FROM ingestion_candidates WHERE id=$1',[candidates[1].id])).rows[0].duplicate_links.some(link=>link.kind==='family'&&link.candidateId===candidates[0].id));

  const {RetrievalService}=await import('../dist/retrieval/service.js');
  const retrieval=new RetrievalService(successEmbedder);
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
});
