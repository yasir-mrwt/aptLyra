import type {Session,InterviewOperation} from "../types/session";
function operationMessage(op:InterviewOperation,session:Session) {
    const subject=op.type==="report"?"your report":op.type==="follow-up"?"a concept follow-up":"your saved answer";
    if(op.status==="terminal_failed")return op.errorCode==="cancelled_by_user"?"Processing was cancelled. You can continue or finish the interview.":op.type==="follow-up"?"Lyra could not prepare this follow-up. Your parent feedback is saved; you can continue or finish.":"Lyra could not process this answer. Edit your draft or record again; no score was saved.";
    if(op.retryAvailable)return `Lyra paused while preparing ${subject}. Retry the saved work or cancel it before continuing.`;
    if(op.nextRetryAt)return `Lyra is retrying ${subject} (${Math.min(op.attempts+1,op.maxAttempts)} of ${op.maxAttempts}).`;
    if(op.type==="evaluate" && op.questionIndex!==null && session.questions[op.questionIndex]?.processingState==="transcribing")return "Lyra is transcribing your saved recording.";
    if(op.status==="running" && op.type==="evaluate" && op.questionIndex!==null && session.questions[op.questionIndex]?.processingState==="evaluating")return "Lyra is evaluating your saved answer.";
    return op.status==="queued"?`Lyra is waiting to process ${subject}. Your progress is saved.`:`Lyra is preparing ${subject}. Your progress is saved.`;
}
export default function OperationStatusPanel({session,onAction,connection}:{session:Session;onAction:(id:string,action:"retry"|"cancel")=>Promise<void>;connection?:"connecting"|"connected"|"recovering"}) {
    const latest=new Map<string,InterviewOperation>();
    for(const op of session.operations || [])latest.set(`${op.type}:${op.questionIndex}`,op);
    const visible=[...latest.values()].filter(op=>op.status!=="succeeded" && !(op.status==="terminal_failed" && op.errorCode==="cancelled_by_user"));
    const recovering=connection && connection!=="connected" && session.runtimeVersion && session.status!=="completed";
    if(!visible.length && !recovering)return null;
    return <div className="mb-6 space-y-3">{recovering && <p role="status">Reconnecting to live updates. Saved progress is still refreshed from the server.</p>}{visible.map(op=><div key={op.id} className="glass-card rounded-xl p-4" role={op.retryAvailable || op.status==="terminal_failed"?"alert":"status"}>
        <p>{operationMessage(op,session)}</p>
        {op.retryAvailable && <div className="flex gap-3 mt-3">
            <button className="btn-primary" onClick={()=>{void onAction(op.id,"retry");}}>{op.type==="report"?"Retry report":"Retry saved work"}</button>
        </div>}
        {op.type!=="report" && ["queued","running","retryable_failed"].includes(op.status) && <button className="btn-secondary mt-3" onClick={()=>{void onAction(op.id,"cancel");}}>Cancel processing</button>}
    </div>)}</div>;
}
