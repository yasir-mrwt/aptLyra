import {createHash} from 'node:crypto';
import type {IQuestion} from '../models/Session.js';

export const leaderboardPolicy = 'Exact question/rubric versions, role and coding language define each comparison group. At least 3 original questions, all reviewed, scored and non-low-confidence. Latest completed interview per participant per group; mean of original scores rounded to one decimal. Equal means share competition rank. Participation is opt-in with a public alias; no professional certification.';
export type LeaderboardRecord = {userId:string;name:string;sessionId:string;completedAt:string;role:string;questions:IQuestion[]};
export function buildPracticeLeaderboard(records:LeaderboardRecord[],viewer:string) {
  const groups = new Map<string,{label:string;members:Map<string,{name:string;mean:number;completedAt:string;sessionId:string;self:boolean}>}>();
  for (const record of [...records].sort((a,b)=>b.completedAt.localeCompare(a.completedAt)||b.sessionId.localeCompare(a.sessionId))) {
    const originals=record.questions.filter(q=>q.followUpOf===undefined);
    if(originals.length<3 || originals.some(q=>!q.questionVersionId || !q.isEvaluated || q.evaluation?.rubricStatus!=='reviewed' || q.evaluation.status!=='scored' || q.evaluation.evaluatorConfidence==='low' || !q.evaluation.rubricVersionId || typeof q.evaluation.technicalScore!=='number' || !Number.isFinite(q.evaluation.technicalScore) || q.evaluation.technicalScore<0 || q.evaluation.technicalScore>100)) continue;
    const versions=originals.map(q=>[q.questionVersionId,q.evaluation!.rubricVersionId,q.evaluation!.scoringVersion,q.evaluation!.promptVersion,q.evaluation!.modelVersion,q.language||'oral'].join(':')).sort();
    if(new Set(originals.map(q=>q.questionVersionId)).size!==originals.length)continue;
    const id=createHash('sha256').update(JSON.stringify([record.role,versions])).digest('hex').slice(0,16);
    const group=groups.get(id)||{label:`${record.role} · ${originals.length} reviewed questions`,members:new Map()};
    if(!group.members.has(record.userId))group.members.set(record.userId,{name:record.name,mean:Math.round(originals.reduce((sum,q)=>sum+q.evaluation!.technicalScore!,0)/originals.length*10)/10,completedAt:record.completedAt,sessionId:record.sessionId,self:record.userId===viewer});
    groups.set(id,group);
  }
  return [...groups].map(([id,group])=>{
    const sorted=[...group.members.values()].sort((a,b)=>b.mean-a.mean||a.name.localeCompare(b.name)||a.sessionId.localeCompare(b.sessionId));
    let rank=0;
    return {id,label:group.label,participants:sorted.length,entries:sorted.map((entry,index)=>{if(index===0||entry.mean!==sorted[index-1].mean)rank=index+1;return {rank,name:entry.name,mean:entry.mean,self:entry.self};})};
  }).sort((a,b)=>a.id.localeCompare(b.id));
}
export async function practiceLeaderboard(userId:string) {
  const {query}=await import("../config/db.js");
  const [preferences,results]=await Promise.all([
    query('SELECT opted_in,display_name FROM practice_leaderboard_preferences WHERE user_id=$1',[userId]),
    query(`SELECT r.user_id,r.session_id,r.questions,r.created_at,s.role,p.display_name FROM interview_reports r
      JOIN sessions s ON s.id=r.session_id AND s.user_id=r.user_id
      JOIN practice_leaderboard_preferences p ON p.user_id=r.user_id AND p.opted_in=true
      WHERE s.status='completed' AND r.scoring_version='rubric-v1'`)
  ]);
  const groups=buildPracticeLeaderboard(results.rows.map(r=>({userId:r.user_id,sessionId:r.session_id,name:r.display_name,role:r.role,questions:r.questions,completedAt:new Date(r.created_at).toISOString()})),userId);
  const preference=preferences.rows[0];
  return {policy:leaderboardPolicy,preference:{optedIn:preference?.opted_in===true,displayName:preference?.display_name||''},groups,
    reason:!preference?.opted_in?'You are not participating. Choose a public alias and opt in to appear.':groups.some(g=>g.entries.some(e=>e.self))?null:'No qualifying completed interview yet. All 3 or more original questions must have reviewed scores with sufficient evaluator confidence.'};
}
