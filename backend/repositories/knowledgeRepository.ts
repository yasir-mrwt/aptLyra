import { randomUUID } from "node:crypto";
import { query, withDatabaseLock } from "../config/db.js";
import type { SourceInput, DocumentVersionInput, QuestionVersionInput, StoredQuestionVersion,
  RubricInput, PlanInput, StoredPlan, RetrievalInput, AnswerInput, EvaluationInput, JsonObject } from "../types/knowledge.js";

const json = (value: unknown) => JSON.stringify(value);
const nullable = (value: unknown) => value ?? null;
async function ownedSession(sessionId: string, userId: string) {
  const { rows } = await query("SELECT id FROM sessions WHERE id=$1 AND user_id=$2", [sessionId,userId]);
  if (!rows.length) throw new Error("Owned session not found");
}

/** No HTTP routes are exposed here. Global editorial writes require a future
 * trusted admin/ingestion boundary; scoped writes always require the caller owner. */
export const knowledgeRepository = {
  async listCompetencies(taxonomyVersion: string) {
    return (await query("SELECT * FROM competencies WHERE taxonomy_version=$1 ORDER BY sort_order", [taxonomyVersion])).rows;
  },
  async createSource(input: SourceInput): Promise<string> {
    const id = randomUUID();
    await query(`INSERT INTO sources(id,stable_key,source_type,title,origin,policy_revision,permission_status,
      terms_revision,license_id,permission_evidence,attribution,review_status,state,reviewed_by,reviewed_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
    [id,input.stableKey,input.type,input.title,nullable(input.origin),input.policyRevision,input.permissionStatus,
      nullable(input.termsRevision),nullable(input.licenseId),nullable(input.permissionEvidence),nullable(input.attribution),
      input.reviewStatus,input.state,nullable(input.reviewedBy),nullable(input.reviewedAt)]);
    return id;
  },
  async createDocument(sourceId: string, externalKey: string): Promise<string> {
    const id = randomUUID();
    await query("INSERT INTO source_documents(id,source_id,external_key) VALUES($1,$2,$3)", [id,sourceId,externalKey]);
    return id;
  },
  async createDocumentVersion(input: DocumentVersionInput): Promise<string> {
    const id = randomUUID();
    await query(`INSERT INTO source_document_versions(id,document_id,version,title,canonical_url,occurred_at,
      published_at,fetched_at,reviewed_at,reviewed_by,content_hash,normalized_text,policy_revision,permission_status,
      review_status,quality,pii_status,confidentiality_status,status)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)`,
    [id,input.documentId,input.version,input.title,nullable(input.canonicalUrl),nullable(input.occurredAt),
      nullable(input.publishedAt),nullable(input.fetchedAt),nullable(input.reviewedAt),nullable(input.reviewedBy),
      input.contentHash,nullable(input.text),input.policyRevision,input.permissionStatus,input.reviewStatus,
      input.quality,input.piiStatus,input.confidentialityStatus,input.status]);
    return id;
  },
  async createChunk(input: { documentVersionId: string; index: number; excerpt: string; contentHash: string;
    chunkerVersion: string; section?: string; startOffset?: number; endOffset?: number }): Promise<string> {
    const id = randomUUID();
    await query(`INSERT INTO source_chunks(id,document_version_id,chunk_index,excerpt,content_hash,chunker_version,
      section,start_offset,end_offset,status) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'active')`,
    [id,input.documentVersionId,input.index,input.excerpt,input.contentHash,input.chunkerVersion,
      nullable(input.section),nullable(input.startOffset),nullable(input.endOffset)]);
    return id;
  },
  async withdrawDocumentVersion(id: string, reason: string): Promise<void> {
    await withDatabaseLock(`source-version:${id}`, async () => {
      const result = await query(`UPDATE source_document_versions SET status='withdrawn',withdrawal_reason=$2,
        normalized_text=NULL,redacted_at=now() WHERE id=$1 RETURNING id`, [id,reason]);
      if (!result.rows.length) throw new Error("Source version not found");
      await query("UPDATE source_chunks SET status='retired',excerpt=NULL,redacted_at=now() WHERE document_version_id=$1", [id]);
    });
  },
  async createQuestion(input: { familyKey: string; taxonomyVersion: string; primaryCompetency: string }): Promise<string> {
    const id = randomUUID();
    await query("INSERT INTO interview_questions(id,family_key,taxonomy_version,primary_competency) VALUES($1,$2,$3,$4)",
      [id,input.familyKey,input.taxonomyVersion,input.primaryCompetency]);
    return id;
  },
  async createQuestionVersion(input: QuestionVersionInput): Promise<string> {
    return withDatabaseLock(`question:${input.questionId}`, async () => {
      const { rows } = await query("SELECT * FROM interview_questions WHERE id=$1", [input.questionId]);
      const question = rows[0];
      if (!question) throw new Error("Question not found");
      const id = randomUUID();
      await query(`INSERT INTO question_versions(id,question_id,version,taxonomy_version,primary_competency,question_text,
        category,difficulty,origin,evidence_status,base_version_id,transformation_summary,generation_metadata,content_hash,
        reviewed_by,reviewed_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
      [id,input.questionId,input.version,question.taxonomy_version,question.primary_competency,input.text,
        input.category,input.difficulty,input.origin,input.evidenceStatus,nullable(input.baseVersionId),
        nullable(input.transformationSummary),json(input.generationMetadata || {}),input.contentHash,
        nullable(input.reviewedBy),nullable(input.reviewedAt)]);
      for (const competency of input.secondaryCompetencies || []) {
        await query("INSERT INTO question_version_competencies(question_version_id,taxonomy_version,competency_id) VALUES($1,$2,$3)",
          [id,question.taxonomy_version,competency]);
      }
      for (const source of input.provenance || []) {
        await query("INSERT INTO question_provenance(id,question_version_id,document_version_id,chunk_id,relation) VALUES($1,$2,$3,$4,$5)",
          [randomUUID(),id,source.documentVersionId,nullable(source.chunkId),source.relation]);
      }
      if (input.publish) await query("UPDATE question_versions SET status='published' WHERE id=$1", [id]);
      return id;
    });
  },
  async findQuestionVersion(id: string): Promise<StoredQuestionVersion | null> {
    return (await query("SELECT * FROM question_versions WHERE id=$1", [id])).rows[0] || null;
  },
  async createRubric(questionId: string): Promise<string> {
    const id = randomUUID();
    await query("INSERT INTO rubrics(id,question_id) VALUES($1,$2)", [id,questionId]);
    return id;
  },
  async createRubricVersion(input: RubricInput): Promise<string> {
    return withDatabaseLock(`rubric:${input.rubricId}`, async () => {
      const rubric = (await query("SELECT question_id FROM rubrics WHERE id=$1", [input.rubricId])).rows[0];
      if (!rubric) throw new Error("Rubric not found");
      const id = randomUUID();
      await query(`INSERT INTO rubric_versions(id,rubric_id,question_id,question_version_id,version,kind,status,
        scoring_policy_version,reviewed_by,reviewed_at,fatal_rule) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [id,input.rubricId,rubric.question_id,input.questionVersionId,input.version,input.kind,
        input.kind === "known" ? "reviewed" : "provisional",input.scoringPolicyVersion,
        nullable(input.reviewedBy),nullable(input.reviewedAt),json(input.fatalRule || {})]);
      for (const dimension of input.dimensions) {
        await query("INSERT INTO rubric_dimensions(rubric_version_id,dimension,aggregation_kind,applicable,weight,anchors) VALUES($1,$2,$3,$4,$5,$6)",
          [id,dimension.dimension,dimension.aggregation,dimension.applicable,dimension.weight,json(dimension.anchors)]);
      }
      for (const concept of input.concepts) {
        const conceptId = randomUUID();
        await query(`INSERT INTO expected_concepts(id,rubric_version_id,stable_key,label,description,importance_weight,
          essential,critical,alternatives,observable_anchors,review_status) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [conceptId,id,concept.key,concept.label,concept.description,concept.importance,concept.essential || false,
          concept.critical || false,json(concept.alternatives || []),json(concept.anchors || {}),
          input.kind === "known" ? "reviewed" : "provisional"]);
        for (const chunkId of concept.referenceChunkIds) {
          await query("INSERT INTO concept_references(concept_id,chunk_id) VALUES($1,$2)", [conceptId,chunkId]);
        }
      }
      return id;
    });
  },
  async createPlan(userId: string, input: PlanInput): Promise<string> {
    return withDatabaseLock(`session:${input.sessionId}`, async () => {
      await ownedSession(input.sessionId,userId);
      const id = randomUUID();
      await query(`INSERT INTO interview_plans(id,session_id,user_id,contract_version,planner_version,taxonomy_version,
        corpus_version,role,level,mode,requested_count,effective_count,requested_minutes,effective_minutes,
        difficulty_distribution,modifiers,coverage,time_budget,shortages)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,'junior',$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
      [id,input.sessionId,userId,input.contractVersion,input.plannerVersion,input.taxonomyVersion,input.corpusVersion,
        input.role,input.mode,input.requestedCount,input.effectiveCount,input.requestedMinutes,input.effectiveMinutes,
        json(input.difficultyDistribution || {}),json(input.modifiers || {}),json(input.coverage || {}),
        json(input.timeBudget || {}),json(input.shortages || [])]);
      for (const competency of input.selectedCompetencies) await query(
        "INSERT INTO plan_competencies(plan_id,taxonomy_version,competency_id) VALUES($1,$2,$3)", [id,input.taxonomyVersion,competency]);
      return id;
    });
  },
  async findPlanForUser(id: string, userId: string): Promise<StoredPlan | null> {
    return (await query("SELECT * FROM interview_plans WHERE id=$1 AND user_id=$2", [id,userId])).rows[0] || null;
  },
  async sessionStorageKind(sessionId: string, userId: string): Promise<"legacy" | "versioned" | null> {
    const result = await query(`SELECT EXISTS(SELECT 1 FROM interview_plans WHERE session_id=s.id) AS versioned
      FROM sessions s WHERE s.id=$1 AND s.user_id=$2`, [sessionId,userId]);
    return result.rows.length ? (result.rows[0].versioned ? "versioned" : "legacy") : null;
  },
  async addPlanItem(userId: string, input: { planId: string; position: number; questionVersionId: string;
    rubricVersionId?: string; retrievalId?: string; selectionReason: string; estimatedMinutes: number; parentItemId?: string }): Promise<string> {
    return withDatabaseLock(`plan:${input.planId}`, async () => {
      const plan = await this.findPlanForUser(input.planId,userId);
      if (!plan) throw new Error("Owned plan not found");
      const question = await this.findQuestionVersion(input.questionVersionId);
      if (!question || question.status !== "published") throw new Error("Published question version not found");
      const id = randomUUID();
      await query(`INSERT INTO plan_items(id,plan_id,session_id,user_id,position,question_version_id,rubric_version_id,
        taxonomy_version,primary_competency,category,difficulty,origin,retrieval_id,selection_reason,estimated_minutes,parent_item_id)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
      [id,plan.id,plan.session_id,userId,input.position,question.id,nullable(input.rubricVersionId),question.taxonomy_version,
        question.primary_competency,question.category,question.difficulty,question.origin,nullable(input.retrievalId),
        input.selectionReason,input.estimatedMinutes,nullable(input.parentItemId)]);
      return id;
    });
  },
  async recordRetrieval(userId: string | null, input: RetrievalInput): Promise<string> {
    return withDatabaseLock(`retrieval:${input.operationKey}`, async () => {
      if (input.sessionId && userId) await ownedSession(input.sessionId,userId);
      else if (input.sessionId || userId) throw new Error("Retrieval ownership requires both session and user");
      const id = randomUUID();
      await query(`INSERT INTO retrieval_evidence(id,operation_key,session_id,user_id,plan_id,redacted_query,query_hash,
        filters,embedding_metadata,corpus_version,source_policy_revision,outcome,cache_hit)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [id,input.operationKey,nullable(input.sessionId),userId,nullable(input.planId),nullable(input.redactedQuery),input.queryHash,
        json(input.filters || {}),json(input.embeddingMetadata || {}),input.corpusVersion,input.sourcePolicyRevision,input.outcome,input.cacheHit || false]);
      for (const hit of input.results) await query(
        "INSERT INTO retrieval_results(id,retrieval_id,question_version_id,chunk_id,rank,similarity,selected,reason,provenance_snapshot) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)",
        [randomUUID(),id,nullable(hit.questionVersionId),nullable(hit.chunkId),hit.rank,nullable(hit.similarity),hit.selected || false,hit.reason,json(hit.provenanceSnapshot || [])]);
      return id;
    });
  },
  async createAnswerAttempt(userId: string, input: AnswerInput): Promise<string> {
    return withDatabaseLock(`item:${input.planItemId}`, async () => {
      const item = (await query("SELECT * FROM plan_items WHERE id=$1 AND user_id=$2", [input.planItemId,userId])).rows[0];
      if (!item) throw new Error("Owned plan item not found");
      const id = randomUUID();
      await query(`INSERT INTO answer_attempts(id,session_id,user_id,plan_id,plan_item_id,question_version_id,attempt,
        input_kind,answer_text,code_text,artifact_refs,content_hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [id,item.session_id,userId,item.plan_id,item.id,item.question_version_id,input.attempt,input.inputKind,
        nullable(input.text),nullable(input.code),json(input.artifactRefs || []),input.contentHash]);
      return id;
    });
  },
  async findAnswerForUser(id: string, userId: string) {
    return (await query("SELECT * FROM answer_attempts WHERE id=$1 AND user_id=$2", [id,userId])).rows[0] || null;
  },
  async recordEvaluation(userId: string, input: EvaluationInput): Promise<string> {
    return withDatabaseLock(`answer:${input.answerAttemptId}`, async () => {
      const answer = await this.findAnswerForUser(input.answerAttemptId,userId);
      if (!answer) throw new Error("Owned answer attempt not found");
      const id = randomUUID();
      await query(`INSERT INTO evaluations(id,answer_attempt_id,question_version_id,rubric_version_id,scoring_policy_version,
        revision,supersedes_id,status,technical_score,evaluator_confidence,reason_codes,dimensions,delivery,model_metadata,prompt_version)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
      [id,answer.id,answer.question_version_id,input.rubricVersionId,input.scoringPolicyVersion,input.revision,
        nullable(input.supersedesId),input.status,nullable(input.technicalScore),nullable(input.evaluatorConfidence),
        json(input.reasonCodes || []),json(input.dimensions || {}),json(input.delivery || {}),json(input.modelMetadata || {}),nullable(input.promptVersion)]);
      for (const evidence of input.evidence || []) await query(`INSERT INTO evaluation_evidence(id,evaluation_id,rubric_version_id,
        expected_concept_id,answer_start,answer_end,artifact_or_test,reference_chunk_id,judgment,explanation,reason_code)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [randomUUID(),id,input.rubricVersionId,evidence.conceptId,nullable(evidence.answerStart),nullable(evidence.answerEnd),
        json(evidence.artifactOrTest || {}),nullable(evidence.referenceChunkId),evidence.judgment,evidence.explanation,evidence.reasonCode]);
      return id;
    });
  },
  async findEvaluationForUser(id: string, userId: string) {
    return (await query(`SELECT e.* FROM evaluations e JOIN answer_attempts a ON a.id=e.answer_attempt_id
      WHERE e.id=$1 AND a.user_id=$2`, [id,userId])).rows[0] || null;
  },
  async recordOperation(userId: string, input: { sessionId: string; type: "plan" | "transcribe" | "evaluate" | "follow-up" | "report" | "delete";
    idempotencyKey: string; payloadHash: string; sessionRevision: number; deadline?: string; eventType: string; eventPayload: JsonObject }): Promise<string> {
    return withDatabaseLock(`session:${input.sessionId}`, async () => {
      await ownedSession(input.sessionId,userId);
      const id = randomUUID();
      await query(`INSERT INTO durable_operations(id,session_id,user_id,operation_type,idempotency_key,payload_hash,session_revision,deadline)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8)`, [id,input.sessionId,userId,input.type,input.idempotencyKey,input.payloadHash,input.sessionRevision,nullable(input.deadline)]);
      await query(`INSERT INTO transactional_outbox(id,session_id,user_id,aggregate_revision,event_type,payload) VALUES($1,$2,$3,$4,$5,$6)`,
        [randomUUID(),input.sessionId,userId,input.sessionRevision,input.eventType,json(input.eventPayload)]);
      return id;
    });
  },
};
