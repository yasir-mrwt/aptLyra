import {createHash,randomUUID} from "node:crypto";
import {query,withDatabaseLock} from "../config/db.js";
import {knowledgeRepository} from "../repositories/knowledgeRepository.js";
import {POLICY,WEIGHTS,EvaluationError,type Rubric} from "./contracts.js";
export const canonical=(value:any):string=>Array.isArray(value)?`[${value.map(canonical).join(',')}]`:value && typeof value==="object"?`{${Object.keys(value).sort().map(k=>`${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`:JSON.stringify(value);
export const hash=(value:any)=>createHash("sha256").update(canonical(value)).digest("hex");
export interface Draft {questionVersionId:string; concepts:{key:string;label:string;description:string;importance:number;required:boolean;sourceIds:string[]}[]}
export function validateDraft(value:any):Draft {
  const fail=():never=>{throw new EvaluationError("invalid_rubric_draft");};
  if(!value || Object.keys(value).sort().join()!==["concepts","questionVersionId"].sort().join() || !/^[0-9a-f-]{36}$/i.test(value.questionVersionId) || !Array.isArray(value.concepts) || !value.concepts.length || value.concepts.length>20)fail();
  const keys=new Set();for(const c of value.concepts){if(!c || Object.keys(c).sort().join()!==["key","label","description","importance","required","sourceIds"].sort().join() || typeof c.key!=="string" || !/^[a-z0-9-]{1,100}$/.test(c.key) || keys.has(c.key))fail();keys.add(c.key);
    for(const [k,max] of [["label",500],["description",4000]] as const)if(typeof c[k]!=="string" || !c[k].trim() || c[k].length>max)fail();
    if(typeof c.importance!=="number" || !Number.isFinite(c.importance) || c.importance<=0 || c.importance>100 || typeof c.required!=="boolean" || !Array.isArray(c.sourceIds) || c.sourceIds.length>10 || new Set(c.sourceIds).size!==c.sourceIds.length || c.sourceIds.some((id:any)=>typeof id!=="string" || !/^[0-9a-f-]{36}$/i.test(id)))fail();
  }return value;
}
const anchors={0:"Absent/incorrect",1:"Major gaps",2:"Partially sound",3:"Mostly correct",4:"Correct and justified"};
export const rubricEditor={
  async createDraft(value:unknown){const d=validateDraft(value);const id=randomUUID();await query("INSERT INTO rubric_drafts(id,question_version_id,content,content_hash) VALUES($1,$2,$3,$4)",[id,d.questionVersionId,JSON.stringify(d),hash(d)]);return {id,hash:hash(d)};},
  async inspect(id:string){const d=(await query("SELECT * FROM rubric_drafts WHERE id=$1",[id])).rows[0];if(!d)throw new EvaluationError("draft_not_found");return d;},
  async publish(id:string,exactHash:string,reviewer?:string){return withDatabaseLock("ingestion:editorial:v1",async()=>{
    const draft=await this.inspect(id);if(draft.content_hash!==exactHash || hash(draft.content)!==exactHash)throw new EvaluationError("rubric_hash_mismatch");const d=validateDraft(draft.content);
    const q=(await query("SELECT * FROM question_versions WHERE id=$1 AND status='published'",[d.questionVersionId])).rows[0];if(!q)throw new EvaluationError("question_unavailable");
    const ids=[...new Set(d.concepts.flatMap(c=>c.sourceIds))];
    if(ids.length>10)throw new EvaluationError("rubric_reference_limit");
    if(d.concepts.some(c=>!c.sourceIds.length))throw new EvaluationError("approved_reference_required");
    const available=(await query("SELECT entity_id FROM retrieval_entities WHERE purpose='technical-grounding' AND entity_id=ANY($1::uuid[])",[ids])).rows;
    if(available.length!==ids.length)throw new EvaluationError("reference_unavailable");
    if(reviewer && !(await query("SELECT id FROM ingestion_reviewers WHERE id=$1 AND enabled AND kind='human'",[reviewer])).rows.length)throw new EvaluationError("human_reviewer_required");
    // Publication/promotion appends to the family's policy lineage, never resets it.
    const existing=(await query(`SELECT r.id FROM rubrics r JOIN rubric_versions v ON v.rubric_id=r.id
      WHERE r.question_id=$1 AND v.scoring_policy_version=$2 ORDER BY r.created_at,r.id LIMIT 1`,[q.question_id,POLICY])).rows[0];
    const rubricId=existing?.id || await knowledgeRepository.createRubric(q.question_id);
    const next=(await query("SELECT coalesce(max(version),0)+1 AS n FROM rubric_versions WHERE rubric_id=$1",[rubricId])).rows[0].n;
    const version=await knowledgeRepository.createRubricVersion({rubricId,questionVersionId:q.id,version:next,kind:reviewer?"known":"provisional",scoringPolicyVersion:POLICY,contentHash:exactHash,draftId:id,
      reviewedBy:reviewer,reviewedAt:reviewer?new Date().toISOString():undefined,
      dimensions:[...Object.entries(WEIGHTS).map(([dimension,weight])=>({dimension:dimension as keyof typeof WEIGHTS,aggregation:"technical" as const,applicable:true,weight,anchors})),{dimension:"communication-clarity",aggregation:"delivery",applicable:true,weight:0,anchors}],
      concepts:d.concepts.map(c=>({key:c.key,label:c.label,description:c.description,importance:c.importance,essential:c.required,referenceChunkIds:c.sourceIds}))});
    if(reviewer)await query("INSERT INTO rubric_review_approvals(rubric_version_id,draft_id,content_hash,reviewer_id) VALUES($1,$2,$3,$4)",[version,id,exactHash,reviewer]);
    return version;
  });},
  async load(questionVersionId:string,pinnedId?:string):Promise<Rubric|null>{
    const r=(await query(`SELECT v.* FROM rubric_versions v WHERE v.question_version_id=$1 AND v.scoring_policy_version=$2 AND v.status IN ('reviewed','provisional')
      AND ($3::uuid IS NULL OR v.id=$3) AND (v.kind='provisional' OR EXISTS(SELECT 1 FROM rubric_review_approvals a WHERE a.rubric_version_id=v.id AND a.content_hash=v.content_hash))
      ORDER BY (v.kind='known') DESC,v.version DESC,v.created_at DESC,v.id LIMIT 1`,[questionVersionId,POLICY,pinnedId || null])).rows[0];if(!r)return null;
    const concepts=(await query(`SELECT c.*,coalesce(array_agg(cr.chunk_id) FILTER(WHERE cr.chunk_id IS NOT NULL),'{}') AS sources FROM expected_concepts c LEFT JOIN concept_references cr ON cr.concept_id=c.id WHERE c.rubric_version_id=$1 GROUP BY c.id ORDER BY c.stable_key`,[r.id])).rows;
    const ids=[...new Set(concepts.flatMap(c=>c.sources))];const references=(await query("SELECT entity_id AS id,text FROM retrieval_entities WHERE purpose='technical-grounding' AND entity_id=ANY($1::uuid[]) ORDER BY entity_id",[ids])).rows;
    if(!concepts.length || concepts.some(c=>!c.sources.length) || references.length!==ids.length)return null;
    return {id:r.id,kind:r.kind,questionVersionId,hash:r.content_hash,concepts:concepts.map(c=>({id:c.id,key:c.stable_key,label:c.label,description:c.description,importance:Number(c.importance_weight),required:c.essential,sources:c.sources})),references:references.map(r=>({id:r.id,text:r.text.slice(0,6000)}))};
  }
};
