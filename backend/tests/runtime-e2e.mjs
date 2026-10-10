/** Actual authenticated HTTP APIs + pgvector + Redis + independent worker processes. FICTIONAL providers/reviews. */
import assert from 'node:assert/strict';
import {fork} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {runtimeFixture,until} from './runtime-fixture.mjs';
const f=await runtimeFixture();process.env.JWT_SECRET='fictional-phase8-local-jwt';process.env.INTERNAL_API_KEY='fictional-provider-boundary';
const children=[];let api,release,manual;
const {embedCorpus}=await import('../dist/retrieval/corpus.js'),{EmbeddingClient}=await import('../dist/retrieval/embeddingClient.js');
const {InterviewRuntime}=await import('../dist/runtime/worker.js');
async function child(){
 const c=fork(fileURLToPath(new URL('./runtime-worker-child.mjs',import.meta.url)),[],{env:{...process.env},stdio:['ignore','ignore','pipe','ipc']});children.push(c);
 let error='';c.stderr.on('data',b=>{error+=b.toString();});await new Promise((resolve,reject)=>{c.once('message',resolve);c.once('exit',code=>reject(new Error(`Fixture worker exited ${code}: ${error.slice(0,300)}`)));});return c;
}
async function stop(c,signal='SIGTERM'){if(c.exitCode!==null || c.signalCode)return;c.kill(signal);await new Promise(r=>c.once('exit',r));}
try{
 await embedCorpus(new EmbeddingClient());
 // The planner selects a mixed trusted/dynamic interview from the disposable corpus.
 // Providers and the test-only rubric reviewer are fictional and never reach a public bank.
 await f.query('UPDATE ingestion_reviewers SET user_id=$2 WHERE id=$1',[f.actor,f.owner]);
 await f.query("UPDATE users SET app_role='reviewer' WHERE id=$1",[f.owner]);
 const {contentEditorial}=await import('../dist/contentIntelligence/editorial.js');
 const selected=[...(await f.query("SELECT e.entity_id FROM retrieval_entities e JOIN content_question_readiness ready ON ready.question_version_id=e.entity_id WHERE e.purpose='question-selection' AND ready.inventory_class='DYNAMIC_PROVISIONAL' AND e.primary_competency LIKE 'dsa.%' AND e.category='conceptual-oral' ORDER BY e.entity_id LIMIT 2")).rows,
  ...(await f.query("SELECT e.entity_id FROM retrieval_entities e JOIN content_question_readiness ready ON ready.question_version_id=e.entity_id WHERE e.purpose='question-selection' AND ready.inventory_class='DYNAMIC_PROVISIONAL' AND e.primary_competency LIKE 'programming.%' AND e.category='conceptual-oral' ORDER BY e.entity_id LIMIT 1")).rows];
 assert.equal(selected.length,3);
 for(const row of selected){
  await contentEditorial.addTechnicalReference(f.owner,row.entity_id,f.reference);
  const draft=await f.editor.createDraft({questionVersionId:row.entity_id,concepts:[{key:'fixture-mechanism',label:'Fixture mechanism',description:'Explain the mechanism with a concrete example',importance:1,required:true,sourceIds:[f.reference]}]});
  await f.editor.publish(draft.id,draft.hash,f.actor);
 }
 const express=(await import('express')).default,cookies=(await import('cookie-parser')).default,app=express();app.use(express.json());app.use(cookies());
 app.use('/api/interview-plans',(await import('../dist/routes/plannerRoutes.js')).default);app.use('/api/sessions',(await import('../dist/routes/sessionRoutes.js')).default);
 app.use('/api/code',(await import('../dist/routes/codeRoutes.js')).default);
 app.use((error,req,res,next)=>{void req;void next;res.status(error.status || 500).json({message:'Fixture API error'});});
 api=await new Promise((resolve,reject)=>{const listener=app.listen(0,'127.0.0.1',()=>resolve(listener));listener.once('error',reject);});
 const base=`http://127.0.0.1:${api.address().port}/api`,jwt=(await import('jsonwebtoken')).default;
 const cookie='jwt='+jwt.sign({id:f.owner},process.env.JWT_SECRET),other='jwt='+jwt.sign({id:f.other},process.env.JWT_SECRET);
 async function request(path,{method='GET',body,owner=cookie}={}){
   const response=await fetch(base+path,{method,headers:{Cookie:owner,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});const data=await response.json();return {status:response.status,data:data.session || data};
 }
 // A mixed real disposable corpus must never leak dynamic inventory during outage.
 const {PlannerService}=await import('../dist/planner/service.js');
 const {RetrievalService}=await import('../dist/retrieval/service.js');
 const strategies=[];
 const outageRetrieval=new RetrievalService({embed:async()=>{throw new Error('simulated local embedding outage');}});
 const outagePlanner=new PlannerService({retrieveQuestions:request=>{strategies.push(request.strategy);return outageRetrieval.retrieveQuestions(request);}});
 const outage=await outagePlanner.preview(f.owner,{role:'Software Engineer',level:'junior',taxonomyVersion:'junior-se-v1',competencies:['dsa','programming'],difficulty:'standard',mode:'mixed',count:3,minutes:45,language:'en',codeLanguage:'python',modifiers:{}});
 assert.equal(outage.canConfirm,true);assert.equal(outage.items.length,3);
 assert.ok(outage.items.every(item=>item.inventoryClass==='TRUSTED_BASELINE'&&!f.state.dynamicVersionIds.includes(item.questionVersionId)));
 assert.equal(strategies.filter(strategy=>strategy==='semantic').length,1);
 assert.ok(!strategies.includes('structured-practice'));
 assert.ok(outage.shortages.some(code=>code.startsWith('retrieval_unavailable:')));
 assert.equal(new Set(outage.items.map(item=>item.questionVersionId)).size,3);
 const setup={role:'Software Engineer',level:'junior',taxonomyVersion:'junior-se-v1',competencies:['dsa','programming'],difficulty:'standard',mode:'oral',count:3,minutes:30,language:'en',codeLanguage:'javascript',modifiers:{}};
 const preview=await request('/interview-plans/preview',{method:'POST',body:setup});assert.equal(preview.status,201);const plan=preview.data;assert.equal(plan.canConfirm,true);assert.equal(plan.effectiveCount,3);
 assert.equal((await request('/interview-plans/confirm',{method:'POST',owner:other,body:{planId:plan.id,revision:plan.revision}})).status,404);
 const confirmation=await request('/interview-plans/confirm',{method:'POST',body:{planId:plan.id,revision:plan.revision}});assert.equal(confirmation.status,200);
 const id=plan.sessionId;let c1=await child();f.state.mode='missing';f.state.gate=new Promise(r=>{release=r;});const calls=f.state.calls;
 const answer={questionIndex:'0',answerText:'FIFO explains the ordered mechanism.'};
 const accepted=await request(`/sessions/${id}/submit-answer`,{method:'POST',body:answer});assert.equal(accepted.status,200);const operation=accepted.data.operation.id;
 await until(()=>f.state.calls>calls,'provider reached before crash');await stop(c1,'SIGKILL');await f.redis.flushdb();release();f.state.gate=null;
 const c2=await child();await until(async()=>{const session=(await request(`/sessions/${id}`)).data;return session.questions[0].isEvaluated && session.questions.length===4 && !session.questions[0].followUpPending;},'grade and recovered concept probe');
 assert.equal((await request(`/sessions/${id}/submit-answer`,{method:'POST',body:answer})).data.operation.id,operation);
 let saved=(await request(`/sessions/${id}`)).data;assert.equal(saved.questions[3].followUpOf,0);assert.ok(saved.questions[3].followUpRationale);
 const gradeCount=(await f.query('SELECT count(*)::int AS n FROM evaluations WHERE answer_attempt_id=(SELECT answer_attempt_id FROM durable_operations WHERE id=$1)',[operation])).rows[0].n;assert.equal(gradeCount,1);
 f.state.mode='normal';for(const index of [1,2]){assert.equal((await request(`/sessions/${id}/submit-answer`,{method:'POST',body:{questionIndex:String(index),answerText:'FIFO explains another ordered mechanism.'}})).status,200);await until(async()=>(await request(`/sessions/${id}`)).data.questions[index].isEvaluated,'advance to next original');}
 // Stop queue consumers, commit the final answer, then restart with a durable finishing/report intent.
 await stop(c2);const final=await request(`/sessions/${id}/submit-answer`,{method:'POST',body:{questionIndex:'3',answerText:'FIFO now supplies a concrete example.'}});assert.equal(final.status,200);
 manual=new InterviewRuntime();await manual.process(final.data.operation.id);saved=(await request(`/sessions/${id}`)).data;assert.equal(saved.runtimeState,'finishing');assert.equal(saved.status,'in-progress');
 const c3=await child();await until(async()=>(await request(`/sessions/${id}`)).data.status==='completed','report recovered after restart');
 saved=(await request(`/sessions/${id}`)).data;assert.ok(saved.report);assert.equal(saved.reviewedSummary.eligible,2);assert.equal(saved.reviewedSummary.planned,3);assert.equal(saved.overallScore,null);assert.equal(saved.questions[1].evaluation,undefined);assert.equal(saved.questions[1].technicalScore,84);assert.equal(saved.questions[3].evaluation.rubricStatus,'provisional');
 const xp=(await f.query('SELECT xp FROM users WHERE id=$1',[f.owner])).rows[0].xp;
 assert.equal((await request(`/sessions/${id}/end`,{method:'POST',body:{}})).status,200);assert.equal((await request(`/sessions/${id}/end`,{method:'POST',body:{}})).status,200);
 assert.equal((await f.query('SELECT xp FROM users WHERE id=$1',[f.owner])).rows[0].xp,xp);
 assert.equal((await f.query('SELECT count(*)::int AS n FROM reward_ledger WHERE session_id=$1',[id])).rows[0].n,5);
 assert.equal((await request(`/sessions/${id}`,{owner:other})).status,404);
 assert.equal((await request('/sessions')).data.sessions.some(s=>s._id===id && s.status==='completed'),true);
 assert.deepEqual((await request(`/sessions/${id}`)).data.report,saved.report); // New HTTP client restores committed state.
 assert.equal((await request(`/sessions/${id}/operations`)).data.operations.every(op=>!('payload' in op) && !('result' in op)),true);
 // A real owned DELETE during provider latency invalidates the worker's eventual response.
 const doomed=await f.active();f.state.gate=new Promise(r=>{release=r;});const before=f.state.calls;
 assert.equal((await request(`/sessions/${doomed._id}/submit-answer`,{method:'POST',body:answer})).status,200);await until(()=>f.state.calls>before,'late-result deletion fixture');
 assert.equal((await request(`/sessions/${doomed._id}`,{method:'DELETE',owner:other})).status,404);assert.equal((await request(`/sessions/${doomed._id}`,{method:'DELETE'})).status,200);release();f.state.gate=null;
 await until(async()=>(await f.query('SELECT count(*)::int AS n FROM durable_operations WHERE session_id=$1',[doomed._id])).rows[0].n===0,'owned cascade');assert.equal((await request(`/sessions/${doomed._id}`)).status,404);
 // Exercise the real code and answer routes with the exact trusted binary-search starter.
 const trusted=(await f.query(`SELECT e.entity_id,e.content_hash,e.category,e.text,ready.inventory_class FROM retrieval_entities e
   JOIN content_question_readiness ready ON ready.question_version_id=e.entity_id
   WHERE e.purpose='question-selection' AND e.content_hash='ac0eecf2e0c1622ad065077248fe0c03edd68acaa72a5d5facdcef0e030daf7f' AND e.category='coding'`)).rows[0];
 assert.equal(trusted.inventory_class,'TRUSTED_BASELINE');
 const trustedSession=await f.repo.create({user:f.owner,role:'Software Engineer',level:'Junior',interviewType:'coding-mix'});
 const trustedPlan=await f.knowledge.createPlan(f.owner,{sessionId:trustedSession._id,contractVersion:'phase95-trusted-runtime-fixture',plannerVersion:'fixture',taxonomyVersion:'junior-se-v1',corpusVersion:'fixture',role:'Software Engineer',mode:'coding',requestedCount:1,effectiveCount:1,requestedMinutes:15,effectiveMinutes:15,selectedCompetencies:['dsa']});
 const trustedItem=await f.knowledge.addPlanItem(f.owner,{planId:trustedPlan,position:0,questionVersionId:trusted.entity_id,selectionReason:'trusted-baseline-regression',estimatedMinutes:15});
 trustedSession.questions=[{planItemId:trustedItem,questionVersionId:trusted.entity_id,inventoryClass:'TRUSTED_BASELINE',questionText:trusted.text,questionType:'coding',language:'javascript',idealAnswer:'',isSubmitted:false,isEvaluated:false}];
 await f.query("UPDATE sessions SET interview_plan_id=$2,scoring_version='rubric-v1',runtime_version='aptlyra-runtime-v1',runtime_state='active' WHERE id=$1",[trustedSession._id,trustedPlan]);
 trustedSession.planId=trustedPlan;trustedSession.scoringVersion='rubric-v1';trustedSession.runtimeVersion='aptlyra-runtime-v1';trustedSession.runtimeState='active';trustedSession.status='in-progress';await f.repo.save(trustedSession);
 const originalFetch=globalThis.fetch,passingTests={cases:[{id:'match',expected:3,actual:3,passed:true},{id:'missing',expected:-1,actual:-1,passed:true},{id:'empty',expected:-1,actual:-1,passed:true}]};
 globalThis.fetch=async(url,options)=>String(url).startsWith('https://api.jdoodle.com/')
   ?new Response(JSON.stringify({statusCode:200,output:`__APTLYRA_TEST_RESULTS__${JSON.stringify(passingTests)}`,cpuTime:'0.01',memory:'1'}),{status:200})
   :originalFetch(url,options);
 const rubricCallsBefore=f.state.calls,legacyCallsBefore=f.state.legacyCalls;
 try{
   const run=await request('/code/execute',{method:'POST',body:{sessionId:trustedSession._id,questionIndex:0,language:'python',code:'def binary_search(a,t): return a.index(t) if t in a else -1'}});
   assert.equal(run.status,200);assert.equal(run.data.run.code,0);assert.equal(run.data.tests.passed,true);assert.equal(run.data.tests.cases.length,3);
   assert.equal((await request(`/sessions/${trustedSession._id}/submit-answer`,{method:'POST',body:{questionIndex:'0',code:'def binary_search(a,t): return a.index(t) if t in a else -1',language:'python',answerText:''}})).status,200);
   await until(async()=>{const current=(await request(`/sessions/${trustedSession._id}`)).data;return current.questions[0].isEvaluated;},'trusted baseline answer route evaluation');
   const trustedAnswer=(await request(`/sessions/${trustedSession._id}`)).data.questions[0];
   assert.equal(trustedAnswer.language,'python','submitted Python is retained even when the plan started in JavaScript');
   assert.equal(trustedAnswer.processingState,'evaluated');assert.equal(trustedAnswer.evaluation,undefined);
   assert.equal(trustedAnswer.technicalScore,84);assert.match(trustedAnswer.aiFeedback,/trusted starter path/);
   assert.equal(f.state.legacyCalls,legacyCallsBefore+1);assert.equal(f.state.calls,rubricCallsBefore,'trusted baseline answers never call dynamic rubric evaluation');
   const attempt=(await f.query('SELECT status,selected_rubric_id FROM answer_attempts WHERE session_id=$1',[trustedSession._id])).rows[0];
   assert.equal(attempt.status,'evaluated');assert.equal(attempt.selected_rubric_id,null);
   assert.equal((await f.query('SELECT count(*)::int AS n FROM evaluations WHERE answer_attempt_id=(SELECT id FROM answer_attempts WHERE session_id=$1)',[trustedSession._id])).rows[0].n,0,
     'trusted baseline legacy score does not fabricate a dynamic evaluation or rubric approval');
 }finally{globalThis.fetch=originalFetch;}
 // Python support must not relabel SQL exercises or reject their existing SQL submissions.
 const sql=(await f.query("SELECT e.entity_id,e.text FROM retrieval_entities e JOIN content_question_readiness ready ON ready.question_version_id=e.entity_id WHERE e.category='sql' AND ready.inventory_class='TRUSTED_BASELINE' LIMIT 1")).rows[0];
 const sqlSession=await f.repo.create({user:f.owner,role:'Software Engineer',level:'Junior',interviewType:'coding-mix'});
 const sqlPlan=await f.knowledge.createPlan(f.owner,{sessionId:sqlSession._id,contractVersion:'sql-regression-fixture',plannerVersion:'fixture',taxonomyVersion:'junior-se-v1',corpusVersion:'fixture',role:'Software Engineer',mode:'coding',requestedCount:1,effectiveCount:1,requestedMinutes:15,effectiveMinutes:15,selectedCompetencies:['dbms-sql']});
 const sqlItem=await f.knowledge.addPlanItem(f.owner,{planId:sqlPlan,position:0,questionVersionId:sql.entity_id,selectionReason:'sql-regression',estimatedMinutes:5});
 sqlSession.questions=[{planItemId:sqlItem,questionVersionId:sql.entity_id,inventoryClass:'TRUSTED_BASELINE',questionText:sql.text,questionType:'coding',language:'sql',idealAnswer:'',isSubmitted:false,isEvaluated:false}];
 await f.query("UPDATE sessions SET interview_plan_id=$2,scoring_version='rubric-v1',runtime_version='aptlyra-runtime-v1',runtime_state='active' WHERE id=$1",[sqlSession._id,sqlPlan]);
 Object.assign(sqlSession,{planId:sqlPlan,scoringVersion:'rubric-v1',runtimeVersion:'aptlyra-runtime-v1',runtimeState:'active',status:'in-progress'});await f.repo.save(sqlSession);
 const sqlBody={questionIndex:'0',code:'SELECT 1',language:'sql'};
 assert.equal((await request(`/sessions/${sqlSession._id}/submit-answer`,{method:'POST',body:{...sqlBody,language:'python'}})).status,400);
 assert.equal((await request(`/sessions/${sqlSession._id}/submit-answer`,{method:'POST',body:sqlBody})).status,200);
 await until(async()=>(await request(`/sessions/${sqlSession._id}`)).data.questions[0].isEvaluated,'SQL answer preserved');
 assert.equal((await request(`/sessions/${sqlSession._id}`)).data.questions[0].language,'sql');
 await stop(c3);console.log('PASS: dynamic rubric recovery plus actual trusted answer submission, binary-search execution tests, no dynamic abstention, no fabricated rubric evaluation, pgvector, rewards, reports and ownership fences. Fictional providers/reviews only.');
}finally{
 release?.();f.state.gate=null;for(const c of children)await stop(c);await manual?.stop(true);
 if(api){api.closeAllConnections();await new Promise(r=>api.close(r));}await f.cleanup();
}
