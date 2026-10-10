import {randomUUID} from "node:crypto";
import {query,withDatabaseLock} from "../config/db.js";
import {sessionRepository,withSessionLock,type ISession} from "../models/Session.js";
import {knowledgeRepository} from "../repositories/knowledgeRepository.js";
import {hash} from "../evaluation/rubrics.js";
import {RUNTIME,SessionStateError,type OperationView} from "./contracts.js";
import {stageAudio,removeStagedAudio} from "./media.js";

export const publicOperation=(op:any):OperationView=>({id:op.id,type:op.operation_type,status:op.status,questionIndex:op.question_index,
  attempts:op.attempts,maxAttempts:op.max_attempts,totalAttempts:op.total_attempts,manualRetries:op.manual_retries,
  errorCode:op.error_code,retryAvailable:op.status==="retryable_failed" && !op.next_retry_at,
  nextRetryAt:op.next_retry_at?new Date(op.next_retry_at).toISOString():null});

export async function bumpRevision(session:ISession,state?:"active"|"finishing"|"completed") {
  const row=(await query("UPDATE sessions SET runtime_revision=runtime_revision+1,runtime_state=coalesce($2,runtime_state),updated_at=now() WHERE id=$1 RETURNING runtime_revision,runtime_state",[session._id,state || null])).rows[0];
  session.revision=Number(row.runtime_revision);session.runtimeState=row.runtime_state;return session.revision;
}
export async function insertOperation(session:ISession,type:"evaluate"|"follow-up"|"report",key:string,payload:Record<string,unknown>,payloadHash:string,
  answer?:string,item?:string,index?:number) {
  const id=randomUUID();
  const row=(await query(`INSERT INTO durable_operations(id,session_id,user_id,operation_type,idempotency_key,payload_hash,session_revision,
    runtime_version,answer_attempt_id,plan_item_id,question_index,payload,deadline,scope_type,scope_id)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,now()+interval '10 minutes','session',$2) RETURNING *`,
    [id,session._id,session.user,type,key,payloadHash,session.revision || 0,RUNTIME,answer || null,item || null,index ?? null,JSON.stringify(payload)])).rows[0];
  await query(`INSERT INTO transactional_outbox(id,session_id,user_id,aggregate_revision,event_type,payload,operation_id,scope_type,scope_id)
    VALUES($1,$2,$3,$4,'interview.operation.queued',$5,$6,'session',$2)`,[randomUUID(),session._id,session.user,session.revision || 0,JSON.stringify({operationId:id}),id]);
  return row;
}
export async function ownedOperations(sessionId:string,userId:string) {
  if(!await sessionRepository.findByIdForUser(sessionId,userId))throw new SessionStateError("Session not found",404);
  return (await query("SELECT * FROM durable_operations WHERE session_id=$1 AND user_id=$2 AND runtime_version=$3 ORDER BY created_at,id",[sessionId,userId,RUNTIME])).rows.map(publicOperation);
}
export async function hasUnfinishedWork(sessionId:string) {
  return (await query("SELECT EXISTS(SELECT 1 FROM durable_operations WHERE session_id=$1 AND runtime_version=$2 AND status IN ('queued','running','retryable_failed')) AS busy",[sessionId,RUNTIME])).rows[0].busy;
}

/** Adopt an idle pre-upgrade, real planner session on its next owned write; never rewrite history on GET/migration. */
export async function adoptIdlePlanner(session:ISession) {
  if(session.runtimeVersion || session.runtimeState===undefined || session.scoringVersion!=="rubric-v1" || !session.planId || session.status!=="in-progress")return;
  if(!(await query("SELECT 1 FROM interview_plans WHERE id=$1 AND session_id=$2 AND user_id=$3 AND contract_version='planner-v1'",[session.planId,session._id,session.user])).rows.length)return;
  if(session.questions.some(q=>(q.isSubmitted && !q.isEvaluated) || q.followUpPending))throw new SessionStateError("Earlier processing must finish before this interview can use saved recovery.");
  await query("UPDATE sessions SET runtime_version=$2 WHERE id=$1",[session._id,RUNTIME]);session.runtimeVersion=RUNTIME;await bumpRevision(session);
}

/** Called inside the existing session transaction after ownership/input/selection validation. */
export async function acceptAnswer(session:ISession,index:number,answer:string,code:string,language:string,diagram:string|null,audioPath:string|null) {
  const staged=audioPath?await stageAudio(audioPath):null;
  let retained=false;
  try {
    const payloadHash=hash({index,answer,code,language,diagram,audioHash:staged?.hash || null});
    const latest=(await query("SELECT * FROM durable_operations WHERE session_id=$1 AND question_index=$2 AND operation_type='evaluate' AND runtime_version=$3 ORDER BY created_at DESC LIMIT 1",[session._id,index,RUNTIME])).rows[0];
    if(latest && latest.payload_hash===payloadHash)return publicOperation(latest);
    const question=session.questions[index];
    if(session.status!=="in-progress" || session.runtimeState!=="active")throw new SessionStateError("Interview is no longer accepting answers");
    if(question.isEvaluated || question.isSubmitted || (latest && latest.status!=="terminal_failed"))throw new SessionStateError("This answer is already claimed. Retry its operation instead.");
    if(await hasUnfinishedWork(session._id))throw new SessionStateError("Wait for the current operation, or retry/cancel it before another answer.");
    const parent=question.followUpOf===undefined?question:session.questions[question.followUpOf];
    if(!parent?.planItemId || !parent.questionVersionId)throw new SessionStateError("Pinned question unavailable");
    const next=(await query("SELECT coalesce(max(attempt),0)+1 AS n FROM answer_attempts WHERE plan_item_id=$1",[parent.planItemId])).rows[0].n;
    const attempt=await knowledgeRepository.createAnswerAttempt(session.user,{planItemId:parent.planItemId,attempt:next,
      inputKind:staged?"audio":code?(answer?"mixed":"code"):diagram?"mixed":"text",text:answer,code,contentHash:payloadHash,
      artifactRefs:[...(diagram?[{kind:"diagram",url:diagram}]:[]),...(staged?[{kind:"audio",mediaId:staged.id}]:[])]});
    await query("UPDATE answer_attempts SET follow_up_index=$2,runtime_extracted=$3,extracted_text=$4 WHERE id=$1",[attempt,question.followUpOf===undefined?null:index,!staged,staged?null:answer]);
    if(staged)await query("INSERT INTO staged_interview_media(id,session_id,user_id,answer_attempt_id,filename,content_hash,size_bytes,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,now()+interval '24 hours')",[staged.id,session._id,session.user,attempt,staged.filename,staged.hash,staged.size]);
    if(question.questionType==="coding")question.language=language;
    question.isSubmitted=true;delete question.processingError;question.processingState="received";
    await sessionRepository.save(session);await bumpRevision(session);
    const op=await insertOperation(session,"evaluate",`answer:${index}:${attempt}`,{index},payloadHash,attempt,parent.planItemId,index);
    session.questions[index].operationId=op.id;await sessionRepository.save(session);
    retained=true;
    return publicOperation(op);
  } finally {
    if(staged && !retained)await removeStagedAudio(staged.filename).catch(()=>{});
  }
}

/** No provider or Redis calls in this transaction. Report work owns the finishing state. */
export async function requestFinish(session:ISession) {
  if(session.status==="completed" || session.runtimeState==="finishing")return session;
  if(session.status!=="in-progress")throw new SessionStateError("Only an active interview can be finished");
  if(await hasUnfinishedWork(session._id) || session.questions.some(q=>q.followUpPending || (q.isSubmitted && !q.isEvaluated)))
    throw new SessionStateError("Finish requires all accepted answers and probes to complete or be explicitly cancelled.");
  await bumpRevision(session,"finishing");
  const evaluationIds=session.questions.map(q=>q.evaluation?.id || null);
  await insertOperation(session,"report","finish",{snapshotRevision:session.revision,evaluationIds},hash({revision:session.revision,evaluationIds}));
  return session;
}

export async function retryOperation(sessionId:string,userId:string,id:string) {
  return withSessionLock(sessionId,async()=>{
    const session=await sessionRepository.findByIdForUser(sessionId,userId);
    const op=(await query("SELECT * FROM durable_operations WHERE id=$1 AND session_id=$2 AND user_id=$3 AND runtime_version=$4",[id,sessionId,userId,RUNTIME])).rows[0];
    if(!session || !op)throw new SessionStateError("Operation not found",404);
    if(["queued","running"].includes(op.status))return publicOperation(op);
    if(op.status!=="retryable_failed" || op.next_retry_at || session.status!=="in-progress" ||
      (op.operation_type==="report"?session.runtimeState!=="finishing":session.runtimeState!=="active"))throw new SessionStateError("Operation is not available for manual retry");
    if(Number(op.session_revision)!==session.revision)throw new SessionStateError("This operation was superseded");
    await bumpRevision(session);
    if(op.operation_type==="evaluate") {const q=session.questions[op.question_index];q.isSubmitted=true;q.processingState="received";delete q.processingError;await sessionRepository.save(session);}
    const fresh=(await query("UPDATE durable_operations SET status='queued',attempts=0,manual_retries=manual_retries+1,session_revision=$2,deadline=now()+interval '10 minutes',error_code=NULL,updated_at=now() WHERE id=$1 RETURNING *",[id,session.revision])).rows[0];
    await query("UPDATE transactional_outbox SET status='pending',published_at=NULL,updated_at=now() WHERE operation_id=$1",[id]);
    return publicOperation(fresh);
  });
}
export async function cancelOperation(sessionId:string,userId:string,id:string) {
  const result=await withSessionLock(sessionId,async()=>{
    const session=await sessionRepository.findByIdForUser(sessionId,userId);
    const op=(await query("SELECT * FROM durable_operations WHERE id=$1 AND session_id=$2 AND user_id=$3 AND runtime_version=$4",[id,sessionId,userId,RUNTIME])).rows[0];
    if(!session || !op)throw new SessionStateError("Operation not found",404);
    if(op.operation_type==="report")throw new SessionStateError("Retry report generation to finish this interview");
    if(["succeeded","terminal_failed"].includes(op.status))return {view:publicOperation(op),filenames:[] as string[]};
    await query("UPDATE durable_operations SET status='terminal_failed',error_code='cancelled_by_user',lease_owner=NULL,lease_token=NULL,lease_expires_at=NULL,next_retry_at=NULL,updated_at=now() WHERE id=$1",[id]);
    await query("UPDATE transactional_outbox SET status='failed',updated_at=now() WHERE operation_id=$1",[id]);
    if(op.answer_attempt_id)await query("UPDATE answer_attempts SET status='failed',updated_at=now() WHERE id=$1 AND status IN ('received','transcribing','evaluating','failed')",[op.answer_attempt_id]);
    const question=session.questions[op.question_index];
    if(op.operation_type==="evaluate"){question.isSubmitted=false;question.processingState="cancelled";delete question.processingError;}
    else if(question){question.followUpPending=false;}
    await sessionRepository.save(session);await bumpRevision(session);
    const media=(await query("DELETE FROM staged_interview_media WHERE answer_attempt_id=$1 RETURNING filename",[op.answer_attempt_id])).rows;
    return {view:publicOperation({...op,status:"terminal_failed",error_code:"cancelled_by_user",next_retry_at:null}),filenames:media.map(m=>m.filename as string)};
  });
  await Promise.all(result.filenames.map(filename=>removeStagedAudio(filename).catch(()=>{})));return result.view;
}

export async function deleteRuntimeSession(sessionId:string,userId:string) {
  const filenames=await withDatabaseLock("ingestion:editorial:v1",()=>withSessionLock(sessionId,async()=>{
    if(!await sessionRepository.findByIdForUser(sessionId,userId))throw new SessionStateError("Session not found",404);
    const media=(await query("SELECT filename FROM staged_interview_media WHERE session_id=$1 AND user_id=$2",[sessionId,userId])).rows;
    // Cascading FK removal invalidates every worker fence and deletes owned private artifacts.
    const session=await sessionRepository.findByIdForUser(sessionId,userId);
    await sessionRepository.delete(session!);return media.map(m=>m.filename as string);
  }));
  await Promise.all(filenames.map(filename=>removeStagedAudio(filename).catch(()=>{})));
}
