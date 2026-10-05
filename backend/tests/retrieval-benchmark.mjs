/** Real selected FastAPI → Express service → pgvector benchmark; localhost only. */
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {performance} from 'node:perf_hooks';
import {fixture} from './retrieval-fixture.mjs';

const f=await fixture(),directory=await mkdtemp(join(tmpdir(),'techvera-retrieval-benchmark-'));
const metrics=values=>{const sorted=[...values].sort((a,b)=>a-b);return {samples:sorted.length,medianMs:sorted[Math.floor(sorted.length/2)],p95Ms:sorted[Math.ceil(sorted.length*0.95)-1]};};
process.env.AI_SERVICE_URL='http://127.0.0.1:18005';process.env.INTERNAL_API_KEY='phase5-local-fixture-only';
try {
  const {EmbeddingClient}=await import('../dist/retrieval/embeddingClient.js');
  const {RetrievalService}=await import('../dist/retrieval/service.js');
  const {MODEL}=await import('../dist/retrieval/contracts.js');
  const coldStart=performance.now(),cold=await new EmbeddingClient().embed(['public junior query'],'query');
  const firstHttpMs=performance.now()-coldStart;
  const cli=fileURLToPath(new URL('../dist/retrieval/cli.js',import.meta.url)),execute=promisify(execFile);
  const env={DATABASE_URL:process.env.DATABASE_URL,DATABASE_SSL:'false',NODE_ENV:'test',
    AI_SERVICE_URL:process.env.AI_SERVICE_URL,INTERNAL_API_KEY:process.env.INTERNAL_API_KEY};
  const invoke=async args=>JSON.parse((await execute(process.execPath,[cli,...args],{cwd:directory,env})).stdout.trim().split('\n').at(-1));
  const embedded=await invoke(['embed']);assert.equal(embedded.eligible,48);assert.equal(embedded.embedded,48);assert.equal(embedded.failed,0);
  const skipped=await invoke(['embed']);assert.equal(skipped.skipped,48);assert.equal(skipped.embedded,0);
  const counts=(await f.query("SELECT purpose,dimension,status,count(*)::int AS count FROM embedding_metadata GROUP BY purpose,dimension,status")).rows;
  assert.deepEqual(counts,[{purpose:'question-selection',dimension:384,status:'active',count:48}]);
  const labels=JSON.parse(await readFile(new URL('../data/retrieval/development-queries.json',import.meta.url))).queries;
  const service=new RetrievalService(),timings=[],unfiltered=[],filtered=[];
  for(const label of labels) {
    const result=await service.retrieveQuestions({query:label.query});
    const rank=result.hits.findIndex(h=>h.provenance.some(p=>label.expectedKeys.includes(p.externalKey)))+1;
    unfiltered.push({id:label.id,expectedRank:rank || null,outcome:result.outcome});
    for(let repetition=0;repetition<3;repetition++) {
      const result=await service.retrieveQuestions({query:label.query,filters:{competencies:[label.root],role:'Backend Developer'}});
      assert.ok(result.hits.every(h=>h.competency.startsWith(label.root+'.')));
      assert.equal(new Set(result.hits.map(h=>h.familyKey)).size,result.hits.length);
      timings.push(result.timings);
      if(repetition===0)filtered.push({id:label.id,expectedPresent:result.hits.some(h=>h.provenance.some(p=>label.expectedKeys.includes(p.externalKey)))});
    }
    const constrained=await service.retrieveQuestions({query:label.query,filters:{competencies:[label.competency],categories:[label.category],difficulties:[label.difficulty]}});
    assert.ok(constrained.hits.every(h=>h.competency===label.competency && h.category===label.category && h.difficulty===label.difficulty));
  }
  assert.equal(filtered.filter(r=>r.expectedPresent).length,32);
  const noEvidence=await service.retrieveTechnicalEvidence({query:'reviewed technical explanation'});
  assert.equal(noEvidence.outcome,'no_match');assert.equal(noEvidence.hits.length,0);
  assert.equal((await service.retrieveQuestions({query:'x',expectedModelRevision:'wrong'})).outcome,'model_mismatch');
  assert.equal((await service.retrieveQuestions({query:'x',expectedCorpusGeneration:'corpus-'+'0'.repeat(64)})).outcome,'corpus_unavailable');
  const company=await service.retrieveQuestions({query:'SQL',filters:{company:'Unknown company'}});assert.equal(company.hits.length,0);
  const dated=await service.retrieveQuestions({query:'SQL',filters:{occurredAfter:'2026-01-01'}});assert.equal(dated.hits.length,0);
  const exact=(await f.query('SELECT * FROM retrieval_entities ORDER BY entity_id LIMIT 1')).rows[0];
  const exactHit=await service.retrieveQuestions({query:exact.text});assert.equal(exactHit.reason,'exact_match');
  assert.equal(exactHit.hits[0].questionVersionId,exact.entity_id);
  const history=(await f.query('SELECT * FROM retrieval_results WHERE retrieval_id=$1',[exactHit.operationId])).rows;
  assert.ok(history.some(r=>r.selected && r.provenance_snapshot.length>0));
  const record=(await f.query('SELECT id FROM ingestion_records WHERE document_version_id=$1',[exact.provenance[0].documentVersionId])).rows[0];
  await f.r.withdrawDocument(record.id,'muhammad-yasir','benchmark-withdrawal');
  const after=await service.retrieveQuestions({query:exact.text});assert.ok(after.hits.every(h=>h.questionVersionId!==exact.entity_id));
  assert.equal((await f.query('SELECT status FROM embedding_metadata WHERE question_version_id=$1',[exact.entity_id])).rows[0].status,'retired');
  assert.equal((await f.query('SELECT count(*)::int AS n FROM retrieval_results WHERE retrieval_id=$1',[exactHit.operationId])).rows[0].n,history.length);
  const evidence=(await f.query('SELECT count(*)::int AS n FROM retrieval_evidence WHERE redacted_query IS NOT NULL')).rows[0].n;assert.equal(evidence,0);
  const result={kind:'Real-model development benchmark; not Phase 11 held-out evaluation',model:MODEL,
    embedding:embedded,repeatedEmbedding:skipped,activeCountsBeforeWithdrawal:counts,queryCount:labels.length,
    hitRateAt1:unfiltered.filter(r=>r.expectedRank===1).length/labels.length,
    hitRateAt5:unfiltered.filter(r=>r.expectedRank!==null).length/labels.length,
    rootFilteredHitRateAt5:filtered.filter(r=>r.expectedPresent).length/labels.length,
    filterChecks:{rootRequests:96,fullyConstrainedRequests:32,violations:0},
    warm:{embedding:metrics(timings.map(t=>t.embeddingMs)),postgres:metrics(timings.map(t=>t.databaseMs)),total:metrics(timings.map(t=>t.totalMs))},
    firstEmbeddingHttpMs:firstHttpMs,firstServiceProcessingMs:cold.processingMs,
    checks:{filters:true,familyUniqueness:true,technicalNoEvidence:true,modelMismatch:true,corpusMismatch:true,companyAndUnknownDateNoMatch:true,
      exactMatch:true,withdrawalExcluded:true,withdrawalRetiredEmbedding:true,provenancePersisted:true,queryTextNotPersisted:true},
    unfiltered,filtered};
  await writeFile('/tmp/techvera-phase5-retrieval-benchmark.json',JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify(result,null,2));
}finally{await f.cleanup();await rm(directory,{recursive:true,force:true});}
