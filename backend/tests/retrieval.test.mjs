import assert from 'node:assert/strict';
import {before,after,test} from 'node:test';
import {randomUUID} from 'node:crypto';
import {fixture} from './retrieval-fixture.mjs';
let f,api,corpus,service,initial;
const vector=()=>[1,...Array(383).fill(0)];
const fake={embed:async texts=>({...api.MODEL,processingMs:0,vectors:texts.map(vector)})};
before(async()=>{
  f=await fixture();api=await import('../dist/retrieval/contracts.js');corpus=await import('../dist/retrieval/corpus.js');
  const {RetrievalService}=await import('../dist/retrieval/service.js');service=new RetrievalService(fake);
  // A synthetic previous 384d provider, only in this deterministic fixture database.
  const old='corpus-'+'f'.repeat(64),es=await corpus.eligibleEntities();
  await f.query("INSERT INTO embedding_generations(id,model_id,model_revision,dimension,normalization,embedding_version,entity_count,status) VALUES($1,'fixture-old-model','fixture-old-revision',384,'l2','fixture-old-v1',48,'active')",[old]);
  for(const e of es) {
    const id=randomUUID();await f.query("INSERT INTO embedding_metadata(id,question_version_id,purpose,model_id,model_revision,dimension,normalization,embedding_version,content_hash,corpus_generation,status) VALUES($1,$2,'question-selection','fixture-old-model','fixture-old-revision',384,'l2','fixture-old-v1',$3,$4,'active')",[id,e.entity_id,e.content_hash,old]);
    await f.query('INSERT INTO embedding_vectors(metadata_id,duplicate_group,value) VALUES($1,$2,$3::vector)',[id,e.entity_id,JSON.stringify(vector())]);
  }
  let batches=0;
  await assert.rejects(()=>corpus.embedCorpus({embed:async texts=>{if(++batches===2)throw new api.RetrievalFailure('model_unavailable');return fake.embed(texts);}}),/model_unavailable/);
  assert.equal((await f.query("SELECT count(*)::int AS n FROM embedding_metadata WHERE status='staged'")).rows[0].n,16);
  assert.equal((await f.query("SELECT id FROM embedding_generations WHERE status='active'")).rows[0].id,old);
  assert.equal((await service.retrieveQuestions({query:'x'})).outcome,'model_mismatch');
  initial=await corpus.embedCorpus(fake);
  assert.equal((await f.query("SELECT count(*)::int AS n FROM embedding_metadata WHERE status='retired' AND model_id='fixture-old-model'")).rows[0].n,48);
});
after(async()=>{if(f)await f.cleanup();});
test('pgvector installed, approved question-only eligibility, counts and active generation',async()=>{
  assert.equal((await f.query("SELECT extversion FROM pg_extension WHERE extname='vector'")).rows[0].extversion,'0.8.2');
  assert.equal(initial.eligible,48);assert.equal(initial.embedded,32);assert.equal(initial.skipped,16);assert.equal(initial.failed,0);
  assert.equal((await f.query("SELECT count(*)::int AS n FROM embedding_metadata WHERE status='active' AND dimension=384")).rows[0].n,48);
  assert.equal((await f.query("SELECT count(*)::int AS n FROM retrieval_entities WHERE purpose='technical-grounding'")).rows[0].n,0);
});
test('strict embedding vectors reject NaN, infinity, dimension, normalization, batch and revision mismatch',()=>{
  const b={...api.MODEL,processingMs:0,vectors:[vector()]};assert.equal(api.validateBatch(b,1),b);
  for(const vectors of [[Array(383).fill(0)],[[NaN,...Array(383).fill(0)]],[[Infinity,...Array(383).fill(0)]],[Array(384).fill(0)],[]])
    assert.throws(()=>api.validateBatch({...b,vectors},1),/invalid_model_output/);
  assert.throws(()=>api.validateBatch({...b,modelRevision:'wrong'},1),/model_mismatch/);
});
test('dimension, finite/vector norm, forged entity and generation consistency enforced by PostgreSQL',async()=>{
  const row=(await f.query('SELECT id FROM embedding_metadata LIMIT 1')).rows[0];
  for(const value of ['[1,2]',JSON.stringify(Array(384).fill(0)),'[NaN,'+Array(383).fill(0).join(',')+']'])
    await assert.rejects(()=>f.query('UPDATE embedding_vectors SET value=$1::vector WHERE metadata_id=$2',[value,row.id]));
  await assert.rejects(()=>f.query("UPDATE embedding_metadata SET model_revision='forged' WHERE id=$1",[row.id]),e=>e.code==='23514');
  await assert.rejects(()=>f.query('UPDATE embedding_metadata SET question_version_id=$1 WHERE id=$2',[randomUUID(),row.id]),e=>e.code==='23514');
});
test('unchanged compatible embeddings skip; model/content/version affect the generation fingerprint',async()=>{
  const rerun=await corpus.embedCorpus({embed:()=>{throw new Error('must skip');}});
  assert.equal(rerun.embedded,0);assert.equal(rerun.skipped,48);assert.equal(rerun.corpusGeneration,initial.corpusGeneration);
  const e=await corpus.eligibleEntities();
  assert.notEqual(corpus.generationFingerprint(e,{...api.MODEL,modelRevision:'new'}),initial.corpusGeneration);
  assert.notEqual(corpus.generationFingerprint([{...e[0],content_hash:'0'.repeat(64)},...e.slice(1)]),initial.corpusGeneration);
  assert.notEqual(corpus.generationFingerprint([{...e[0],entity_id:randomUUID()},...e.slice(1)]),initial.corpusGeneration);
  const dry=await corpus.embedCorpus(fake,true);assert.equal(dry.wouldEmbed,0);
});
test('a corpus with retired vectors gets a fresh generation and can be rebuilt',async()=>{
  await assert.rejects(()=>f.withDatabaseLock('test:retired-generation-recovery',async()=>{
    await f.query("UPDATE embedding_metadata SET status='retired' WHERE corpus_generation=$1 AND status='active' AND purpose='question-selection'",[initial.corpusGeneration]);
    const recovered=await corpus.embedCorpus(fake);
    assert.equal(recovered.eligible,48);assert.equal(recovered.embedded,48);assert.equal(recovered.skipped,0);
    assert.notEqual(recovered.corpusGeneration,initial.corpusGeneration);
    assert.equal((await f.query("SELECT count(*)::int AS n FROM embedding_metadata WHERE corpus_generation=$1 AND status='active'",[recovered.corpusGeneration])).rows[0].n,48);
    throw new Error('rollback generation recovery simulation');
  }),/rollback generation recovery simulation/);
  assert.equal((await f.query("SELECT id FROM embedding_generations WHERE status='active'")).rows[0].id,initial.corpusGeneration);
  assert.equal((await f.query("SELECT count(*)::int AS n FROM embedding_metadata WHERE corpus_generation=$1 AND status='active'",[initial.corpusGeneration])).rows[0].n,48);
});
test('FastAPI client rejects batches and malformed/provider payloads without echoing them',async()=>{
  const {EmbeddingClient}=await import('../dist/retrieval/embeddingClient.js');const client=new EmbeddingClient();
  await assert.rejects(()=>client.embed(Array(17).fill('x'),'documents'),/invalid_input/);
  await assert.rejects(()=>client.embed(['x','y'],'query'),/invalid_input/);
  const prior=globalThis.fetch,oldKey=process.env.INTERNAL_API_KEY;process.env.INTERNAL_API_KEY='fixture-only';
  try {
    globalThis.fetch=async()=>new Response(JSON.stringify({...api.MODEL,processingMs:0,vectors:[[null,...Array(383).fill(0)]]}));
    await assert.rejects(()=>client.embed(['x'],'query'),/invalid_model_output/);
    globalThis.fetch=async()=>new Response('sensitive provider fixture payload',{status:503});
    await assert.rejects(()=>client.embed(['x'],'query'),e=>e.message==='model_unavailable');
    globalThis.fetch=async()=>new Response('x'.repeat(262145));
    await assert.rejects(()=>client.embed(['x'],'query'),/invalid_model_output/);
  }finally{globalThis.fetch=prior;if(oldKey===undefined)delete process.env.INTERNAL_API_KEY;else process.env.INTERNAL_API_KEY=oldKey;}
});
test('exact/semantic reasons, all filters before ranking, citations and evidence persist without raw queries',async()=>{
  const e=(await corpus.eligibleEntities()).find(e=>e.primary_competency==='dsa.structures' && e.difficulty==='easy');
  const result=await service.retrieveQuestions({query:e.text,filters:{competencies:['dsa'],role:'Backend Developer',difficulties:['easy'],categories:['conceptual-oral'],origins:['retrieved'],qualities:['unverified']}});
  assert.equal(result.reason,'exact_match');assert.equal(result.hits[0].questionVersionId,e.entity_id);
  assert.ok(result.hits.every(h=>h.competency.startsWith('dsa.') && h.difficulty==='easy'));
  const hit=result.hits[0];assert.ok(hit.provenance.every(p=>p.sourceId===f.sourceId && p.documentVersionId && p.chunkId));
  const persisted=(await f.query('SELECT * FROM retrieval_evidence WHERE id=$1',[result.operationId])).rows[0];
  assert.equal(persisted.redacted_query,null);assert.equal(persisted.outcome,'success');assert.equal(persisted.cache_hit,false);
  assert.equal((await f.query('SELECT provenance_snapshot FROM retrieval_results WHERE retrieval_id=$1 AND selected',[result.operationId])).rows[0].provenance_snapshot[0].sourceId,f.sourceId);
  assert.equal((await service.retrieveQuestions({query:'different words'})).reason,'semantic_match');
  const {knowledgeRepository}=await import('../dist/repositories/knowledgeRepository.js');
  await assert.rejects(()=>knowledgeRepository.recordRetrieval(null,{operationKey:randomUUID(),queryHash:'0'.repeat(64),corpusVersion:initial.corpusGeneration,
    sourcePolicyRevision:'source-policy-v1',outcome:'success',results:[{questionVersionId:hit.questionVersionId,rank:1,selected:true,reason:'forged',
      provenanceSnapshot:[{...hit.provenance[0],sourceId:randomUUID()}]}]}),e=>e.code==='23514');
});
test('company/known occurrence constraints never relax; absent technical references return no evidence',async()=>{
  for(const filters of [{company:'Unknown company'},{occurredAfter:'2026-01-01'},{qualities:['technical-reference']}]) {
    const r=await service.retrieveQuestions({query:'counter',filters});assert.equal(r.outcome,'no_match');assert.equal(r.hits.length,0);
  }
  const r=await service.retrieveTechnicalEvidence({query:'authoritative correct answer'});assert.equal(r.outcome,'no_match');assert.equal(r.reason,'no_permitted_source');
});
test('structured fallback identifies the exact approved input hash, never just a source label',async()=>{
 const result=await service.retrieveQuestions({query:'seed fallback',strategy:'structured-seed',filters:{reviewedSeed:true,competencies:['dsa'],role:'Software Engineer'}});
 assert.equal(result.outcome,'success');assert.ok(result.hits.length>0);assert.ok(result.hits.every(h=>h.similarity===null));
 const labelOnly=await service.retrieveQuestions({query:'seed fallback',strategy:'structured-seed',filters:{sourceKeys:['techvera-junior-se-seed-v1']}});
 assert.equal(labelOnly.outcome,'invalid_filters');assert.equal(labelOnly.hits.length,0);
 await assert.rejects(()=>f.withDatabaseLock('ingestion:editorial:v1',async()=>{
  // Disposable rollback: unchanged source label and eligibility cannot authorize another input hash.
  await f.query("UPDATE ingestion_records SET input_hash=$2 WHERE source_id=$1",[f.sourceId,'0'.repeat(64)]);
  const missing=await service.retrieveQuestions({query:'seed fallback',strategy:'structured-seed',filters:{reviewedSeed:true}});
  assert.equal(missing.outcome,'no_match');assert.equal(missing.hits.length,0);
  throw new Error('rollback seed identity simulation');
 }),/rollback seed identity simulation/);
});
test('structured practice never borrows starter questions or technical grounding',async()=>{
 const request={query:'generic practice',strategy:'structured-practice',filters:{approvedPractice:true}};
 const result=await service.retrieveQuestions(request);
 assert.equal(result.outcome,'no_match');assert.equal(result.hits.length,0);
 assert.equal((await service.retrieveQuestions({...request,filters:{}})).outcome,'invalid_filters');
 assert.equal((await service.retrieveTechnicalEvidence(request)).outcome,'invalid_filters');
});
test('candidate evidence is written in one bounded SQL round trip with all lineage/rank rows intact',async()=>{
 const clients=new Map();let inserts=0;
 const observe=client=>{
  if(clients.has(client))return;const original=client.query;clients.set(client,original);
  client.query=function(...args){if(typeof args[0]==='string' && /INSERT INTO retrieval_results/.test(args[0]))inserts++;return original.apply(this,args);};
 };
 f.pool.on('acquire',observe);
 let result;
 try {result=await service.retrieveQuestions({query:'different words',filters:{competencies:['dsa']}});}
 finally {f.pool.off('acquire',observe);for(const [client,original] of clients)client.query=original;}
 const rows=(await f.query('SELECT rank,provenance_snapshot FROM retrieval_results WHERE retrieval_id=$1 ORDER BY rank',[result.operationId])).rows;
 assert.ok(rows.length>1);assert.equal(inserts,1);assert.deepEqual(rows.map(r=>r.rank),rows.map((_,i)=>i+1));
 assert.ok(rows.every(r=>r.provenance_snapshot.length>0));
});
test('date/company SQL on synthetic values uses only a known permitted occurrence and the same reported role',async()=>{
  // Pure SQL filter fixtures: not corpus rows, citations, human approvals or relevance measurements.
  const {filterSql}=await import('../dist/retrieval/service.js');
  const built=filterSql({taxonomyVersion:'junior-se-v1',role:'Backend Developer',company:'Synthetic Fixture Company',
    occurredAfter:'2020-01-01',occurredBefore:'2020-12-31',qualities:['reported-experience']},'question-selection');
  const p={company:'Synthetic Fixture Company',occurredOn:'2020-06-01',experienceRole:'Backend Developer',quality:'reported-experience',sourceType:'voluntary-experience'};
  const cases=[['known',p],['unknown',{...p,occurredOn:null}],['fetch-only',{...p,occurredOn:null,fetchedAt:'2020-06-01'}],
    ['old',{...p,occurredOn:'2019-12-31'}],['future',{...p,occurredOn:'2099-01-01'}],['other-company',{...p,company:'Other'}],['other-role',{...p,experienceRole:'Full Stack Developer'}]];
  const rows=cases.map(([id,provenance])=>({id,purpose:'question-selection',taxonomy_version:'junior-se-v1',roles:['Backend Developer'],provenance:[provenance]}));
  built.params.push(JSON.stringify(rows));
  const matched=(await f.query(`SELECT id FROM jsonb_to_recordset($${built.params.length}::jsonb)
    AS e(id text,purpose text,taxonomy_version text,roles jsonb,provenance jsonb) WHERE ${built.sql}`,built.params)).rows;
  assert.deepEqual(matched,[{id:'known'}]);
});
test('invalid taxonomy/role/date/unknown filter/limit recorded as invalid_filters',async()=>{
  for(const filters of [{taxonomyVersion:'unknown'},{competencies:['fake']},{role:'CEO'},{occurredAfter:'2026-02-30'},{companyLabel:'x'},{sourceStates:['disabled']}])
    assert.equal((await service.retrieveQuestions({query:'query',filters})).outcome,'invalid_filters');
  assert.equal((await service.retrieveQuestions({query:'x',limit:6})).outcome,'invalid_filters');
});
test('already-selected version excludes its entire family; threshold has no fallback',async()=>{
  const first=(await service.retrieveQuestions({query:'x'})).hits[0];
  const excluded=await service.retrieveQuestions({query:first.text,filters:{alreadySelectedIds:[first.questionVersionId]}});
  assert.ok(excluded.hits.every(h=>h.familyKey!==first.familyKey));
  assert.equal((await service.retrieveQuestions({query:'unrelated',minimumSimilarity:1})).outcome,'success'); // fixture similarities are exactly 1
  const unequal={embed:async texts=>({...api.MODEL,processingMs:0,vectors:texts.map(()=>[0,1,...Array(382).fill(0)])})};
  const {RetrievalService}=await import('../dist/retrieval/service.js');
  const low=await new RetrievalService(unequal).retrieveQuestions({query:'unrelated',minimumSimilarity:0.99});
  assert.equal(low.reason,'no_relevant_hit');assert.equal(low.hits.length,0);
});
test('duplicate/family representatives collapse before useful-hit limit, preserving rejected provenance',async()=>{
  const es=await corpus.eligibleEntities(),a=es[0],b=es[1];
  await f.query('UPDATE embedding_vectors SET duplicate_group=$1 WHERE metadata_id IN (SELECT id FROM embedding_metadata WHERE question_version_id=ANY($2::uuid[]))',['synthetic-duplicate-group',[a.entity_id,b.entity_id]]);
  const r=await service.retrieveQuestions({query:'x'});
  assert.ok(r.hits.filter(h=>[a.entity_id,b.entity_id].includes(h.questionVersionId)).length<=1);
  const evidence=(await f.query("SELECT reason,provenance_snapshot FROM retrieval_results WHERE retrieval_id=$1 AND reason='duplicate_collapsed'",[r.operationId])).rows;
  assert.ok(evidence.length>=1);assert.ok(evidence.every(e=>e.provenance_snapshot.length>0));
  const excluded=await service.retrieveQuestions({query:'x',filters:{alreadySelectedIds:[a.entity_id]}});
  assert.ok(excluded.hits.every(h=>![a.entity_id,b.entity_id].includes(h.questionVersionId)));
});
test('pipeline groups actual families, exact hashes, near candidate links and retained-document provenance',async()=>{
  const [a,b]=await corpus.eligibleEntities();
  const pairs=[
    {...b,content_hash:a.content_hash},
    {...b,family_key:a.family_key},
    {...b,duplicate_links:[{candidateId:a.candidate_id,kind:'near'}]},
    {...b,text:a.text+' Explain carefully.',provenance:[{...b.provenance[0],duplicateDecision:'retain-provenance',documentDuplicates:[{documentVersionId:a.provenance[0].documentVersionId,kind:'near'}]}]}
  ];
  for(const second of pairs){const groups=corpus.duplicateGroups([a,second]);assert.equal(groups.get(a.entity_id),groups.get(second.entity_id));}
});
test('model unavailable/mismatch and corpus mismatch persist typed outcomes',async()=>{
  const {RetrievalService}=await import('../dist/retrieval/service.js');
  assert.equal((await new RetrievalService({embed:async()=>{throw new api.RetrievalFailure('model_unavailable');}}).retrieveQuestions({query:'x'})).outcome,'unavailable');
  assert.equal((await service.retrieveQuestions({query:'x',expectedModelRevision:'wrong'})).outcome,'model_mismatch');
  assert.equal((await service.retrieveQuestions({query:'x',expectedCorpusGeneration:'corpus-'+'0'.repeat(64)})).outcome,'corpus_unavailable');
});
test('availability of the embedding generation is rechecked after query computation',async()=>{
  const e=(await corpus.eligibleEntities())[0];
  const {RetrievalService}=await import('../dist/retrieval/service.js');
  const changing={embed:async texts=>{
    await f.query("UPDATE embedding_metadata SET status='staged' WHERE question_version_id=$1 AND corpus_generation=$2",[e.entity_id,initial.corpusGeneration]);
    return fake.embed(texts);
  }};
  try {
    const response=await new RetrievalService(changing).retrieveQuestions({query:'x'});
    assert.equal(response.outcome,'corpus_unavailable');assert.equal(response.hits.length,0);
  }finally {
    await f.query("UPDATE embedding_metadata SET status='active' WHERE question_version_id=$1 AND corpus_generation=$2",[e.entity_id,initial.corpusGeneration]);
  }
});
test('document/chunk/source permission/reviewer/fixture changes exclude rows and retire vectors in the same transaction',async()=>{
  const e=(await corpus.eligibleEntities())[0],p=e.provenance[0];
  // Synthetic disabled source: moving a document cannot carry its old approval forward.
  const otherSource=randomUUID();
  await f.query("INSERT INTO sources(id,stable_key,source_type,title,policy_revision) VALUES($1,$2,'authored','Synthetic disabled source','fixture')",[otherSource,'fixture-'+otherSource]);
  const variants=[
    ["UPDATE source_documents SET source_id=$1 WHERE id=$2",[otherSource,p.documentId]],
    ["UPDATE source_chunks SET status='retired',excerpt=NULL,redacted_at=now() WHERE id=$1",[p.chunkId]],
    ["UPDATE sources SET state='suspended',permission_status='expired' WHERE id=$1",[f.sourceId]],
    ["UPDATE sources SET state='suspended',review_status='rejected' WHERE id=$1",[f.sourceId]],
    ["UPDATE ingestion_reviewers SET enabled=false WHERE id='muhammad-yasir'",[]],
    ["UPDATE ingestion_adapters SET contract=jsonb_set(contract,'{fixture}','true') WHERE source_id=$1",[f.sourceId]],
    ["UPDATE competencies SET status='deprecated' WHERE taxonomy_version='junior-se-v1' AND id=$1",[e.primary_competency]]
  ];
  for(const [sql,params] of variants) {
    await assert.rejects(()=>f.withDatabaseLock('ingestion:editorial:v1',async()=>{
      await f.query(sql,params);
      assert.equal((await f.query('SELECT count(*)::int AS n FROM retrieval_entities WHERE entity_id=$1',[e.entity_id])).rows[0].n,0);
      assert.equal((await f.query('SELECT status FROM embedding_metadata WHERE question_version_id=$1 AND corpus_generation=$2',[e.entity_id,initial.corpusGeneration])).rows[0].status,'retired');
      throw new Error('rollback synthetic availability check');
    }),/rollback synthetic availability check/);
    assert.equal((await f.query('SELECT status FROM embedding_metadata WHERE question_version_id=$1 AND corpus_generation=$2',[e.entity_id,initial.corpusGeneration])).rows[0].status,'active');
  }
});
test('withdrawal immediately retires embeddings and excludes new hits, preserving historical evidence',async()=>{
  const before=await service.retrieveQuestions({query:'x'}),hit=before.hits[0];
  const c=(await f.query('SELECT id FROM ingestion_candidates WHERE question_version_id=$1',[hit.questionVersionId])).rows[0];
  await f.r.withdrawQuestion(c.id,'muhammad-yasir','test-withdrawal');
  assert.equal((await f.query('SELECT status FROM embedding_metadata WHERE question_version_id=$1',[hit.questionVersionId])).rows[0].status,'retired');
  const now=await service.retrieveQuestions({query:hit.text});assert.ok(now.hits.every(h=>h.questionVersionId!==hit.questionVersionId));
  assert.ok((await f.query('SELECT id FROM retrieval_results WHERE retrieval_id=$1',[before.operationId])).rows.length>0);
  const next=await corpus.embedCorpus({embed:()=>{throw new Error('unchanged survivors must reuse');}});
  assert.equal(next.eligible,47);assert.equal(next.skipped,47);assert.equal(next.embedded,0);
  assert.notEqual(next.corpusGeneration,initial.corpusGeneration);
  await f.r.withdrawSource(f.sourceId,'muhammad-yasir','test-withdrawal');
  assert.equal((await f.query("SELECT count(*)::int AS n FROM embedding_metadata WHERE status='active'")).rows[0].n,0);
  assert.equal((await service.retrieveQuestions({query:'x'})).hits.length,0);
});
