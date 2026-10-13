import { createHash, randomInt } from "node:crypto";
import { query } from "../config/db.js";
import type { Candidate, RepeatPolicy } from "./contracts.js";

const textKey=(text:string)=>"text:"+createHash("sha256").update(text.normalize("NFKC").trim().replace(/\s+/g," ").toLowerCase()).digest("hex");
export function identityKeys(value:{questionId?:string|null;familyKey?:string|null;text?:string;group?:string|null}) {
  return [...(value.questionId?[`question:${value.questionId}`]:[]),...(value.familyKey?[`family:${value.familyKey}`]:[]),
    ...(value.group?[`duplicate:${value.group}`]:[]),...(value.text?[textKey(value.text)]:[])];
}
export interface Exposure { keys:string[]; assignment:string; at:number; weakness:number }
/** Retained confirmed assignments only; previews never consume history. Deleted history is not retained separately. */
export async function selectionHistory(userId:string):Promise<Exposure[]> {
  const rows=(await query(`SELECT p.id AS assignment,p.confirmed_at,i.position,q.question_id,f.family_key,q.question_text,
    p.setup_snapshot->'selection'->'items'->(i.position::text)->'keys' AS pinned_keys,
    array_remove(array_agg(DISTINCT v.duplicate_group),NULL) AS groups,
    (SELECT e.technical_score FROM answer_attempts a JOIN evaluations e ON e.answer_attempt_id=a.id
      JOIN rubric_versions rv ON rv.id=e.rubric_version_id
      WHERE a.session_id=p.session_id AND a.question_version_id=q.id AND a.user_id=$1
        AND e.status='succeeded' AND e.evaluator_confidence IN ('high','medium') AND rv.kind='known'
        AND EXISTS(SELECT 1 FROM rubric_review_approvals ra WHERE ra.rubric_version_id=rv.id AND ra.content_hash=rv.content_hash)
        AND NOT EXISTS(SELECT 1 FROM evaluations newer WHERE newer.answer_attempt_id=e.answer_attempt_id AND newer.revision>e.revision)
      ORDER BY a.created_at DESC,e.revision DESC LIMIT 1) AS reviewed_score
    FROM interview_plans p JOIN plan_items i ON i.plan_id=p.id JOIN question_versions q ON q.id=i.question_version_id
    JOIN interview_questions f ON f.id=q.question_id
    LEFT JOIN embedding_metadata m ON m.question_version_id=q.id AND m.purpose='question-selection'
    LEFT JOIN embedding_vectors v ON v.metadata_id=m.id
    WHERE p.user_id=$1 AND p.confirmed_at IS NOT NULL
    GROUP BY p.id,i.position,q.id,f.family_key`,[userId])).rows;
  const history:Exposure[]=rows.map(r=>({assignment:r.assignment,at:new Date(r.confirmed_at).getTime(),
    keys:[...identityKeys({questionId:r.question_id,familyKey:r.family_key,text:r.question_text}),...(r.groups as string[]).map(g=>`duplicate:${g}`),...(r.pinned_keys||[])],
    weakness:r.reviewed_score===null?0:Math.max(0,1-Number(r.reviewed_score)/100)}));
  // Pre-planner sessions have no canonical bank identity: match exact normalized text only, never topics.
  const legacy=(await query(`SELECT id,start_time,questions FROM sessions WHERE user_id=$1 AND interview_plan_id IS NULL AND status IN ('in-progress','completed')`,[userId])).rows;
  for(const row of legacy)for(const q of row.questions)if(q.questionText)history.push({assignment:row.id,at:new Date(row.start_time).getTime(),weakness:0,keys:[textKey(q.questionText)]});
  return history;
}
export function exposureFor(keys:string[],history:Exposure[]) {
  const matches=history.filter(h=>h.keys.some(k=>keys.includes(k)));
  const last=matches.reduce<Exposure|null>((best,h)=>!best || h.at>best.at?h:best,null);
  return {count:new Set(matches.map(h=>h.assignment)).size,lastAssigned:last?.at ?? 0,weakness:last?.weakness ?? 0};
}
export function weightCandidates(candidates:Candidate[],history:Exposure[],policy:RepeatPolicy,now=Date.now(),random=()=>randomInt(1,1_000_000)/1_000_000) {
  return candidates.map(c=>{
    const keys=identityKeys({questionId:c.hit.questionId,familyKey:c.hit.familyKey,text:c.hit.text,group:c.group});
    const exposure=exposureFor(keys,history),days=Math.max(0,(now-exposure.lastAssigned)/86400000);
    // Bounded jitter only breaks similarly weighted choices; fresh budget is enforced by allocator.
    const priority=policy==='revision'?(exposure.count?100+Math.min(90,days)*(1+exposure.weakness):0)+random()
      :exposure.count?-1000+Math.min(365,days)-Math.min(100,exposure.count)*2+random():random();
    return {...c,history:{keys,...exposure,priority}};
  });
}
export function selectionSnapshot(items:Candidate[],policy:RepeatPolicy) {
  const repeated=items.filter(c=>c.history?.count).length;
  return {algorithmVersion:"history-weighted-v1",policy,newCount:items.length-repeated,repeatedCount:repeated,historyWindow:"Retained confirmed sessions; deleting session history removes its repeat protection.",
    items:Object.fromEntries(items.map((c,i)=>[String(i),{keys:c.history?.keys||[],repeated:!!c.history?.count,
      reason:c.history?.count?(policy==='revision'?'revision_due':'fresh_fallback_repeat'):(policy==='revision'?'revision_fresh_fallback':'unseen')}]))};
}
