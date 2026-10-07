import {randomUUID} from "node:crypto";
import {Queue,Worker} from "bullmq";
import type {Server} from "socket.io";
import redisClient from "../config/redisConfig.js";
import {query,withDatabaseLock} from "../config/db.js";
import {sessionRepository,withSessionLock,type ISession,type IQuestion} from "../models/Session.js";
import {publicEvaluationSession} from "../evaluation/readModel.js";
import {evaluationService,type Prepared} from "../evaluation/service.js";
import {hash} from "../evaluation/rubrics.js";
import {aiService,AIServiceError} from "../services/aiService.js";
import {gamificationService} from "../services/gamificationService.js";
import {bumpRevision,insertOperation,requestFinish} from "./operations.js";
import {RUNTIME,RuntimeFailure} from "./contracts.js";
import {readStagedAudio,removeStagedAudio,cleanOrphanMedia} from "./media.js";

const QUEUE="aptlyra-interview-operations";
type Operation=Record<string,any>;
export interface RuntimeOptions {
  io?:Server; concurrency?:number; leaseMs?:number; pollMs?:number; retryMs?:number;
  // Dependency seams let disposable tests interrupt real workers without production fault switches.
  beforeCommit?:(op:Operation)=>Promise<void>;
  buildReport?:(session:ISession)=>Promise<void>;
  publish?:(id:string)=>Promise<void>;
}
function safeFailure(error:unknown) {
  if(error instanceof RuntimeFailure)return error;
  if(error instanceof AIServiceError)return new RuntimeFailure(error.code,["provider_rate_limited","provider_timeout","provider_unavailable"].includes(error.code));
  const code=(error as {code?:string})?.code;
  if(code && ["40001","40P01","08006","ECONNRESET","ECONNREFUSED","ETIMEDOUT"].includes(code))return new RuntimeFailure("database_unavailable",true);
  if(error instanceof Error && /withdrawn|retired|erased|Stale answer|no longer active/i.test(error.message))return new RuntimeFailure("evidence_or_answer_unavailable");
  if(error instanceof Error && /No speech detected/i.test(error.message))return new RuntimeFailure("no_speech_detected");
  return new RuntimeFailure("invalid_provider_response");
}
function speechProjection(question:IQuestion,speech:any) {
  question.speechMetricsStatus=speech?.metrics_status || "unavailable";
  if(speech?.metrics_status!=="available"){delete question.speechMetrics;return;}
  const m=speech.metrics,wpm=m.pace_wpm;
  question.speechMetrics={fillerWordCount:m.filler_words_count,fillerWords:[],speakingPaceWpm:wpm,
    paceRating:wpm<110?"Slow":wpm>160?"Fast":"Optimal",totalPauseDurationMs:m.pause_time_seconds*1000,
    pauseCount:m.pause_count,clarityScore:Math.max(0,100-m.filler_words_count*2-m.pause_count*1.5)};
}

/** SQL is the durable work list. BullMQ carries only an operation ID, never candidate content. */
export class InterviewRuntime {
  readonly owner=randomUUID();
  private queue:Queue<{operationId:string}>;
  private worker:Worker<{operationId:string}>|null=null;
  private timer:ReturnType<typeof setInterval>|null=null;
  private ticking=false;
  private stopping=false;
  private lastCleanup=0;
  private publishing=new Set<string>();
  private leaseMs:number;
  private retryMs:number;
  constructor(private options:RuntimeOptions={}) {
    this.leaseMs=options.leaseMs || 30000;this.retryMs=options.retryMs || 1000;
    this.queue=new Queue(QUEUE,{connection:redisClient as any});
    this.queue.on("error",()=>{/* SQL intents survive Redis outages. */});
  }
  async start() {
    if(this.worker)return;
    this.worker=new Worker(QUEUE,job=>this.process(job.data.operationId),{connection:redisClient as any,
      concurrency:Math.max(1,Math.min(this.options.concurrency || 2,4))});
    this.worker.on("error",()=>{/* Recovery publisher retries from SQL. */});
    await this.tick();
    this.timer=setInterval(()=>{void this.tick().catch(()=>{});},this.options.pollMs || 1000);
    this.timer.unref();
  }
  async stop(force=false) {
    this.stopping=true;if(this.timer)clearInterval(this.timer);this.timer=null;
    if(force)await query("UPDATE durable_operations SET lease_expires_at=now() WHERE runtime_version=$1 AND status='running' AND lease_owner=$2",[RUNTIME,this.owner]);
    await this.worker?.close(force);this.worker=null;await this.queue.close();
  }
  /** Startup and periodic reconciliation also republish SQL work whose Redis jobs disappeared. */
  async tick() {
    if(this.ticking || this.stopping)return;this.ticking=true;
    try {
      const expired=(await query("SELECT *,deadline<=now() AS deadline_due FROM durable_operations WHERE runtime_version=$1 AND status IN ('queued','running','retryable_failed') AND ((status='running' AND lease_expires_at<=now()) OR (deadline<=now() AND (status<>'retryable_failed' OR next_retry_at IS NOT NULL)))",[RUNTIME])).rows;
      for(const op of expired)await this.expire(op);
      const ready=(await query("SELECT * FROM durable_operations WHERE runtime_version=$1 AND deadline>now() AND (status='queued' OR (status='retryable_failed' AND next_retry_at<=now() AND attempts<max_attempts)) ORDER BY created_at LIMIT 50",[RUNTIME])).rows;
      for(const op of ready){
        if(this.stopping)break;
        // Stable BullMQ IDs deduplicate concurrent publishers. Never hold a SQL lock over Redis I/O.
        if(this.publishing.has(op.id) || (!this.options.publish && redisClient.status!=="ready"))continue;
        try{
          this.publishing.add(op.id);
          const publication=(this.options.publish?this.options.publish(op.id):this.queue.add("execute",{operationId:op.id},{jobId:op.id,attempts:1,removeOnComplete:true,removeOnFail:true})).finally(()=>this.publishing.delete(op.id));
          let timeout:ReturnType<typeof setTimeout>|undefined;
          try{await Promise.race([publication,new Promise((_,reject)=>{timeout=setTimeout(()=>reject(new Error("queue_unavailable")),3000);})]);}
          finally{if(timeout)clearTimeout(timeout);}
          await query("UPDATE transactional_outbox SET status='published',published_at=now(),attempts=attempts+1,updated_at=now() WHERE operation_id=$1 AND EXISTS(SELECT 1 FROM durable_operations WHERE id=$1 AND status<>'terminal_failed')",[op.id]);
        }catch{
          await query("UPDATE transactional_outbox SET status='failed',attempts=attempts+1,updated_at=now() WHERE operation_id=$1 AND status<>'published'",[op.id]).catch(()=>{});
        }
      }
      if(Date.now()-this.lastCleanup>60000){
        this.lastCleanup=Date.now();
        const expiredMedia=(await query("DELETE FROM staged_interview_media WHERE expires_at<=now() RETURNING filename")).rows;
        await Promise.all(expiredMedia.map(m=>removeStagedAudio(m.filename).catch(()=>{})));
        await cleanOrphanMedia(new Set((await query("SELECT filename FROM staged_interview_media")).rows.map(m=>m.filename)));
      }
    } finally{this.ticking=false;}
  }
  private notify(op:Operation,session:ISession,state:string) {
    this.options.io?.to(session.user).emit("sessionUpdate",{sessionId:session._id,revision:session.revision,
      operationId:op.id,eventId:`${op.id}:${session.revision}:${state}`,state,errorCode:op.error_code || null});
  }
  private async fence(op:Operation) {
    const current=(await query("SELECT *,lease_expires_at>clock_timestamp() AND deadline>clock_timestamp() AS lease_valid FROM durable_operations WHERE id=$1 AND session_id=$2 AND user_id=$3",[op.id,op.session_id,op.user_id])).rows[0];
    const session=await sessionRepository.findByIdForUser(op.session_id,op.user_id);
    if(!current || !session || current.status!=="running" || current.lease_owner!==this.owner || current.lease_token!==op.lease_token ||
      !current.lease_valid ||
      Number(current.session_revision)!==session.revision || session.status!=="in-progress" ||
      (op.operation_type==="report"?session.runtimeState!=="finishing":session.runtimeState!=="active"))throw new RuntimeFailure("stale_operation");
    if(op.operation_type!=="report"){
      const question=session.questions[op.question_index];
      if(!question || (op.operation_type==="evaluate" && (question.operationId!==op.id || question.isEvaluated || !question.isSubmitted)))throw new RuntimeFailure("stale_operation");
      if(question.planItemId!==op.plan_item_id || !(await query("SELECT 1 FROM plan_items WHERE id=$1 AND session_id=$2 AND user_id=$3 AND question_version_id=$4",[op.plan_item_id,session._id,session.user,question.questionVersionId])).rows.length)throw new RuntimeFailure("stale_operation");
      if(!(await query("SELECT entity_id FROM retrieval_entities WHERE purpose='question-selection' AND entity_id=$1",[question.questionVersionId])).rows.length)throw new RuntimeFailure("evidence_or_answer_unavailable");
      if(op.answer_attempt_id && !(await query("SELECT 1 FROM answer_attempts WHERE id=$1 AND session_id=$2 AND user_id=$3 AND plan_item_id=$4 AND question_version_id=$5 AND privacy_status='present'",[op.answer_attempt_id,session._id,session.user,op.plan_item_id,question.questionVersionId])).rows.length)throw new RuntimeFailure("evidence_or_answer_unavailable");
    }
    return session;
  }
  private async claim(id:string):Promise<Operation|null> {
    const row=(await query("SELECT session_id FROM durable_operations WHERE id=$1 AND runtime_version=$2",[id,RUNTIME])).rows[0];if(!row)return null;
    const claimed=await withSessionLock(row.session_id,async()=>{
      const op=(await query("SELECT *,next_retry_at<=now() AS retry_due,deadline>now() AS within_deadline FROM durable_operations WHERE id=$1",[id])).rows[0];
      if(!op || !(op.status==="queued" || (op.status==="retryable_failed" && op.retry_due)) || op.attempts>=op.max_attempts || !op.within_deadline)return null;
      const session=await sessionRepository.findByIdForUser(op.session_id,op.user_id);
      if(!session || session.status!=="in-progress" || session.revision!==Number(op.session_revision)){
        await query("UPDATE durable_operations SET status='terminal_failed',error_code='stale_operation',next_retry_at=NULL,updated_at=now() WHERE id=$1",[id]);return null;
      }
      const token=randomUUID();
      await bumpRevision(session);
      const claimed=(await query("UPDATE durable_operations SET status='running',attempts=attempts+1,total_attempts=total_attempts+1,lease_owner=$2,lease_token=$3,lease_expires_at=now()+($4*interval '1 millisecond'),next_retry_at=NULL,error_code=NULL,session_revision=$5,updated_at=now() WHERE id=$1 RETURNING *",[id,this.owner,token,this.leaseMs,session.revision])).rows[0];
      if(op.operation_type==="evaluate"){
        const a=(await query("SELECT * FROM answer_attempts WHERE id=$1",[op.answer_attempt_id])).rows[0];
        if(!a)throw new RuntimeFailure("evidence_or_answer_unavailable");
        const state=a.runtime_extracted?"evaluating":a.input_kind==="audio"?"transcribing":"received";
        await query("UPDATE answer_attempts SET status=$2,updated_at=now() WHERE id=$1",[a.id,state]);
        session.questions[op.question_index].processingState=state;delete session.questions[op.question_index].processingError;
        await sessionRepository.save(session);
      }
      return {op:claimed,session};
    });
    if(!claimed)return null;this.notify(claimed.op,claimed.session,"running");return claimed.op;
  }
  private async checkpoint(op:Operation,change:(session:ISession)=>Promise<void>) {
    const saved=await withDatabaseLock("ingestion:editorial:v1",()=>withSessionLock(op.session_id,async()=>{
      const session=await this.fence(op);await change(session);await sessionRepository.save(session);await bumpRevision(session);
      await query("UPDATE durable_operations SET session_revision=$2,updated_at=now() WHERE id=$1",[op.id,session.revision]);
      op.session_revision=session.revision;return session;
    }));
    this.notify(op,saved,saved.questions[op.question_index]?.processingState || "running");
  }
  async process(id:string) {
    const op=await this.claim(id);if(!op)return;
    const heartbeat=setInterval(()=>{
      if(!this.stopping)void query("UPDATE durable_operations SET lease_expires_at=least(deadline,now()+($4*interval '1 millisecond')) WHERE id=$1 AND status='running' AND lease_owner=$2 AND lease_token=$3 AND lease_expires_at>now()",[id,this.owner,op.lease_token,this.leaseMs]).catch(()=>{});
    },Math.max(25,Math.floor(this.leaseMs/3)));heartbeat.unref();
    try {
      await withSessionLock(op.session_id,()=>this.fence(op));
      if(op.operation_type==="evaluate")await this.evaluate(op);
      else if(op.operation_type==="follow-up")await this.probe(op);
      else if(op.operation_type==="report")await this.report(op);
      else throw new RuntimeFailure("unsupported_operation");
    }catch(error){
      const failure=safeFailure(error);
      // A saved report must offer its own recovery even for an unexpected storage/build error.
      // Ownership/revision fences remain terminal; retry cannot revive stale work.
      const reported=op.operation_type==="report" && !["stale_operation","stale_report"].includes(failure.code)
        ?new RuntimeFailure("report_unavailable",true):failure;
      await this.fail(op,reported).catch(()=>{/* Expired SQL leases are recovered later. */});
    }
    finally{clearInterval(heartbeat);}
  }
  private async evaluate(op:Operation) {
    let answer=(await query("SELECT * FROM answer_attempts WHERE id=$1",[op.answer_attempt_id])).rows[0];
    if(!answer || answer.privacy_status!=="present")throw new RuntimeFailure("evidence_or_answer_unavailable");
    if(!answer.runtime_extracted){
      const media=(await query("SELECT * FROM staged_interview_media WHERE answer_attempt_id=$1 AND expires_at>now()",[answer.id])).rows[0];
      if(!media)throw new RuntimeFailure("media_unavailable");
      const speech=await aiService.analyzeSpeech(await readStagedAudio(media),undefined,media.filename);
      if(!speech.transcript.trim() || speech.transcript.length>50000)throw new RuntimeFailure("no_speech_detected");
      await this.checkpoint(op,async session=>{
        await query("UPDATE answer_attempts SET extracted_text=$2,speech_result=$3,runtime_extracted=true,status='evaluating',updated_at=now() WHERE id=$1",[answer.id,speech.transcript,JSON.stringify(speech)]);
        session.questions[op.question_index].processingState="evaluating";
      });
      answer=(await query("SELECT * FROM answer_attempts WHERE id=$1",[answer.id])).rows[0];
      await removeStagedAudio(media.filename).catch(()=>{});await query("DELETE FROM staged_interview_media WHERE id=$1",[media.id]);
    }
    const diagram=answer.artifact_refs.find((a:any)=>a.kind==="diagram")?.url;
    const prepared:Prepared=await evaluationService.prepare(op.session_id,op.user_id,op.question_index,answer.extracted_text ?? answer.answer_text ?? "",answer.code_text || "",diagram,answer.id);
    if(!answer.runtime_prepared)await this.checkpoint(op,async session=>{
      await query("UPDATE answer_attempts SET runtime_prepared=true,status='evaluating',selected_rubric_id=$2,grounding_snapshot=$3,updated_at=now() WHERE id=$1",[answer.id,prepared.input?.rubric.id || null,JSON.stringify({rubricHash:prepared.input?.rubric.hash || null,sourceIds:prepared.input?.rubric.references.map(r=>r.id) || [],objective:prepared.objective})]);
      session.questions[op.question_index].processingState="evaluating";
    });
    const computed=await evaluationService.compute(prepared);
    await this.options.beforeCommit?.(op);
    const saved=await withDatabaseLock("ingestion:editorial:v1",()=>withSessionLock(op.session_id,async()=>{
      const session=await this.fence(op);const question=session.questions[op.question_index];
      const view=await evaluationService.commit(op.user_id,answer.id,computed.view,computed.provider);
      question.evaluation=view;question.userAnswerText=answer.extracted_text ?? answer.answer_text ?? "";question.userSubmittedCode=answer.code_text || "";
      if(diagram)question.userSubmittedDiagram=diagram;
      question.idealAnswer="";question.isEvaluated=true;question.isSubmitted=true;
      question.processingState=view.status==="scored"?"evaluated":"abstained";delete question.processingError;
      if(view.technicalScore!==null)question.technicalScore=view.technicalScore;else delete question.technicalScore;
      speechProjection(question,answer.speech_result);
      await gamificationService.rewardDurable(session._id,session.user,`answer:${op.question_index}`);
      await sessionRepository.save(session);await bumpRevision(session);
      await this.succeed(op,session,{evaluationId:view.id,answerAttemptId:answer.id});
      if(view.status==="scored" && view.followUpConceptId && question.followUpOf===undefined){
        const reserved=Number((await query("SELECT count(*) AS n FROM durable_operations WHERE session_id=$1 AND operation_type='follow-up' AND runtime_version=$2",[session._id,RUNTIME])).rows[0].n);
        if(reserved<2 && !question.probeOperationId){
          const concept=view.concepts.find(c=>c.id===view.followUpConceptId);
          const payload={parentIndex:op.question_index,parentEvaluationId:view.id,conceptId:view.followUpConceptId,
            rationale:concept?.explanation || "Clarify a specific missing concept",sourceIds:concept?.sourceIds || []};
          const probe=await insertOperation(session,"follow-up",`probe:${view.id}`,payload,hash(payload),undefined,op.plan_item_id,op.question_index);
          session.questions[op.question_index].followUpPending=true;session.questions[op.question_index].probeOperationId=probe.id;await sessionRepository.save(session);
        }
      }
      if(session.questions.every(q=>q.isEvaluated) && !session.questions.some(q=>q.followUpPending))await requestFinish(session);
      return session;
    }));this.notify({...op,error_code:null},saved,"succeeded");
  }
  private async probe(op:Operation) {
    const session=await withSessionLock(op.session_id,()=>this.fence(op));const parent=session.questions[op.question_index];
    if(parent.followUpOf!==undefined || !parent.followUpPending || parent.probeOperationId!==op.id || parent.evaluation?.id!==op.payload.parentEvaluationId || parent.evaluation?.status!=="scored")throw new RuntimeFailure("stale_probe");
    const generated=await aiService.generateFollowUp({question:parent.questionText,userAnswer:parent.userAnswerText || parent.userSubmittedCode || "",
      aiFeedback:`Probe concept ${op.payload.conceptId}: ${op.payload.rationale}`,role:session.role,level:session.level},1);
    if(!generated.question.trim() || generated.question.length>12000)throw new RuntimeFailure("invalid_provider_response");
    await this.options.beforeCommit?.(op);
    const saved=await withDatabaseLock("ingestion:editorial:v1",()=>withSessionLock(op.session_id,async()=>{
      const fresh=await this.fence(op),q=fresh.questions[op.question_index];
      if(!q.followUpPending || q.probeOperationId!==op.id || q.evaluation?.id!==op.payload.parentEvaluationId || q.evaluation?.status!=="scored" || fresh.questions.some(x=>x.followUpOf===op.question_index) || fresh.questions.filter(x=>x.followUpOf!==undefined).length>=2)throw new RuntimeFailure("stale_probe");
      // Recheck the exact parent scoring evidence after provider latency.
      await publicEvaluationSession(fresh);
      if(fresh.questions[op.question_index].evaluation?.status!=="scored")throw new RuntimeFailure("evidence_or_answer_unavailable");
      fresh.questions.push({questionText:generated.question,questionType:"oral",idealAnswer:"",isSubmitted:false,isEvaluated:false,
        followUpOf:op.question_index,followUpConceptId:op.payload.conceptId,followUpRationale:op.payload.rationale,
        parentEvaluationId:op.payload.parentEvaluationId,probeOperationId:op.id,questionVersionId:q.questionVersionId,
        planItemId:q.planItemId,primaryCompetency:q.primaryCompetency,createdAt:new Date().toISOString()});
      q.followUpPending=false;await sessionRepository.save(fresh);await bumpRevision(fresh);await this.succeed(op,fresh,{questionIndex:fresh.questions.length-1});return fresh;
    }));this.notify(op,saved,"succeeded");
  }
  private async report(op:Operation) {
    const session=await withSessionLock(op.session_id,()=>this.fence(op));
    await this.options.buildReport?.(session);await this.options.beforeCommit?.(op);
    const saved=await withDatabaseLock("ingestion:editorial:v1",()=>withSessionLock(op.session_id,async()=>{
      const fresh=await this.fence(op);
      if(JSON.stringify(fresh.questions.map(q=>q.evaluation?.id || null))!==JSON.stringify(op.payload.evaluationIds))throw new RuntimeFailure("stale_report");
      await publicEvaluationSession(fresh);
      const summary=sessionRepository.calculateScoreSummary(fresh),reportId=randomUUID();
      await query("INSERT INTO interview_reports(id,session_id,user_id,snapshot_revision,scoring_version,summary,questions) VALUES($1,$2,$3,$4,$5,$6,$7)",[reportId,fresh._id,fresh.user,op.payload.snapshotRevision,fresh.scoringVersion,JSON.stringify({metrics:summary,reviewedSummary:fresh.reviewedSummary || null,evaluationIds:op.payload.evaluationIds}),JSON.stringify(fresh.questions)]);
      fresh.overallScore=summary.overallScore;fresh.metrics={avgTechnical:summary.avgTechnical,avgConfidence:summary.avgConfidence};
      fresh.status="completed";fresh.endTime=new Date().toISOString();await sessionRepository.save(fresh);await bumpRevision(fresh,"completed");
      await gamificationService.rewardDurable(fresh._id,fresh.user,"completion",true);
      await this.succeed(op,fresh,{reportId,snapshotRevision:op.payload.snapshotRevision});return fresh;
    }));this.notify(op,saved,"completed");
  }
  private async succeed(op:Operation,session:ISession,result:Record<string,unknown>) {
    await query("UPDATE durable_operations SET status='succeeded',result=$2,committed_revision=$3,lease_owner=NULL,lease_token=NULL,lease_expires_at=NULL,next_retry_at=NULL,error_code=NULL,updated_at=now() WHERE id=$1",[op.id,JSON.stringify(result),session.revision]);
    await query("UPDATE transactional_outbox SET status='published',published_at=now(),aggregate_revision=$2,payload=$3,updated_at=now() WHERE operation_id=$1",[op.id,session.revision,JSON.stringify({operationId:op.id,state:"succeeded",revision:session.revision})]);
  }
  private async expire(op:Operation) {
    const deadline=op.deadline_due;
    await this.fail(op,new RuntimeFailure(deadline?"operation_deadline":"worker_lease_expired",true),true,deadline);
  }
  private async fail(op:Operation,failure:RuntimeFailure,recovery=false,deadline=false) {
    const saved=await withSessionLock(op.session_id,async()=>{
      const current=(await query("SELECT *,deadline<=now() AS deadline_due,lease_expires_at<=now() AS lease_expired FROM durable_operations WHERE id=$1",[op.id])).rows[0];
      if(!current || ["succeeded","terminal_failed"].includes(current.status))return;
      if(!recovery && (current.status!=="running" || current.lease_owner!==this.owner || current.lease_token!==op.lease_token))return;
      if(recovery && deadline && !current.deadline_due)return;
      if(recovery && !deadline && (current.status!=="running" || !current.lease_expired))return;
      const session=await sessionRepository.findByIdForUser(op.session_id,op.user_id);if(!session)return;
      const automatic=failure.retryable && !deadline && current.attempts<current.max_attempts;
      const status=failure.retryable?"retryable_failed":"terminal_failed";
      const question=session.questions[current.question_index];
      const projected=session.status==="in-progress" && Number(current.session_revision)===session.revision;
      if(projected && current.operation_type==="evaluate" && question?.operationId===current.id && !question.isEvaluated){
        question.processingState="failed";question.processingError=failure.code;question.isSubmitted=failure.retryable;
        await query("UPDATE answer_attempts SET status='failed',updated_at=now() WHERE id=$1 AND status IN ('received','transcribing','evaluating')",[current.answer_attempt_id]);
      }
      if(projected && current.operation_type==="follow-up" && question?.probeOperationId===current.id && !failure.retryable)question.followUpPending=false;
      if(projected){await sessionRepository.save(session);await bumpRevision(session);}
      const fresh=(await query("UPDATE durable_operations SET status=$2,error_code=$3,next_retry_at=CASE WHEN $4 THEN now()+($5*interval '1 millisecond') ELSE NULL END,lease_owner=NULL,lease_token=NULL,lease_expires_at=NULL,session_revision=$6,updated_at=now() WHERE id=$1 RETURNING *",[current.id,status,failure.code,automatic,this.retryMs*Math.pow(2,Math.max(0,current.attempts-1)),projected?session.revision:current.session_revision])).rows[0];
      await query("UPDATE transactional_outbox SET status=$2,published_at=NULL,updated_at=now() WHERE operation_id=$1",[current.id,failure.retryable?"pending":"failed"]);
      return {op:fresh,session};
    });
    if(saved)this.notify(saved.op,saved.session,saved.op.status);
  }
}

export async function startInterviewRuntime(io?:Server) {
  const installed=(await query("SELECT to_regclass('interview_reports') IS NOT NULL AS installed")).rows[0].installed;
  if(!installed)return null; // Baseline-only consumers remain supported; release applies 008 explicitly.
  const runtime=new InterviewRuntime({io});await runtime.start();return runtime;
}
