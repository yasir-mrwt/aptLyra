/** Actual PostgreSQL constraints/repositories. Only disposable localhost databases. */
import assert from 'node:assert/strict';
import { test, before, after } from 'node:test';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, writeFile, cp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { runMigrations, migrationDirectory } from '../dist/database/migrations.js';

for (const key of ['DATABASE_URL','NEON_DATABASE_URL','REDIS_URL','UPSTASH_REDIS_URL']) {
  if (process.env[key]) throw new Error(`Unset ${key}: schema tests use only disposable localhost fixtures`);
}
const fixtureUrl = 'postgresql://techvera_test:techvera_local_fixture@127.0.0.1:15432/';
const admin = new pg.Pool({ connectionString: fixtureUrl + 'techvera_test', ssl: false });
const suffix = randomUUID().replaceAll('-','');
// Names are internally generated, never taken from environment/user input.
const dbName = 'techvera_phase3_' + suffix;
const adoptionName = 'techvera_adoption_' + suffix;
let pool, query, bootstrapSchema, lock, repo, sessions, adoption;
let initialMigrations, secondMigrations, fixture;
const owner = randomUUID(), other = randomUUID();
const hash = 'a'.repeat(64);
const now = '2026-10-05T00:00:00Z';
const anchors = {0:'Absent',1:'Major gaps',2:'Partial',3:'Mostly correct',4:'Correct'};
const dimensions = ['correctness','concept-coverage','reasoning','practical-application','trade-off-awareness','communication-clarity']
  .map((dimension,i) => ({dimension,aggregation:i === 5 ? 'delivery' : 'technical',applicable:true,weight:[45,20,20,10,5,0][i],anchors}));
const planInput = sessionId => ({sessionId,contractVersion:'plan-v1',plannerVersion:'fixture',taxonomyVersion:'junior-se-v1',
  corpusVersion:'fixture',role:'Backend Developer',mode:'mixed',requestedCount:3,effectiveCount:0,
  requestedMinutes:30,effectiveMinutes:30,selectedCompetencies:['dbms-sql'],shortages:['Preparatory fixture']});

async function rejected(sql, params = [], code = '23514') {
  await assert.rejects(() => lock('fixture:invalid', () => query(sql,params)), e => e.code === code);
}
async function buildFixture() {
  const source = await repo.createSource({stableKey:'fixture-ref',type:'authored',title:'Fixture reference',policyRevision:'1',
    permissionStatus:'permitted',termsRevision:'1',permissionEvidence:'Authored fixture',licenseId:'fixture',
    reviewStatus:'approved',state:'enabled',reviewedBy:'Fixture reviewer',reviewedAt:now});
  const document = await repo.createDocument(source,'fixture-doc');
  const documentVersion = await repo.createDocumentVersion({documentId:document,version:1,title:'SQL reference',contentHash:hash,
    text:'NULL requires IS NULL',policyRevision:'1',permissionStatus:'permitted',reviewStatus:'approved',
    quality:'technical-reference',piiStatus:'clear',confidentialityStatus:'clear',status:'published',reviewedAt:now,reviewedBy:'Fixture reviewer',fetchedAt:now});
  const chunk = await repo.createChunk({documentVersionId:documentVersion,index:0,excerpt:'NULL requires IS NULL',contentHash:hash,chunkerVersion:'fixture-v1'});
  const question = await repo.createQuestion({familyKey:'null-check',taxonomyVersion:'junior-se-v1',primaryCompetency:'dbms-sql.queries'});
  const version = await repo.createQuestionVersion({questionId:question,version:1,text:'Explain NULL checks',category:'conceptual-oral',
    difficulty:'easy',origin:'retrieved',evidenceStatus:'available',contentHash:hash,reviewedBy:'Fixture reviewer',reviewedAt:now,publish:true,
    provenance:[{documentVersionId:documentVersion,chunkId:chunk,relation:'editorial'}],secondaryCompetencies:['programming.control-data']});
  const rubric = await repo.createRubric(question);
  const rubricInput = {rubricId:rubric,questionVersionId:version,version:1,kind:'known',scoringPolicyVersion:'technical-v1',
    reviewedBy:'Fixture reviewer',reviewedAt:now,dimensions,concepts:[{key:'null-semantics',label:'NULL semantics',
      description:'Use IS NULL for absent values',importance:1,essential:true,referenceChunkIds:[chunk]}]};
  const rubricVersion = await repo.createRubricVersion(rubricInput);
  const session = await sessions.create({user:owner,role:'Backend Developer',level:'Junior',interviewType:'oral-only'});
  const plan = await repo.createPlan(owner,planInput(session._id));
  const retrieval = await repo.recordRetrieval(owner,{operationKey:randomUUID(),sessionId:session._id,planId:plan,queryHash:hash,
    corpusVersion:'fixture',sourcePolicyRevision:'1',outcome:'hits',results:[{questionVersionId:version,rank:1,similarity:0.9,selected:true,reason:'Fixture'}]});
  const item = await repo.addPlanItem(owner,{planId:plan,position:0,questionVersionId:version,rubricVersionId:rubricVersion,
    retrievalId:retrieval,selectionReason:'Fixture only',estimatedMinutes:3});
  const answer = await repo.createAnswerAttempt(owner,{planItemId:item,attempt:1,inputKind:'text',text:'Use IS NULL',contentHash:hash});
  const concept = (await query('SELECT id FROM expected_concepts WHERE rubric_version_id=$1',[rubricVersion])).rows[0].id;
  const evaluationInput = {answerAttemptId:answer,rubricVersionId:rubricVersion,scoringPolicyVersion:'technical-v1',revision:1,
    status:'succeeded',technicalScore:80,evaluatorConfidence:'high',dimensions:{correctness:4},
    evidence:[{conceptId:concept,answerStart:0,answerEnd:11,referenceChunkId:chunk,judgment:'satisfied',explanation:'Fixture text span',reasonCode:'concept-present'}]};
  const evaluation = await repo.recordEvaluation(owner,evaluationInput);
  return {source,document,documentVersion,chunk,question,version,rubric,rubricInput,rubricVersion,session,plan,retrieval,item,answer,concept,evaluation,evaluationInput};
}
before(async () => {
  await admin.query(`CREATE DATABASE ${dbName}`);
  await admin.query(`CREATE DATABASE ${adoptionName}`);
  process.env.DATABASE_URL = fixtureUrl + dbName;
  process.env.DATABASE_SSL = 'false'; process.env.NODE_ENV = 'test';
  ({pool,query,bootstrapSchema,withDatabaseLock:lock} = await import('../dist/config/db.js'));
  ({knowledgeRepository:repo} = await import('../dist/repositories/knowledgeRepository.js'));
  ({sessionRepository:sessions} = await import('../dist/models/Session.js'));
  assert.equal((await query("SELECT to_regclass('users') AS name")).rows[0].name,null);
  initialMigrations = await runMigrations(pool);
  secondMigrations = await runMigrations(pool);
  for (const id of [owner,other]) await query('INSERT INTO users(id,name,email) VALUES($1,$2,$3)',[id,'Fixture',`${id}@example.invalid`]);
  fixture = await buildFixture();
  adoption = new pg.Pool({connectionString:fixtureUrl+adoptionName,ssl:false});
});
after(async () => {
  if (pool) await pool.end();
  if (adoption) await adoption.end();
  try {
    // Drop only the databases generated by this test run; never the fixture baseline.
    await admin.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
    await admin.query(`DROP DATABASE IF EXISTS ${adoptionName} WITH (FORCE)`);
  } finally { await admin.end(); }
});

test('clean database, history, repeated and concurrent migration no-ops', async () => {
  assert.equal(initialMigrations.applied.length,4);
  assert.deepEqual(secondMigrations.applied,[]);
  const history = (await query('SELECT * FROM schema_migrations ORDER BY name')).rows;
  assert.equal(history.length,4); assert.ok(history.every(r => /^[a-f0-9]{64}$/.test(r.checksum) && r.applied_at));
  const runs = await Promise.all([runMigrations(pool),runMigrations(pool)]);
  assert.ok(runs.every(r => !r.applied.length));
});
test('compiled migration CLI runs twice and requires explicit production apply', async () => {
  const directory=await mkdtemp(join(tmpdir(),'techvera-migration-cli-'));
  const cli=fileURLToPath(new URL('../dist/database/migrate-cli.js',import.meta.url));
  const env={DATABASE_URL:fixtureUrl+dbName,DATABASE_SSL:'false',NODE_ENV:'test'};
  const execute=promisify(execFile);
  try {
    for (let n=0;n<2;n++) {
      const result=await execute(process.execPath,[cli],{cwd:directory,env});
      assert.match(result.stdout,/Migrations current: 4; applied: none/);
    }
    await assert.rejects(()=>execute(process.execPath,[cli],{cwd:directory,env:{...env,NODE_ENV:'production'}}),
      e=>e.code===1 && e.stderr.includes('require explicit --apply') && !e.stderr.includes(fixtureUrl));
  } finally { await rm(directory,{recursive:true,force:true}); }
});
test('legacy bootstrap remains compatible before and after migration adoption', async () => {
  const baseline = await readFile(join(migrationDirectory,'001_legacy_baseline.sql'),'utf8');
  const source = await readFile(new URL('../config/db.ts',import.meta.url),'utf8');
  assert.equal(baseline.split('\n').slice(1).join('\n').trim(),source.split('const SCHEMA_SQL = `')[1].split('`;')[0].trim());
  await adoption.query(baseline);
  const user=randomUUID(), session=randomUUID();
  const questions=[{questionText:'Legacy fixture',idealAnswer:'Answer',questionType:'oral',isEvaluated:true,technicalScore:70,confidenceScore:60}];
  await adoption.query('INSERT INTO users(id,name,email) VALUES($1,$2,$3)',[user,'Legacy','legacy@example.invalid']);
  await adoption.query("INSERT INTO sessions(id,user_id,role,level,interview_type,questions) VALUES($1,$2,'Backend','Junior','oral-only',$3)",[session,user,JSON.stringify(questions)]);
  await runMigrations(adoption);
  assert.deepEqual((await adoption.query('SELECT questions FROM sessions WHERE id=$1',[session])).rows[0].questions,questions);
  await bootstrapSchema(); await bootstrapSchema();
  const legacy=await sessions.create({user:owner,role:'Legacy broad role',level:'Senior',interviewType:'oral-only'});
  legacy.questions=questions; await sessions.save(legacy);
  assert.deepEqual((await sessions.findByIdForUser(legacy._id,owner)).questions,questions);
  assert.equal(await repo.sessionStorageKind(legacy._id,owner),'legacy');
  assert.equal(await repo.sessionStorageKind(fixture.session._id,owner),'versioned');
  assert.equal(await repo.sessionStorageKind(legacy._id,other),null);
});
test('migration failure rolls back DDL/history and a corrected unapplied file can resume', async () => {
  const directory=await mkdtemp(join(tmpdir(),'techvera-migrations-'));
  try {
    for (const name of initialMigrations.current) await cp(join(migrationDirectory,name),join(directory,name));
    await writeFile(join(directory,'005_failure.sql'),'CREATE TABLE rollback_marker(id integer); SELECT deliberately_missing_function();');
    await assert.rejects(() => runMigrations(adoption,directory),/005_failure.sql rolled back/);
    assert.equal((await adoption.query("SELECT to_regclass('rollback_marker') AS name")).rows[0].name,null);
    assert.equal((await adoption.query('SELECT count(*)::int AS n FROM schema_migrations')).rows[0].n,4);
    await writeFile(join(directory,'005_failure.sql'),'CREATE TABLE rollback_marker(id integer);');
    assert.deepEqual((await runMigrations(adoption,directory)).applied,['005_failure.sql']);
    assert.deepEqual((await runMigrations(adoption,directory)).applied,[]);
    await writeFile(join(directory,'001_legacy_baseline.sql'),'SELECT 1;');
    await assert.rejects(() => runMigrations(adoption,directory),/history mismatch/);
    await assert.rejects(() => runMigrations(adoption),/history mismatch/);
    await writeFile(join(directory,'005_duplicate.sql'),'SELECT 1;');
    await assert.rejects(() => runMigrations(adoption,directory),/Duplicate migration/);
  } finally { await rm(directory,{recursive:true,force:true}); }
});
test('taxonomy has the exact eight roots / 24 children and strict parent integrity', async () => {
  const rows=await repo.listCompetencies('junior-se-v1');
  const roots=rows.filter(r => r.kind==='root'); const children=rows.filter(r => r.kind==='child');
  assert.deepEqual(roots.map(r=>r.id),['dsa','oop','dbms-sql','os','networks','backend-web','design-lite','programming']);
  assert.equal(children.length,24);
  const documented=await readFile(new URL('../../docs/competency-taxonomy.md',import.meta.url),'utf8');
  for (const root of roots) {
    const row=documented.split('\n').find(line=>line.startsWith(`| \`${root.id}\` —`));
    const suffixes=[...row.split('|')[2].matchAll(/`([^`]+)`/g)].map(m=>m[1]);
    assert.deepEqual(children.filter(c=>c.parent_id===root.id).map(c=>c.id),suffixes.map(s=>root.id+'.'+s));
  }
  await rejected("INSERT INTO competencies(taxonomy_version,id,kind,parent_id,parent_kind,display_name,description,sort_order) VALUES('junior-se-v1','dsa.bad','child','oop','root','Bad','Bad',99)");
  await rejected("INSERT INTO competencies(taxonomy_version,id,kind,parent_id,parent_kind,display_name,description,sort_order) VALUES('junior-se-v1','dsa.bad','child','dsa',NULL,'Bad','Bad',99)");
  await rejected("INSERT INTO competencies SELECT * FROM competencies WHERE id='dsa'",[],'23505');
  await rejected("DELETE FROM competencies WHERE taxonomy_version='junior-se-v1' AND id='dbms-sql.queries'",[],'23503');
});
test('source dates remain unknown; license/review checks, uniqueness and bounded chunks', async () => {
  const version=(await query('SELECT * FROM source_document_versions WHERE id=$1',[fixture.documentVersion])).rows[0];
  assert.equal(version.occurred_at,null); assert.equal(version.published_at,null); assert.ok(version.fetched_at);
  await rejected("UPDATE sources SET permission_status='unknown' WHERE id=$1",[fixture.source]);
  await assert.rejects(()=>repo.createDocument(fixture.source,'fixture-doc'),e=>e.code==='23505');
  await assert.rejects(()=>repo.createChunk({documentVersionId:fixture.documentVersion,index:1,excerpt:'x'.repeat(16001),contentHash:hash,chunkerVersion:'1'}),e=>e.code==='23514');
  await assert.rejects(()=>repo.createChunk({documentVersionId:randomUUID(),index:0,excerpt:'text',contentHash:hash,chunkerVersion:'1'}),e=>e.code==='23503');
  await rejected('UPDATE source_document_versions SET title=$2 WHERE id=$1',[fixture.documentVersion,'Changed']);
  await rejected('UPDATE source_chunks SET excerpt=$2 WHERE id=$1',[fixture.chunk,'Changed']);
  const disabled=await repo.createSource({stableKey:'disabled-fixture',type:'authored',title:'Disabled fixture',policyRevision:'1',
    permissionStatus:'unknown',reviewStatus:'proposed',state:'disabled'});
  const unpublished=await repo.createDocument(disabled,'unapproved');
  await assert.rejects(()=>repo.createDocumentVersion({documentId:unpublished,version:1,title:'Cannot publish',contentHash:hash,
    policyRevision:'1',permissionStatus:'permitted',reviewStatus:'approved',quality:'technical-reference',piiStatus:'clear',
    confidentialityStatus:'clear',status:'published',reviewedAt:now,reviewedBy:'Fixture reviewer'}),e=>e.code==='23514');
});
test('question category/difficulty/origin and taxonomy constraints; explicit unavailable provenance', async () => {
  for (const [field,value] of [['category','hr'],['difficulty','senior'],['origin','internet']]) {
    const input={questionId:fixture.question,version:2,text:'Fixture question',category:'scenario',difficulty:'standard',origin:'generated',evidenceStatus:'unavailable',contentHash:hash,[field]:value};
    await assert.rejects(()=>repo.createQuestionVersion(input),e=>e.code==='23514');
  }
  await assert.rejects(()=>repo.createQuestion({familyKey:'invalid',taxonomyVersion:'junior-se-v1',primaryCompetency:'dbms-sql'}),e=>e.code==='23503');
  await assert.rejects(()=>repo.createQuestionVersion({questionId:fixture.question,version:2,text:'Q',category:'scenario',difficulty:'easy',origin:'retrieved',evidenceStatus:'available',contentHash:hash,reviewedBy:'Fixture reviewer',reviewedAt:now,publish:true}),e=>e.code==='23514');
  const generated=await repo.createQuestionVersion({questionId:fixture.question,version:2,text:'Generated fixture',category:'scenario',difficulty:'standard',origin:'generated',evidenceStatus:'unavailable',contentHash:hash,reviewedBy:'Fixture reviewer',reviewedAt:now,publish:true});
  assert.equal((await repo.findQuestionVersion(generated)).origin,'generated');
  await assert.rejects(()=>repo.createQuestionVersion({questionId:fixture.question,version:3,text:'Adapted',category:'scenario',difficulty:'easy',origin:'adapted',evidenceStatus:'unavailable',contentHash:hash}),e=>e.code==='23514');
  await assert.rejects(()=>repo.createQuestionVersion({questionId:fixture.question,version:3,text:'Bad ref',category:'scenario',difficulty:'easy',origin:'retrieved',evidenceStatus:'available',contentHash:hash,reviewedBy:'Fixture reviewer',reviewedAt:now,provenance:[{documentVersionId:randomUUID(),relation:'origin'}],publish:true}),e=>e.code==='23503');
});
test('published question content, secondary tags and provenance are immutable; changes get new versions', async () => {
  await rejected('UPDATE question_versions SET question_text=$2 WHERE id=$1',[fixture.version,'Changed']);
  await rejected("UPDATE question_versions SET status='draft' WHERE id=$1",[fixture.version]);
  await rejected('DELETE FROM question_versions WHERE id=$1',[fixture.version]);
  await rejected('DELETE FROM question_provenance WHERE question_version_id=$1',[fixture.version]);
  await rejected('DELETE FROM question_version_competencies WHERE question_version_id=$1',[fixture.version]);
  assert.equal((await repo.findQuestionVersion(fixture.version)).question_text,'Explain NULL checks');
  assert.equal((await query('SELECT count(*)::int AS n FROM question_versions WHERE question_id=$1',[fixture.question])).rows[0].n,2);
});
test('rubric review semantics, complete normalized weights, concepts/references and immutable children', async () => {
  await assert.rejects(()=>repo.createRubricVersion({...fixture.rubricInput,version:2,reviewedBy:undefined}),e=>e.code==='23514');
  await assert.rejects(()=>repo.createRubricVersion({...fixture.rubricInput,version:2,kind:'provisional'}),e=>e.code==='23514');
  await assert.rejects(()=>repo.createRubricVersion({...fixture.rubricInput,version:2,dimensions:dimensions.slice(0,5)}),e=>e.code==='23514');
  await assert.rejects(()=>repo.createRubricVersion({...fixture.rubricInput,version:2,dimensions:dimensions.map((d,i)=>({...d,weight:i===0?44:d.weight}))}),e=>e.code==='23514');
  await assert.rejects(()=>repo.createRubricVersion({...fixture.rubricInput,version:2,dimensions:dimensions.map((d,i)=>({...d,weight:i===5?1:d.weight}))}),e=>e.code==='23514');
  await assert.rejects(()=>repo.createRubricVersion({...fixture.rubricInput,version:2,concepts:[]}),e=>e.code==='23514');
  await assert.rejects(()=>repo.createRubricVersion({...fixture.rubricInput,version:2,concepts:fixture.rubricInput.concepts.map(c=>({...c,referenceChunkIds:[]}))}),e=>e.code==='23514');
  await rejected('UPDATE rubric_dimensions SET weight=44 WHERE rubric_version_id=$1 AND dimension=$2',[fixture.rubricVersion,'correctness']);
  await rejected('UPDATE expected_concepts SET label=$2 WHERE id=$1',[fixture.concept,'Changed']);
  await rejected('DELETE FROM concept_references WHERE concept_id=$1',[fixture.concept]);
  const provisional=await repo.createRubricVersion({...fixture.rubricInput,version:2,kind:'provisional',reviewedBy:undefined,reviewedAt:undefined});
  await rejected('UPDATE rubric_versions SET reviewed_by=$2 WHERE id=$1',[provisional,'Forged']);
  fixture.provisional=provisional;
  // Retirement must not open a mutation window for existing dimensions/concepts.
  await assert.rejects(()=>lock('fixture:retire',async()=>{
    await query("UPDATE rubric_versions SET status='retired' WHERE id=$1",[fixture.rubricVersion]);
    await query('UPDATE expected_concepts SET description=$2 WHERE id=$1',[fixture.concept,'Changed']);
  }),e=>e.code==='23514');
});
test('owned plans/items, ordering, exact question/rubric and retrieval context', async () => {
  assert.equal(await repo.findPlanForUser(fixture.plan,other),null);
  await assert.rejects(()=>repo.createPlan(other,planInput(fixture.session._id)),/Owned session/);
  await assert.rejects(()=>repo.addPlanItem(other,{planId:fixture.plan,position:1,questionVersionId:fixture.version,selectionReason:'Bad',estimatedMinutes:3}),/Owned plan/);
  await assert.rejects(()=>repo.addPlanItem(owner,{planId:fixture.plan,position:0,questionVersionId:fixture.version,selectionReason:'Duplicate',estimatedMinutes:3}),e=>e.code==='23505');
  await rejected('UPDATE interview_plans SET user_id=$2 WHERE id=$1',[fixture.plan,other],'23503');
  await rejected("UPDATE plan_items SET category='coding' WHERE id=$1",[fixture.item],'23503');
  const secondVersion=(await query('SELECT id FROM question_versions WHERE question_id=$1 AND version=2',[fixture.question])).rows[0].id;
  await assert.rejects(()=>repo.addPlanItem(owner,{planId:fixture.plan,position:1,questionVersionId:secondVersion,rubricVersionId:fixture.rubricVersion,selectionReason:'Mismatched rubric',estimatedMinutes:3}),e=>e.code==='23503');
});
test('follow-up parents are stable, same-plan, unique and nonrecursive', async () => {
  const probeVersion=await repo.createQuestionVersion({questionId:fixture.question,version:3,text:'Probe fixture',category:'conceptual-oral',difficulty:'easy',origin:'follow-up',evidenceStatus:'available',baseVersionId:fixture.version,contentHash:hash,reviewedBy:'Fixture reviewer',reviewedAt:now,publish:true,provenance:[{documentVersionId:fixture.documentVersion,chunkId:fixture.chunk,relation:'technical-grounding'}]});
  const probe=await repo.addPlanItem(owner,{planId:fixture.plan,position:1,questionVersionId:probeVersion,parentItemId:fixture.item,selectionReason:'Probe fixture',estimatedMinutes:2});
  await assert.rejects(()=>repo.addPlanItem(owner,{planId:fixture.plan,position:2,questionVersionId:probeVersion,parentItemId:probe,selectionReason:'Recursive',estimatedMinutes:2}),e=>e.code==='23514');
  await assert.rejects(()=>repo.addPlanItem(owner,{planId:fixture.plan,position:2,questionVersionId:probeVersion,parentItemId:fixture.item,selectionReason:'Duplicate probe',estimatedMinutes:2}),e=>e.code==='23505');
  await rejected('UPDATE plan_items SET parent_item_id=$2 WHERE id=$1',[probe,probe]);
});
test('retrieval IDs/ranks/targets/context are validated and bad batches roll back', async () => {
  const input={operationKey:randomUUID(),sessionId:fixture.session._id,planId:fixture.plan,queryHash:hash,corpusVersion:'fixture',sourcePolicyRevision:'1',outcome:'hits'};
  await assert.rejects(()=>repo.recordRetrieval(other,{...input,results:[]}),/Owned session/);
  await assert.rejects(()=>repo.recordRetrieval(owner,{...input,results:[{rank:1,reason:'No target'}]}),e=>e.code==='23514');
  await assert.rejects(()=>repo.recordRetrieval(owner,{...input,results:[{chunkId:randomUUID(),rank:1,reason:'Bad FK'}]}),e=>e.code==='23503');
  await assert.rejects(()=>repo.recordRetrieval(owner,{...input,results:[{chunkId:fixture.chunk,rank:1,similarity:1.1,reason:'Bad score'}]}),e=>e.code==='23514');
  await assert.rejects(()=>repo.recordRetrieval(owner,{...input,results:[1,1].map(rank=>({chunkId:fixture.chunk,rank,reason:'Duplicate rank'}))}),e=>e.code==='23505');
  assert.equal((await query('SELECT count(*)::int AS n FROM retrieval_evidence WHERE operation_key=$1',[input.operationKey])).rows[0].n,0);
});
test('answers and evaluations deny cross-user access and reject invalid score/confidence/evidence', async () => {
  assert.equal(await repo.findAnswerForUser(fixture.answer,other),null);
  assert.equal(await repo.findEvaluationForUser(fixture.evaluation,other),null);
  await assert.rejects(()=>repo.createAnswerAttempt(other,{planItemId:fixture.item,attempt:2,inputKind:'text',text:'Bad',contentHash:hash}),/Owned plan item/);
  await assert.rejects(()=>repo.recordEvaluation(other,{...fixture.evaluationInput,revision:2}),/Owned answer/);
  for (const technicalScore of [-1,101,NaN]) await assert.rejects(()=>repo.recordEvaluation(owner,{...fixture.evaluationInput,revision:2,technicalScore}),e=>e.code==='23514');
  await assert.rejects(()=>repo.recordEvaluation(owner,{...fixture.evaluationInput,revision:2,evaluatorConfidence:undefined}),e=>e.code==='23514');
  await assert.rejects(()=>repo.recordEvaluation(owner,{...fixture.evaluationInput,revision:2,status:'abstained',technicalScore:undefined,evaluatorConfidence:'high'}),e=>e.code==='23514');
  await assert.rejects(()=>repo.recordEvaluation(owner,{...fixture.evaluationInput,revision:2,rubricVersionId:fixture.provisional}),e=>e.code==='23514');
  await assert.rejects(()=>repo.recordEvaluation(owner,{...fixture.evaluationInput,revision:2,dimensions:{correctness:5}}),e=>e.code==='23514');
  await assert.rejects(()=>repo.recordEvaluation(owner,{...fixture.evaluationInput,revision:2,evidence:[{...fixture.evaluationInput.evidence[0],conceptId:randomUUID()}]}),e=>e.code==='23503');
  const abstained=await repo.recordEvaluation(owner,{answerAttemptId:fixture.answer,rubricVersionId:fixture.rubricVersion,scoringPolicyVersion:'technical-v1',revision:2,supersedesId:fixture.evaluation,status:'abstained',evaluatorConfidence:'low',reasonCodes:['insufficient-evidence']});
  assert.equal((await repo.findEvaluationForUser(abstained,owner)).technical_score,null);
  await rejected('UPDATE evaluations SET technical_score=100 WHERE id=$1',[fixture.evaluation]);
  await rejected('UPDATE evaluations SET supersedes_id=$2 WHERE id=$1',[fixture.evaluation,abstained]);
});
test('embedding metadata is model-neutral, exclusive and bounded; no vector is installed', async () => {
  assert.equal((await query("SELECT count(*)::int AS n FROM pg_extension WHERE extname='vector'")).rows[0].n,0);
  const insert=`INSERT INTO embedding_metadata(id,question_version_id,chunk_id,purpose,model_id,model_revision,dimension,normalization,embedding_version,content_hash,corpus_generation)
    VALUES($1,$2,$3,'technical-grounding','fixture-model','fixture-revision',$4,'l2','fixture-v1',$5,'fixture')`;
  await rejected(insert,[randomUUID(),fixture.version,fixture.chunk,384,hash]);
  await rejected(insert,[randomUUID(),null,fixture.chunk,0,hash]);
  await query(insert,[randomUUID(),null,fixture.chunk,384,hash]);
  await rejected(insert,[randomUUID(),null,fixture.chunk,384,hash],'23505');
});
test('operation/outbox atomicity, idempotency and reward deduplication primitives only', async () => {
  const input={sessionId:fixture.session._id,type:'evaluate',idempotencyKey:'fixture-operation',payloadHash:hash,sessionRevision:1,eventType:'fixture',eventPayload:{operation:'fixture'}};
  await assert.rejects(()=>repo.recordOperation(other,input),/Owned session/);
  const operation=await repo.recordOperation(owner,input);
  await assert.rejects(()=>repo.recordOperation(owner,input),e=>e.code==='23505');
  await rejected("UPDATE durable_operations SET status='running' WHERE id=$1",[operation]);
  await assert.rejects(()=>repo.recordOperation(owner,{...input,idempotencyKey:'rollback',eventPayload:{data:'x'.repeat(65537)}}),e=>e.code==='23514');
  assert.equal((await query("SELECT count(*)::int AS n FROM durable_operations WHERE idempotency_key='rollback'")).rows[0].n,0);
  const sql='INSERT INTO reward_ledger(id,session_id,user_id,reward_key,amount) VALUES($1,$2,$3,$4,$5)';
  await query(sql,[randomUUID(),fixture.session._id,owner,'fixture-only',10]);
  await rejected(sql,[randomUUID(),fixture.session._id,owner,'fixture-only',10],'23505');
});
test('withdrawal, rubric retirement and competency deprecation preserve historical references', async () => {
  await query("UPDATE competencies SET status='deprecated' WHERE taxonomy_version='junior-se-v1' AND id='dbms-sql.queries'");
  await repo.withdrawDocumentVersion(fixture.documentVersion,'Fixture withdrawal');
  const source=(await query('SELECT * FROM source_document_versions WHERE id=$1',[fixture.documentVersion])).rows[0];
  assert.equal(source.status,'withdrawn'); assert.equal(source.normalized_text,null); assert.ok(source.redacted_at);
  assert.equal((await query('SELECT excerpt FROM source_chunks WHERE id=$1',[fixture.chunk])).rows[0].excerpt,null);
  await rejected("UPDATE source_document_versions SET status='published' WHERE id=$1",[fixture.documentVersion]);
  await query("UPDATE rubric_versions SET status='retired' WHERE id=$1",[fixture.rubricVersion]);
  assert.equal((await repo.findQuestionVersion(fixture.version)).primary_competency,'dbms-sql.queries');
  assert.equal((await repo.findEvaluationForUser(fixture.evaluation,owner)).technical_score,'80.00');
});
test('owned-session deletion cascades private records while preserving shared knowledge', async () => {
  await sessions.delete(fixture.session);
  for (const table of ['interview_plans','plan_items','retrieval_evidence','answer_attempts','durable_operations','transactional_outbox','reward_ledger']) {
    assert.equal((await query(`SELECT count(*)::int AS n FROM ${table} WHERE session_id=$1`,[fixture.session._id])).rows[0].n,0);
  }
  assert.equal(await repo.findEvaluationForUser(fixture.evaluation,owner),null);
  assert.ok(await repo.findQuestionVersion(fixture.version));
  assert.equal((await query('SELECT count(*)::int AS n FROM sources')).rows[0].n,2);
});
