import { performance } from "node:perf_hooks";
import { query, withDatabaseLock } from "../config/db.js";
import { sessionRepository, type IQuestion } from "../models/Session.js";
import { knowledgeRepository } from "../repositories/knowledgeRepository.js";
import { RetrievalService } from "../retrieval/service.js";
import { MODEL, type RetrievalRequest, type RetrievalResponse } from "../retrieval/contracts.js";
import { allocate } from "./allocate.js";
import { adjacent, categories, estimateMinutes, CONTRACT_VERSION, PLANNER_VERSION, PlannerError, validateSetup,
  type Candidate, type Setup, type SelectionReason } from "./contracts.js";

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Unchanged questions covered by the exact Phase 4 human approval, never new generated text.
const templates: Record<string,string[]>={dsa:["dsa.structures-1","dsa.structures-2","dsa.search-sort-1"],
  oop:["oop.encapsulation-1"],"dbms-sql":["dbms-sql.modeling-1","dbms-sql.queries-1"],os:["os.process-thread-1"],
  networks:["networks.transport-1"],"backend-web":["backend-web.api-contracts-1"],
  "design-lite":["design-lite.requirements-1","design-lite.requirements-2"],programming:["programming.control-data-1","programming.error-handling-1"]};
interface Retriever { retrieveQuestions(request: RetrievalRequest): Promise<RetrievalResponse> }

async function generation(expected?: string) {
  const g=(await query("SELECT * FROM embedding_generations WHERE status='active'")).rows[0];
  if(!g)throw new PlannerError("corpus_unavailable",503);
  if(expected && g.id!==expected)throw new PlannerError("stale_corpus",409);
  if(g.model_id!==MODEL.modelId || g.model_revision!==MODEL.modelRevision || g.dimension!==MODEL.dimension
    || g.normalization!==MODEL.normalization || g.embedding_version!==MODEL.embeddingVersion)throw new PlannerError("model_mismatch",503);
  const missing=(await query(`SELECT EXISTS(SELECT 1 FROM retrieval_entities e WHERE e.purpose='question-selection' AND NOT EXISTS
    (SELECT 1 FROM embedding_metadata m JOIN embedding_vectors v ON v.metadata_id=m.id
      WHERE m.question_version_id=e.entity_id AND m.purpose=e.purpose AND m.content_hash=e.content_hash
        AND m.status='active' AND m.corpus_generation=$1)) AS missing`,[g.id])).rows[0].missing;
  if(missing)throw new PlannerError("corpus_unavailable",503);
  return g.id as string;
}
async function availableItems(planId: string, corpus: string) {
  const rows=(await query(`SELECT i.id,e.*,v.duplicate_group FROM plan_items i JOIN retrieval_entities e ON e.entity_id=i.question_version_id AND e.purpose='question-selection'
    AND i.provenance_refs @> e.provenance AND e.provenance @> i.provenance_refs
    JOIN embedding_metadata m ON m.question_version_id=e.entity_id AND m.status='active' AND m.corpus_generation=$2 AND m.content_hash=e.content_hash
    JOIN embedding_vectors v ON v.metadata_id=m.id WHERE i.plan_id=$1 ORDER BY i.position`,[planId,corpus])).rows;
  return rows;
}
export class PlannerService {
  constructor(private retriever: Retriever=new RetrievalService()) {}
  async preview(userId: string, value: unknown) {
    const setup=validateSetup(value), corpus=await generation(), started=performance.now();
    const active=(await query("SELECT id FROM competencies WHERE taxonomy_version=$1 AND kind='root' AND status='active'",[setup.taxonomyVersion])).rows;
    if(setup.competencies.some(c=>!active.some(r=>r.id===c)))throw new PlannerError("taxonomy_unavailable",409);
    const session=await sessionRepository.create({user:userId,role:setup.role,level:"Junior",interviewType:setup.mode==="oral"?"oral-only":"coding-mix",company:setup.modifiers.company});
    try {
      const candidates: Candidate[]=[],operations:string[]=[],failures:string[]=[];
      for(const root of setup.competencies) {
        const stages: { reason: SelectionReason; difficulties?: Setup["difficulty"][]; seed?: boolean; template?: boolean }[]=[
          {reason:"filtered_retrieval",difficulties:[setup.difficulty]},
          {reason:"adjacent_difficulty",difficulties:[adjacent(setup.difficulty)]},
          {reason:"reviewed_seed",seed:true},{reason:"approved_template",seed:true,template:true}];
        for(const stage of stages) {
          if(performance.now()-started>45000)throw new PlannerError("planning_timeout",503);
          const response=await this.retriever.retrieveQuestions({query:`Junior ${root} technical practice`,limit:5,candidatePool:20,
            expectedCorpusGeneration:corpus,expectedModelRevision:MODEL.modelRevision,ownership:{userId,sessionId:session._id},
            strategy:stage.template?"structured-seed":"semantic",
            filters:{taxonomyVersion:setup.taxonomyVersion,competencies:[root],role:setup.role,categories:categories(setup),
              difficulties:stage.difficulties,alreadySelectedIds:candidates.map(c=>c.hit.questionVersionId!),
              company:setup.modifiers.company,occurredAfter:setup.modifiers.occurredAfter,occurredBefore:setup.modifiers.occurredBefore,
              reviewedSeed:stage.seed?true:undefined,documentKeys:stage.template?templates[root]:undefined}});
          operations.push(response.operationId);
          if(response.corpusGeneration!==corpus || ["corpus_unavailable","model_mismatch","invalid_filters"].includes(response.outcome))
            throw new PlannerError("stale_retrieval",409);
          if(response.outcome==="unavailable")failures.push("retrieval_unavailable:"+stage.reason);
          const hits=response.hits.filter(hit=>hit.questionVersionId && hit.competency?.split('.')[0]===root && hit.provenanceAvailable && hit.provenance.length);
          const rows=hits.length?(await query(`SELECT m.question_version_id,v.duplicate_group FROM embedding_metadata m JOIN embedding_vectors v ON v.metadata_id=m.id
            WHERE m.question_version_id=ANY($1::uuid[]) AND m.purpose='question-selection' AND m.status='active' AND m.corpus_generation=$2`,[hits.map(h=>h.questionVersionId),corpus])).rows:[];
          const groups=new Map<string,string>(rows.map(row=>[row.question_version_id,row.duplicate_group]));
          for(const hit of hits) {
            const group=groups.get(hit.questionVersionId!);
            if(!group)throw new PlannerError("stale_retrieval",409);
            if(!candidates.some(c=>c.hit.questionVersionId===hit.questionVersionId))candidates.push({hit,root,group,reason:stage.reason,minutes:estimateMinutes(hit.category!)});
          }
        }
      }
      const allocation=allocate(setup,candidates);
      allocation.shortages.push(...new Set(failures));
      const planId=await withDatabaseLock("ingestion:editorial:v1",()=>withDatabaseLock(`session:${session._id}`,async()=>{
        if(await generation()!==corpus)throw new PlannerError("stale_corpus",409);
        const planId=await knowledgeRepository.createPlan(userId,{sessionId:session._id,contractVersion:CONTRACT_VERSION,plannerVersion:PLANNER_VERSION,
          taxonomyVersion:setup.taxonomyVersion,corpusVersion:corpus,role:setup.role,mode:setup.mode,requestedCount:setup.count,effectiveCount:allocation.items.length,
          requestedMinutes:setup.minutes,effectiveMinutes:allocation.timeBudget.totalMinutes,selectedCompetencies:setup.competencies,
          difficultyDistribution:allocation.difficultyDistribution,modifiers:setup.modifiers,coverage:allocation.coverage,timeBudget:allocation.timeBudget,shortages:allocation.shortages});
        await query("UPDATE interview_plans SET setup_snapshot=$2 WHERE id=$1",[planId,JSON.stringify(setup)]);
        for(let position=0;position<allocation.items.length;position++) {
          const c=allocation.items[position];
          const id=await knowledgeRepository.addPlanItem(userId,{planId,position,questionVersionId:c.hit.questionVersionId!,retrievalId:c.hit.retrievalOperationId,
            selectionReason:c.reason,estimatedMinutes:c.minutes,provenanceRefs:c.hit.provenance});
          void id;
        }
        await query("UPDATE retrieval_evidence SET plan_id=$1 WHERE id=ANY($2::uuid[]) AND user_id=$3 AND session_id=$4",[planId,operations,userId,session._id]);
        const eligible=await availableItems(planId,corpus);
        if(eligible.length!==allocation.items.length || new Set(eligible.map(e=>e.duplicate_group)).size!==eligible.length)throw new PlannerError("stale_retrieval",409);
        await query("UPDATE interview_plans SET status=$2 WHERE id=$1",[planId,allocation.canConfirm?"ready":"failed"]);
        await query("UPDATE sessions SET interview_plan_id=$2,status=$3 WHERE id=$1 AND user_id=$4",[session._id,planId,allocation.canConfirm?"pending":"cancelled",userId]);
        return planId;
      }));
      return this.get(userId,planId);
    } catch(error) {
      await withDatabaseLock(`session:${session._id}`,async()=>{
        const fresh=await sessionRepository.findByIdForUser(session._id,userId);
        if(fresh?.status==="pending" && !fresh.planId){fresh.status="failed";await sessionRepository.save(fresh);}
      });
      if(error instanceof PlannerError)throw error;
      const failure=new PlannerError("planner_unavailable",503);
      Object.defineProperty(failure,"cause",{value:error});throw failure;
    }
  }
  async get(userId: string, id: string) {
    if(!uuid.test(id))throw new PlannerError("plan_not_found",404);
    const p=(await query("SELECT * FROM interview_plans WHERE id=$1 AND user_id=$2 AND contract_version=$3",[id,userId,CONTRACT_VERSION])).rows[0];
    if(!p)throw new PlannerError("plan_not_found",404);
    const items=(await query(`SELECT i.*,q.question_id,q.status AS question_status FROM plan_items i JOIN question_versions q ON q.id=i.question_version_id WHERE i.plan_id=$1 ORDER BY i.position`,[id])).rows;
    const available=(await query("SELECT entity_id FROM retrieval_entities WHERE entity_id=ANY($1::uuid[]) AND purpose='question-selection'",[items.map(i=>i.question_version_id)])).rows;
    const stale=available.length!==items.length || (p.status==="ready" &&
      (await generation().catch(()=>null)!==p.corpus_version || (await availableItems(id,p.corpus_version)).length!==items.length));
    return {id:p.id,sessionId:p.session_id,contractVersion:p.contract_version,plannerVersion:p.planner_version,taxonomyVersion:p.taxonomy_version,
      corpusGeneration:p.corpus_version,role:p.role,level:p.level,mode:p.mode,setup:p.setup_snapshot,revision:p.revision,status:p.status,
      requestedCount:p.requested_count,effectiveCount:p.effective_count,requestedMinutes:Number(p.requested_minutes),effectiveMinutes:Number(p.effective_minutes),
      coverage:p.coverage,difficultyDistribution:p.difficulty_distribution,timeBudget:p.time_budget,
      shortages:[...p.shortages,...(stale?["plan_stale_preview_again"]:[])],canConfirm:p.status==="ready" && !stale,
      confirmedAt:p.confirmed_at,modifierAvailability:{company:"requires_permitted_dated_reports",resume:"unavailable",jd:"unavailable",designLite:"mixed_only"},
      evaluationMode:"legacy",items:items.map(i=>({id:i.id,position:i.position,questionVersionId:i.question_version_id,retrievalId:i.retrieval_id,
        competency:i.primary_competency,category:i.category,difficulty:i.difficulty,origin:i.origin,selectionReason:i.selection_reason,
        estimatedMinutes:Number(i.estimated_minutes),available:available.some(e=>e.entity_id===i.question_version_id),
        provenance:available.some(e=>e.entity_id===i.question_version_id)?i.provenance_refs:[]}))};
  }
  async confirm(userId: string, value: unknown) {
    if(!value || typeof value!=="object" || Array.isArray(value))throw new PlannerError("invalid_confirmation");
    const body=value as Record<string,unknown>;
    if(Object.keys(body).some(k=>!["planId","revision"].includes(k)) || typeof body.planId!=="string" || !uuid.test(body.planId)
      || typeof body.revision!=="number" || !Number.isInteger(body.revision))throw new PlannerError("invalid_confirmation");
    const id=body.planId;
    const result=await withDatabaseLock("ingestion:editorial:v1",async()=>{
      const p=(await query("SELECT * FROM interview_plans WHERE id=$1 AND user_id=$2 AND contract_version=$3",[id,userId,CONTRACT_VERSION])).rows[0];
      if(!p)throw new PlannerError("plan_not_found",404);
      return withDatabaseLock(`session:${p.session_id}`,async()=>{
        const session=await sessionRepository.findByIdForUser(p.session_id,userId);
        if(!session || session.planId!==id)throw new PlannerError("plan_not_found",404);
        if(p.confirmed_at) {
          if(body.revision!==p.revision && body.revision!==p.revision-1)throw new PlannerError("stale_revision",409);
          return {sessionId:p.session_id,planId:id,revision:p.revision,status:"confirmed"};
        }
        if(p.status!=="ready" || p.revision!==body.revision || session.status!=="pending")throw new PlannerError("plan_not_ready",409);
        await generation(p.corpus_version);
        const rows=await availableItems(id,p.corpus_version);
        if(rows.length!==p.effective_count || new Set(rows.map(r=>r.duplicate_group)).size!==rows.length)throw new PlannerError("stale_retrieval",409);
        session.questions=rows.map(r=>({planItemId:r.id,questionVersionId:r.entity_id,category:r.category,
          questionText:r.text,questionType:r.category==="coding" || r.category==="sql"?"coding":r.category==="system-design-lite"?"system-design":"oral",
          idealAnswer:"",language:r.category==="sql"?"sql":p.setup_snapshot.codeLanguage,isSubmitted:false,isEvaluated:false} as IQuestion));
        session.status="in-progress";session.startTime=new Date().toISOString();await sessionRepository.save(session);
        await query("UPDATE interview_plans SET status='active',revision=revision+1,confirmed_at=now() WHERE id=$1",[id]);
        return {sessionId:p.session_id,planId:id,revision:p.revision+1,status:"confirmed"};
      });
    });
    return result;
  }
}
export const plannerService=new PlannerService();
