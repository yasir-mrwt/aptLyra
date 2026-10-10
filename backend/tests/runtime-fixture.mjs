/** FICTIONAL provider/reference/rubric approvals; only disposable localhost PostgreSQL/Redis. */
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {randomUUID,createHash} from 'node:crypto';
import {mkdtemp,writeFile,readFile,realpath,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fixture} from './retrieval-fixture.mjs';
export async function runtimeFixture() {
  const state={calls:0,legacyCalls:0,speechCalls:0,probeCalls:0,mode:'normal',gate:null,probeGate:null,dynamicVersionIds:[]};
  const provider=createServer(async(req,res)=>{
    const chunks=[];for await(const c of req)chunks.push(c);const raw=Buffer.concat(chunks);
    res.setHeader('Content-Type','application/json');
    if(req.url==='/internal/embeddings'){
      const {MODEL}=await import('../dist/retrieval/contracts.js'),input=JSON.parse(raw);
      res.end(JSON.stringify({...MODEL,processingMs:0,vectors:input.texts.map(()=>[1,...Array(383).fill(0)])}));return;
    }
    if(req.url==='/speech/analyze'){
      state.speechCalls++;
      if(state.mode==='no-speech'){res.statusCode=422;res.end(JSON.stringify({detail:{code:'invalid_provider_audio'}}));return;}
      res.end(JSON.stringify({transcript:'FIFO explains the ordered removal mechanism.',metrics_status:'unavailable',metrics:null}));return;
    }
    if(req.url==='/generate-followup'){
      state.probeCalls++;if(state.probeGate)await state.probeGate;
      res.end(JSON.stringify({question:'Explain this missing mechanism using a concrete example.',ideal_answer:'FICTIONAL fixture, never public',question_type:'oral'}));return;
    }
    if(req.url==='/evaluate'){
      state.legacyCalls++;
      res.end(JSON.stringify({technical_score:84,confidence_score:76,ideal_answer:'FICTIONAL baseline evaluator answer',ai_feedback:'FICTIONAL baseline feedback for the trusted starter path.'}));return;
    }
    if(req.url==='/internal/rubrics/evaluate'){
      state.calls++;const mode=state.mode;if(state.gate)await state.gate;
      if(['transient','permanent'].includes(mode)){
        res.statusCode=mode==='transient'?503:401;res.end(JSON.stringify({detail:{code:mode==='transient'?'provider_unavailable':'provider_authentication'}}));return;
      }
      const input=JSON.parse(raw),missing=mode==='missing';
      res.end(JSON.stringify({dimensions:{correctness:4,'concept-coverage':4,reasoning:3,'practical-application':2,'trade-off-awareness':1},
        concepts:input.rubric.concepts.map(c=>({id:c.id,judgment:missing?'missing':'satisfied',explanation:missing?'Specific concept is missing.':'Submitted text explains the mechanism.',sourceIds:[c.sources[0]],span:missing?null:{artifact:input.code?'code':'answer',start:0,end:4}})),
        confidence:'high',abstained:false,reason:'',feedback:'FICTIONAL fixture feedback',communication:'Descriptive communication only',modelVersion:'fictional-provider',promptVersion:'rubric-evaluator-v1'}));return;
    }
    res.statusCode=404;res.end('{}');
  });
  await new Promise((resolve,reject)=>{provider.once('error',reject);provider.listen(0,'127.0.0.1',resolve);});
  process.env.AI_SERVICE_URL=`http://127.0.0.1:${provider.address().port}`;
  process.env.INTERNAL_API_KEY='fictional-runtime-provider-boundary';
  const f=await fixture();process.env.REDIS_URL='redis://127.0.0.1:16379/14';
  const directory=await realpath(await mkdtemp(join(tmpdir(),'aptlyra-runtime-')));
  process.env.INTERVIEW_MEDIA_DIR=join(directory,'media');
  const {sessionRepository:repo}=await import('../dist/models/Session.js');
  const {sessionService:service}=await import('../dist/services/sessionService.js');
  const {knowledgeRepository:knowledge}=await import('../dist/repositories/knowledgeRepository.js');
  const {rubricEditor:editor}=await import('../dist/evaluation/rubrics.js');
  const {default:redis}=await import('../dist/config/redisConfig.js');await redis.ping();await redis.flushdb();
  const owner=randomUUID(),other=randomUUID(),actor='fictional-runtime-reviewer';
  for(const id of [owner,other])await f.query('INSERT INTO users(id,name,email) VALUES($1,$2,$3)',[id,'FICTIONAL runtime fixture',id+'@example.invalid']);
  await f.r.registerReviewer(actor,'FICTIONAL HUMAN IN DISPOSABLE TEST DATABASE ONLY','human');
  await f.query('UPDATE ingestion_reviewers SET user_id=$2 WHERE id=$1',[actor,owner]);
  await f.query("UPDATE users SET app_role='reviewer' WHERE id=$1",[owner]);
  const path=join(directory,'reference.json'),bytes=Buffer.from(JSON.stringify({schemaVersion:'local-v1',documents:[{key:'fictional-runtime-reference',title:'FICTIONAL reference',text:'A queue removes values in first-in first-out order. A causal explanation gives a concrete ordered removal example.',questions:[],experience:null}]}));
  await writeFile(path,bytes);
  const contract=JSON.parse(await readFile(new URL('../data/ingestion/seed-source-contract.json',import.meta.url),'utf8'));
  contract.allowedInputs=[path];contract.approvedInputHashes=[createHash('sha256').update(bytes).digest('hex')];
  contract.permissionEvidence='FICTIONAL fixture assumption only. No real review or external rights asserted.';contract.licenseId='fictional-disposable-only';contract.attribution='Fictional runtime fixture';
  const source=await f.r.registerSource('fictional-runtime-reference','FICTIONAL reference',contract);await f.r.approveSource(source,actor,(await f.r.inspectSource(source)).contractHash);
  const [document]=await f.r.ingestFile(source,path);await f.r.approveTechnicalReference(document,actor,(await f.r.inspect(document)).contentHash);await f.r.publishDocument(document);
  const reference=(await f.query("SELECT entity_id FROM retrieval_entities WHERE purpose='technical-grounding'")).rows[0].entity_id;
  const {contentEditorial}=await import('../dist/contentIntelligence/editorial.js');
  const {EmbeddingClient}=await import('../dist/retrieval/embeddingClient.js');
  const topics=(await f.query(`SELECT id FROM competencies WHERE taxonomy_version='junior-se-v1' AND kind='child' AND status='active'
    AND id IN ('dsa.structures','dsa.search-sort','programming.control-data')`)).rows.map(row=>row.id);
  assert.deepEqual(new Set(topics),new Set(['dsa.structures','dsa.search-sort','programming.control-data']));
  const authored=[
    {question:'Explain how a queue preserves FIFO order with a concrete example.',topic:'dsa.structures',mode:'oral'},
    {question:'Explain why a binary-search interval must always shrink.',topic:'dsa.search-sort',mode:'oral'},
    {question:'Explain how to implement binary search for a sorted array.',topic:'dsa.search-sort',mode:'coding'},
    {question:'Explain how a loop processes a collection of values.',topic:'programming.control-data',mode:'oral'},
  ];
  const dynamicVersionIds=[];
  for(const question of authored){
    const created=await contentEditorial.createManualQuestion(owner,{...question,difficulty:'standard',authorshipAttested:true,allowAi:false});
    await contentEditorial.approveQuestion(owner,created.candidateId,created.contentHash);
    const published=await contentEditorial.publishQuestion(owner,created.candidateId,created.contentHash,new EmbeddingClient());
    assert.equal(published.embeddingReady,true);
    dynamicVersionIds.push(published.questionVersionId);
  }
  state.dynamicVersionIds=dynamicVersionIds;
  async function active({rubric='reviewed',count=3,coding=false,legacy=false}={}){
    const session=await repo.create({user:owner,role:'Backend Developer',level:'Junior',interviewType:'oral-only'});
    if(legacy){session.status='in-progress';session.questions=[{questionText:'Legacy FIFO',questionType:'oral',idealAnswer:'Legacy',isSubmitted:true,isEvaluated:true,technicalScore:70,confidenceScore:60}];return repo.save(session);}
    const versions=(await f.query(`SELECT e.*,ready.inventory_class FROM retrieval_entities e JOIN content_question_readiness ready ON ready.question_version_id=e.entity_id
      WHERE e.purpose='question-selection' AND e.entity_id=ANY($1::uuid[]) AND e.category=$3 ORDER BY e.entity_id LIMIT $2`,
    [dynamicVersionIds,count,coding?'coding':'conceptual-oral'])).rows;
    assert.equal(versions.length,count);
    const plan=await knowledge.createPlan(owner,{sessionId:session._id,contractVersion:'fictional-runtime-fixture',plannerVersion:'fixture',taxonomyVersion:'junior-se-v1',corpusVersion:'fixture',role:'Backend Developer',mode:'oral',requestedCount:count,effectiveCount:count,requestedMinutes:30,effectiveMinutes:15,selectedCompetencies:['dsa']});
    for(let i=0;i<versions.length;i++){
      const version=versions[i];let rubricId;
      if(rubric!=='none'){
        await contentEditorial.addTechnicalReference(owner,version.entity_id,reference);
        const draft=await editor.createDraft({questionVersionId:version.entity_id,concepts:[{key:'core-mechanism',label:'Core mechanism',description:'Explain the causal technical mechanism',importance:1,required:true,sourceIds:[reference]}]});
        rubricId=await editor.publish(draft.id,draft.hash,rubric==='reviewed'?actor:undefined);
      }
      const item=await knowledge.addPlanItem(owner,{planId:plan,position:i,questionVersionId:version.entity_id,rubricVersionId:rubricId,selectionReason:'FICTIONAL runtime fixture',estimatedMinutes:3});
      session.questions.push({planItemId:item,questionVersionId:version.entity_id,inventoryClass:(await f.query("SELECT inventory_class FROM content_question_readiness WHERE question_version_id=$1",[version.entity_id])).rows[0].inventory_class,primaryCompetency:version.primary_competency,
        questionText:version.text,questionType:coding?'coding':'oral',language:coding?'javascript':undefined,idealAnswer:'',isSubmitted:false,isEvaluated:false});
    }
    await f.query("UPDATE sessions SET interview_plan_id=$2,scoring_version='rubric-v1',runtime_version='aptlyra-runtime-v1',runtime_state='active' WHERE id=$1",[session._id,plan]);
    session.scoringVersion='rubric-v1';session.planId=plan;session.status='in-progress';await repo.save(session);return repo.findById(session._id);
  }
  const cleanup=async()=>{redis.disconnect();provider.closeAllConnections();await new Promise(r=>provider.close(r));await rm(directory,{recursive:true,force:true});await f.cleanup();delete process.env.REDIS_URL;delete process.env.AI_SERVICE_URL;delete process.env.INTERVIEW_MEDIA_DIR;};
  return {...f,repo,service,knowledge,editor,redis,owner,other,actor,directory,active,state,source,reference,cleanup};
}
export async function until(fn,label='durable work',milliseconds=10000){
  const end=Date.now()+milliseconds;while(Date.now()<end){const result=await fn();if(result)return result;await new Promise(r=>setTimeout(r,20));}
  throw new Error(`${label} did not reach the expected state`);
}
