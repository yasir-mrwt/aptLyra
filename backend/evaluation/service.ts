import {randomUUID} from "node:crypto";
import {query,withDatabaseLock} from "../config/db.js";
import {sessionRepository} from "../models/Session.js";
import {knowledgeRepository} from "../repositories/knowledgeRepository.js";
import {RetrievalService} from "../retrieval/service.js";
import {aiService} from "../services/aiService.js";
import {abstain,finalize,POLICY,type EvaluationView,type EvaluationInput,type Objective,type ProviderResult} from "./contracts.js";
import {rubricEditor,hash} from "./rubrics.js";
import type {Json,JsonObject} from "../types/knowledge.js";
export const unavailableObjective=():Objective=>({status:"unavailable",kind:"runtime",summary:"No matching execution evidence or reviewed tests available."});
export interface Prepared {attempt:string;input:EvaluationInput|null;objective:Objective}
export const evaluationService={
  async prepare(sessionId:string,userId:string,index:number,answer:string,code:string,diagram?:string|null,existingAttempt?:string):Promise<Prepared> {
    const session=await sessionRepository.findByIdForUser(sessionId,userId);const q=session?.questions[index];
    if(!session || !q || session.scoringVersion!==POLICY)throw new Error("Owned rubric session not found");
    const parent=q.followUpOf===undefined?q:session.questions[q.followUpOf];
    if(!parent?.planItemId || !parent.questionVersionId)throw new Error("Pinned plan item required");
    const item=(await query("SELECT * FROM plan_items WHERE id=$1 AND session_id=$2 AND user_id=$3",[parent.planItemId,sessionId,userId])).rows[0];
    if(!item || item.question_version_id!==parent.questionVersionId)throw new Error("Owned pinned question required");
    const existing=existingAttempt?await knowledgeRepository.findAnswerForUser(existingAttempt,userId):null;
    if(existingAttempt && (!existing || existing.session_id!==sessionId || existing.plan_item_id!==item.id || existing.privacy_status!=="present"))throw new Error("Stale answer");
    const pinned=!!existing?.runtime_prepared;
    const objective:Objective=pinned?existing!.grounding_snapshot.objective as Objective:code?(await this.objective(sessionId,index,code,q.language || "")):unavailableObjective();
    let rubric=pinned?(existing!.selected_rubric_id?await rubricEditor.load(parent.questionVersionId,existing!.selected_rubric_id):null):await rubricEditor.load(parent.questionVersionId,item.rubric_version_id || undefined);
    if(pinned && existing!.selected_rubric_id && !rubric)throw new Error("Rubric/reference withdrawn during evaluation");
    if(!pinned && !rubric && !item.rubric_version_id && q.followUpOf===undefined){
      const references=await new RetrievalService().retrieveTechnicalEvidence({query:q.questionText,limit:5,filters:{competencies:[item.primary_competency]},ownership:{sessionId,userId}});
      if(references.hits.length){const refs=references.hits.map(h=>({id:h.chunkId!,text:h.text.slice(0,6000)}));
        const generated=await aiService.draftRubric(q.questionText,refs) as {concepts:unknown[]};
        // Only the retrieved evidence supplied to this operation can ground its draft.
        const allowed=new Set(refs.map(r=>r.id));if(!Array.isArray(generated?.concepts) || generated.concepts.some((c:any)=>!Array.isArray(c.sourceIds) || c.sourceIds.some((id:string)=>!allowed.has(id))))throw new Error("Invalid draft grounding");
        const draft=await rubricEditor.createDraft({questionVersionId:parent.questionVersionId,concepts:generated.concepts});const id=await rubricEditor.publish(draft.id,draft.hash);rubric=await rubricEditor.load(parent.questionVersionId,id);
      }
    }
    const input:EvaluationInput|null=rubric?{question:q.questionText,questionVersionId:parent.questionVersionId,rubric,answer,code,objective,derived:q.followUpOf!==undefined,artifactUnavailable:!!diagram && !answer.trim()}:null;
    // Durable callers claim before STT and seal preparation in their lease-fenced transaction.
    if(existingAttempt)return {attempt:existingAttempt,input,objective};
    const attempt=await withDatabaseLock(`session:${sessionId}`,async()=>{
      const fresh=await sessionRepository.findByIdForUser(sessionId,userId);const current=fresh?.questions[index];
      if(!fresh || fresh.status!=="in-progress" || !current?.isSubmitted || current.isEvaluated)throw new Error("Stale answer");
      const next=(await query("SELECT coalesce(max(attempt),0)+1 AS n FROM answer_attempts WHERE plan_item_id=$1",[item.id])).rows[0].n;
      const id=await knowledgeRepository.createAnswerAttempt(userId,{planItemId:item.id,attempt:next,inputKind:code?(answer?"mixed":"code"):diagram?"mixed":"text",text:answer,code,contentHash:hash({answer,code,diagram:diagram || null}),artifactRefs:diagram?[{kind:"diagram",url:diagram}]:[]});
      await query("UPDATE answer_attempts SET status='evaluating',selected_rubric_id=$2,grounding_snapshot=$3,follow_up_index=$4 WHERE id=$1",[id,rubric?.id || null,JSON.stringify(input?{rubricHash:rubric!.hash,sourceIds:rubric!.references.map(r=>r.id)}:{}),q.followUpOf===undefined?null:index]);
      return id;
    });return {attempt,input,objective};
  },
  async compute(prepared:Prepared) {
    if(!prepared.input)return {view:abstain("rubric_or_grounding_unavailable",prepared.objective),provider:null};
    const provider=await aiService.evaluateRubric(prepared.input);return {view:finalize(prepared.input,provider),provider:provider as ProviderResult};
  },
  async commit(userId:string,attempt:string,view:EvaluationView,provider:ProviderResult|null,historical=false) {
    const answer=await knowledgeRepository.findAnswerForUser(attempt,userId);if(!answer || (!historical && answer.status!=="evaluating"))throw new Error("Answer attempt no longer active");
    // Called within the session transaction. Recheck withdrawal/retirement after provider latency.
    if(!(await query("SELECT entity_id FROM retrieval_entities WHERE purpose='question-selection' AND entity_id=$1",[answer.question_version_id])).rows.length)throw new Error("Question withdrawn during evaluation");
    if(view.rubricVersionId && !await rubricEditor.load(answer.question_version_id,view.rubricVersionId))throw new Error("Rubric/reference withdrawn during evaluation");
    const last=(await query("SELECT id,revision FROM evaluations WHERE answer_attempt_id=$1 ORDER BY revision DESC LIMIT 1",[attempt])).rows[0];
    const id=await knowledgeRepository.recordEvaluation(userId,{answerAttemptId:attempt,rubricVersionId:view.rubricVersionId,scoringPolicyVersion:POLICY,revision:last?last.revision+1:1,supersedesId:last?.id,status:view.status==="scored"?"succeeded":"abstained",technicalScore:view.technicalScore ?? undefined,evaluatorConfidence:view.evaluatorConfidence,
      rubricKindSnapshot:view.rubricStatus,feedback:view.feedback,conceptSummary:view.concepts as unknown as Json[],objectiveEvidence:view.objective as unknown as JsonObject,
      reasonCodes:view.reasons,dimensions:view.dimensions,delivery:{communication:view.communication},modelMetadata:{modelVersion:view.modelVersion},promptVersion:view.promptVersion,
      evidence:provider?.concepts.map(c=>({conceptId:c.id,answerStart:c.span?.artifact==="answer"?c.span.start:undefined,answerEnd:c.span?.artifact==="answer"?c.span.end:undefined,
        artifactOrTest:c.span?.artifact==="code"?{kind:"code",start:c.span.start,end:c.span.end}:{} as JsonObject,referenceChunkId:c.sourceIds[0],judgment:({satisfied:"satisfied",partial:"partial",missing:"absent",contradicted:"incorrect","not-applicable":"unobservable"} as const)[c.judgment],explanation:c.explanation,reasonCode:"concept-judgment"}))});
    if(!historical)await query("UPDATE answer_attempts SET status=$2,updated_at=now() WHERE id=$1",[attempt,view.status==="scored"?"evaluated":"abstained"]);
    return {...view,id,answerAttemptId:attempt};
  },
  async reevaluate(userId:string,attempt:string){
    const a=await knowledgeRepository.findAnswerForUser(attempt,userId);
    if(!a || a.privacy_status!=="present" || !["evaluated","abstained"].includes(a.status))throw new Error("Terminal owned answer required");
    const s=await sessionRepository.findByIdForUser(a.session_id,userId);
    const item=s?.questions[a.follow_up_index ?? s.questions.findIndex(q=>q.planItemId===a.plan_item_id)];
    if(!item)throw new Error("Owned item unavailable");
    const rubric=a.selected_rubric_id?await rubricEditor.load(a.question_version_id,a.selected_rubric_id):null;
    const objective=a.code_text?await this.objective(a.session_id,a.follow_up_index ?? s!.questions.indexOf(item),a.code_text,item.language || ""):unavailableObjective();
    const input:EvaluationInput|null=rubric?{question:item.questionText,questionVersionId:a.question_version_id,rubric,answer:a.answer_text || "",code:a.code_text || "",objective,derived:a.follow_up_index!==null,artifactUnavailable:a.artifact_refs.length>0 && !a.answer_text}:null;
    const computed=await this.compute({attempt,input,objective});
    return withDatabaseLock(`session:${a.session_id}`,async()=>{
      const fresh=await knowledgeRepository.findAnswerForUser(attempt,userId);if(!fresh || fresh.privacy_status!=="present")throw new Error("Answer erased");
      // Append history only: original result/aggregate and rewards are untouched.
      return this.commit(userId,attempt,computed.view,computed.provider,true);
    });
  },
  async fail(attempt:string,userId:string){await query("UPDATE answer_attempts SET status='failed',updated_at=now() WHERE id=$1 AND user_id=$2 AND status='evaluating'",[attempt,userId]);},
  async objective(sessionId:string,index:number,code:string,language:string):Promise<Objective>{
    const record=(await query("SELECT * FROM coding_execution_evidence WHERE session_id=$1 AND question_index=$2 AND code_hash=$3 AND language=$4 ORDER BY created_at DESC LIMIT 1",[sessionId,index,hash(code),language])).rows[0];
    return record?{status:record.status,kind:"runtime",summary:record.summary,codeHash:record.code_hash}:unavailableObjective();
  },
  async recordExecution(sessionId:string,userId:string,index:number,code:string,language:string,status:"passed"|"failed"){
    await query("INSERT INTO coding_execution_evidence(id,session_id,user_id,question_index,code_hash,language,status,summary) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",[randomUUID(),sessionId,userId,index,hash(code),language,status,status==="failed"?"JDoodle reported execution failure; reviewed tests unavailable.":"JDoodle returned a successful execution status; this does not prove tests passed. Reviewed tests unavailable."]);
  }
};
