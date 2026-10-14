import {query,withDatabaseLock} from "../config/db.js";
import {SessionStateError} from "../services/sessionService.js";
export async function activateInterview(sessionId:string,userId:string) {
  return withDatabaseLock(`session:${sessionId}`,async()=>{
    const row=(await query(`SELECT s.status,s.activation_required,s.activated_at,s.start_time,p.effective_minutes
      FROM sessions s LEFT JOIN interview_plans p ON p.id=s.interview_plan_id
      WHERE s.id=$1 AND s.user_id=$2`,[sessionId,userId])).rows[0];
    if(!row)throw new SessionStateError("Session not found",404);
    if(row.status!=="in-progress")throw new SessionStateError("Only a confirmed interview can be activated");
    let start=row.activated_at||row.start_time;
    if(row.activation_required && !row.activated_at){
      start=(await query("UPDATE sessions SET activated_at=clock_timestamp(),start_time=clock_timestamp(),updated_at=now() WHERE id=$1 RETURNING activated_at",[sessionId])).rows[0].activated_at;
    }
    return {activatedAt:new Date(start).toISOString(),deadline:row.effective_minutes?new Date(new Date(start).getTime()+Number(row.effective_minutes)*60000).toISOString():null};
  });
}
