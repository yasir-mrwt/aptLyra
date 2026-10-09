import express from "express";
import asyncHandler from "express-async-handler";
import rateLimit from "express-rate-limit";
import { protect } from "../middleware/auth.js";
import { contentSubmissions } from "../contentIntelligence/submissions.js";
import { contentEditorial } from "../contentIntelligence/editorial.js";
import type { AuthenticatedRequest } from "../types/express.js";
import { sourceRegistry } from "../contentIntelligence/sourceRegistry.js";
import { contentTrends } from "../contentIntelligence/trends.js";
import { IngestionError } from "../ingestion/localAdapter.js";

const router = express.Router();
const submitLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: {
    code: "submission_rate_limit",
    message: "You have reached the hourly submission limit.",
  },
});
router.use(protect);
const userId = (req: AuthenticatedRequest) =>
  String(req.user?.id || req.user?._id || "");
const safeEditorialErrors = new Set([
  "reviewer-not-authorized", "invalid-id", "invalid-manual-reference", "invalid-extraction-output",
  "unsafe-question", "submission-changed-during-extraction", "chunk-not-available", "dedupe-budget-exceeded",
  "question-unavailable", "technical_reference_unavailable", "technical_reference_not_found", "technical_reference_withdrawn",
  "approved_reference_required", "invalid_rubric_grounding", "invalid-rubric-grounding", "invalid_rubric_draft",
  "rubric_hash_mismatch", "candidate-not-supersedable", "technical-reference-required", "seed-question-not-found",
  "seed-review-schema-unavailable", "seed-source-permission-not-enabled", "seed-ai-review-required", "submission-not-found",
  "submission-unavailable", "review-hash-mismatch", "candidate-not-reviewable", "ai-processing-consent-required",
  "source-ai-processing-disallowed", "ai-review-unavailable", "ai-provider-unavailable", "ai-provider-configuration",
  "ai-provider-rate-limited", "ai-provider-timeout", "invalid-ai-output", "invalid-review-output",
  "malformed_model_json", "editorial_schema_validation_failed", "editorial_semantic_validation_failed",
  "extraction_schema_validation_failed", "extraction_semantic_validation_failed", "rubric_draft_schema_validation_failed", "rubric_draft_semantic_validation_failed",
  "invalid_source_request", "permission-hash-mismatch", "source-not-found", "source-permission-expired",
  "source-permission-required", "source-rate-limit",
  "invalid-manual-question", "duplicate-manual-question", "source-record-not-ready",
]);
const handle = (
  work: (req: AuthenticatedRequest) => Promise<unknown>,
  status = 200,
) =>
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    try {
      res.status(status).json(await work(req));
    } catch (error) {
      const rawCode = error instanceof IngestionError ? error.code.split(":")[0] : error instanceof Error ? error.message : "";
      const candidate = safeEditorialErrors.has(rawCode) ? rawCode : "";
      const detailCategory = error instanceof IngestionError ? error.code.split(":")[1] : undefined;
      const pgCode = typeof error === "object" && error !== null && "code" in error && typeof error.code === "string" ? error.code : "";
      const pgDetails=error&&typeof error==="object"?error as {table?:unknown;constraint?:unknown;column?:unknown}:{};
      const route = typeof req.route?.path === "string" ? req.route.path : "unmatched";
      const requestId = String((req as AuthenticatedRequest & { requestId?: string }).requestId || "missing-request-id");
      const messages:Record<string,{status:number;message:string}>= {
        "reviewer-not-authorized":{status:403,message:"This action requires an enabled human reviewer account."},
        "invalid-id":{status:400,message:"This review request is invalid. Reload the current item and retry."},
        "invalid-manual-reference":{status:400,message:"Check the reference fields and authorship permission, then try again."},
        "invalid-manual-question":{status:400,message:"Check the question, topic, difficulty and authorship attestation."},
        "duplicate-manual-question":{status:409,message:"This question already exists in the selected source record."},
        "invalid-extraction-output":{status:502,message:"AI returned an invalid review. Retry AI review."},
        "unsafe-question":{status:422,message:"This AI suggestion contains content that cannot be reviewed safely."},
        "submission-changed-during-extraction":{status:409,message:"The submission changed while AI was reviewing it. Reload and retry."},
        "chunk-not-available":{status:409,message:"The source evidence is no longer available for review."},
        "dedupe-budget-exceeded":{status:503,message:"Question comparison is temporarily unavailable. Retry later."},
        "question-unavailable":{status:404,message:"This question is unavailable for review."},
        "technical_reference_unavailable":{status:409,message:"This reference is no longer approved for question evidence."},
        "technical_reference_not_found":{status:404,message:"This question has no matching approved evidence to remove."},
        "technical_reference_withdrawn":{status:409,message:"This reference was withdrawn and cannot be reattached."},
        "approved_reference_required":{status:409,message:"Approve evidence before drafting a scoring guide."},
        "invalid_rubric_grounding":{status:422,message:"The scoring guide needs to cite approved evidence before it can be saved."},
        "invalid-rubric-grounding":{status:422,message:"The scoring guide needs to cite approved evidence before it can be saved."},
        "invalid_rubric_draft":{status:422,message:"The scoring guide draft does not match this question."},
        "rubric_hash_mismatch":{status:409,message:"This scoring guide changed. Reload the latest draft before approving."},
        "candidate-not-supersedable":{status:409,message:"This question can no longer replace the selected question."},
        "technical-reference-required":{status:409,message:"Approve evidence before drafting a scoring guide."},
        "seed-question-not-found":{status:404,message:"This seed question is unavailable for editorial review."},
        "seed-review-schema-unavailable":{status:503,message:"The editorial database needs migration 014 before starter questions can be reviewed. Ask an operator to apply the reviewed migration."},
        "seed-source-permission-not-enabled":{status:503,message:"The editorial database needs migration 014 before AI review is enabled for these starter questions."},
        "seed-ai-review-required":{status:409,message:"Run AI review before recording a human seed question decision."},
        "submission-not-found":{status:404,message:"This submission is unavailable."},
        "submission-unavailable":{status:404,message:"This submission is no longer available for review."},
        "source-record-not-ready":{status:409,message:"A human must approve at least one question from this submission before its source record can be published."},
        "review-hash-mismatch":{status:409,message:"The content changed. Reload the current question and review its new version."},
        "candidate-not-reviewable":{status:409,message:"This question is no longer available for review."},
        "ai-processing-consent-required":{status:403,message:"The submitter has not permitted AI processing for this question."},
        "source-ai-processing-disallowed":{status:403,message:"The source has not permitted model processing for this content."},
        "ai-review-unavailable":{status:503,message:"AI review is temporarily unavailable. Check the internal AI service and retry."},
        "ai-provider-unavailable":{status:503,message:"AI review is temporarily unavailable. Retry when the AI service is available."},
        "ai-provider-configuration":{status:503,message:"AI provider configuration is unavailable. Ask an operator to check the AI service."},
        "ai-provider-rate-limited":{status:429,message:"The AI service is rate limited. Wait briefly and retry."},
        "ai-provider-timeout":{status:504,message:"The AI service took too long to respond. Retry shortly."},
        "invalid-ai-output":{status:502,message:"AI returned an invalid review. Retry AI review."},
        "invalid-review-output":{status:502,message:"AI returned a review outside the supported editorial contract. Retry or review the question manually."},
        "malformed_model_json":{status:502,message:"AI returned an invalid review format. Retry AI review."},
        "extraction_schema_validation_failed":{status:502,message:"AI extraction remained outside the required format after one correction attempt. Review or add the question manually."},
        "extraction_semantic_validation_failed":{status:502,message:"AI extraction did not match the source evidence after one correction attempt. Review or add the question manually."},
        "rubric_draft_schema_validation_failed":{status:502,message:"AI scoring-guide output remained outside the required format after one correction attempt. Continue editing manually."},
        "rubric_draft_semantic_validation_failed":{status:502,message:"AI scoring-guide output failed reference grounding after one correction attempt. Continue editing manually."},
        "editorial_schema_validation_failed":{status:502,message:"AI returned an invalid review format. Aptlyra retried once but could not validate it."},
        "editorial_semantic_validation_failed":{status:502,message:"AI review failed a safety check. Retry AI review."},
        "database-relation-missing":{status:503,message:"A required editorial database relation is missing. Apply the current Aptlyra migrations and retry."},
        "database-column-missing":{status:503,message:"A required editorial database column is missing. Apply the current Aptlyra migrations and retry."},
        "database-integrity-conflict":{status:409,message:"This editorial change conflicts with a database integrity rule. Refresh the item and retry."},
        "database-connection-failed":{status:503,message:"The editorial database is temporarily unreachable. Retry shortly."},
        "database-data-invalid":{status:422,message:"The editorial data did not match the database format. Refresh the item and retry."},
        "database-operation-failed":{status:500,message:"This editorial database action could not be completed. Share the request ID with an operator."},
        "invalid_source_request":{status:400,message:"Check the source details and permission evidence, then try again."},
        "permission-hash-mismatch":{status:409,message:"Source permissions changed. Reload the source and review its current details."},
        "source-not-found":{status:404,message:"This source is no longer available."},
        "source-permission-expired":{status:409,message:"Source permission has expired. Review its permission before continuing."},
        "source-permission-required":{status:409,message:"Review and approve source permission before enabling collection."},
        "source-rate-limit":{status:429,message:"This source was recently collected. Wait before requesting it again."},
      };
      const missingSchema = ["42P01", "42703"].includes(pgCode);
      const databaseCode = pgCode === "42P01" ? "database-relation-missing" : pgCode === "42703" ? "database-column-missing"
        : pgCode.startsWith("23") ? "database-integrity-conflict" : pgCode.startsWith("08") ? "database-connection-failed"
          : pgCode.startsWith("22") ? "database-data-invalid" : pgCode ? "database-operation-failed" : "editorial-action-failed";
      const safeCode = candidate || (missingSchema && route === "/seed-review" ? "seed-review-schema-unavailable" : databaseCode);
      const known=messages[safeCode];
      const safeCategory = detailCategory&&/^[a-z0-9_-]{1,60}$/.test(detailCategory)?detailCategory:candidate ? "editorial-rule" : missingSchema ? "schema-mismatch" : pgCode.startsWith("08") ? "database-connection" : pgCode ? "database-query" : "application-error";
      const relations=new Set(["ingestion_records","ingestion_candidates","sources","source_documents","source_document_versions","source_chunks","question_versions","question_provenance","question_technical_references","rubric_drafts","rubric_versions","expected_concepts","concept_references","content_scoring_review_events","ingestion_review_events","embedding_metadata","embedding_vectors"]);
      const affectedRelation=typeof pgDetails.table==="string"&&relations.has(pgDetails.table)?pgDetails.table:undefined;
      const constraintCategory=pgCode.startsWith("23")?"integrity-constraint":pgCode.startsWith("42")?"schema-object":pgCode.startsWith("22")?"data-value":undefined;
      console.error("Editorial request failed",{requestId,route:`${req.method} ${route}`,operation:route.slice(1).replaceAll("/", ".").replaceAll(":", ""),code:safeCode,category:safeCategory,
        ...( /^[0-9A-Z]{5}$/.test(pgCode)?{postgresCode:pgCode}:{}),...(affectedRelation?{affectedRelation}:{}),...(constraintCategory?{constraintCategory}:{}),
        ...(typeof pgDetails.constraint==="string"&&/^[a-z0-9_]{1,100}$/.test(pgDetails.constraint)?{constraintName:pgDetails.constraint}:{}),
        ...(typeof pgDetails.column==="string"&&/^[a-z0-9_]{1,100}$/.test(pgDetails.column)?{columnName:pgDetails.column}:{})});
      const result=known|| (candidate?{status:400,message:"Check the editorial fields and try again."}:{status:500,message:"This editorial action could not be completed. Check the request ID with an operator and retry."});
      res.status(result.status).json({code:safeCode,message:result.message,requestId});
    }
  });
router.get("/sources",handle(req=>sourceRegistry.list(userId(req))));
router.get("/sources/:id",handle(req=>sourceRegistry.get(userId(req),String(req.params.id))));
router.post("/sources",handle(req=>sourceRegistry.create(userId(req),req.body),201));
router.patch("/sources/:id",handle(req=>sourceRegistry.update(userId(req),String(req.params.id),req.body)));
router.post("/sources/:id/permission-review",handle(req=>sourceRegistry.reviewPermission(userId(req),String(req.params.id),String(req.body?.expectedHash||""))));
router.post("/sources/:id/enable",handle(req=>sourceRegistry.setEnabled(userId(req),String(req.params.id),true)));
router.post("/sources/:id/disable",handle(req=>sourceRegistry.setEnabled(userId(req),String(req.params.id),false)));
router.post("/sources/:id/withdraw",handle(req=>sourceRegistry.withdraw(userId(req),String(req.params.id),String(req.body?.reason||""))));
router.post("/sources/:id/collect",handle(req=>sourceRegistry.collect(userId(req),String(req.params.id),"manual"),202));
router.post("/sources/:id/retry",handle(req=>sourceRegistry.collect(userId(req),String(req.params.id),"retry"),202));
router.get("/sources/:id/collections",handle(req=>sourceRegistry.history(userId(req),String(req.params.id))));
router.get("/trends",handle(req=>contentTrends.list(userId(req),Number(req.query.days||90),typeof req.query.role==="string"?req.query.role:undefined,typeof req.query.company==="string"?req.query.company:undefined)));
router.post(
  "/submissions",
  submitLimiter,
  handle((req) => contentSubmissions.create(userId(req), req.body), 201),
);
router.get(
  "/submissions",
  handle((req) => contentSubmissions.listMine(userId(req))),
);
router.delete(
  "/submissions/:id",
  handle((req) =>
    contentSubmissions.withdrawMine(userId(req), String(req.params.id)),
  ),
);
router.get(
  "/review-queue",
  handle((req) => contentSubmissions.reviewQueue(userId(req))),
);
router.get(
  "/reviewer",
  handle(async (req) => ({
    reviewer: await contentSubmissions.reviewerFor(userId(req)),
  })),
);
router.get(
  "/review/candidates",
  handle((req) => contentEditorial.candidateQueue(userId(req))),
);
router.get("/review/manual-references",handle(req=>contentEditorial.manualReferenceQueue(userId(req))));
router.post("/review/manual-references",handle(req=>contentEditorial.createManualReference(userId(req),req.body),201));
router.get("/review/competencies",handle(req=>contentEditorial.competencies(userId(req))));
router.post("/review/manual-questions",handle(req=>contentEditorial.createManualQuestion(userId(req),req.body),201));
router.post("/review/manual-references/:id/approve",handle(req=>contentEditorial.approveManualReference(
  userId(req),String(req.params.id),String(req.body?.expectedHash||""))));
router.post("/review/candidates/:id/ai-review",handle(req=>contentEditorial.reviewCandidate(
  userId(req),String(req.params.id),String(req.body?.expectedHash||""),String((req as AuthenticatedRequest & {requestId?:string}).requestId||""),
)));
router.post("/review/candidates/:id/approve-seed-question",handle(req=>contentEditorial.approveSeedQuestion(
  userId(req),String(req.params.id),String(req.body?.expectedHash||""),String(req.body?.expectedPacketHash||""),
)));
router.post("/review/records/:id/approve",handle(req=>contentEditorial.approveSourceRecord(userId(req),String(req.params.id),String(req.body?.expectedHash||""),req.body?.duplicateDecision)));
router.post("/review/records/:id/publish",handle(req=>contentEditorial.publishSourceRecord(userId(req),String(req.params.id))));
router.post("/review/records/:id/reject",handle(req=>contentEditorial.rejectSourceRecord(userId(req),String(req.params.id),String(req.body?.reason||"reviewer-rejected"))));
router.post(
  "/review/submissions/:id/extract",
  handle((req) =>
    contentEditorial.extractSubmission(
      userId(req),
      String(req.params.id),
      String(req.body?.expectedHash || ""),
    ),
  ),
);
router.post(
  "/review/candidates/:id/approve",
  handle((req) =>
    contentEditorial.approveQuestion(
      userId(req),
      String(req.params.id),
      String(req.body?.expectedHash || ""),
      req.body?.duplicateDecision,
    ),
  ),
);
router.post(
  "/review/candidates/:id/edit-approve",
  handle((req) =>
    contentEditorial.editApproveQuestion(
      userId(req),
      String(req.params.id),
      String(req.body?.expectedHash || ""),
      req.body?.specification,
      req.body?.derivation,
    ),
  ),
);
router.post(
  "/review/candidates/:id/reject",
  handle((req) =>
    contentEditorial.rejectQuestion(
      userId(req),
      String(req.params.id),
      String(req.body?.expectedHash || ""),
      String(req.body?.reason || "reviewer-rejected"),
    ),
  ),
);
router.post(
  "/review/candidates/:id/duplicate",
  handle((req) =>
    contentEditorial.duplicateQuestion(
      userId(req),
      String(req.params.id),
      String(req.body?.expectedHash || ""),
      String(req.body?.duplicateOf || ""),
      String(req.body?.reason || "duplicate-family"),
    ),
  ),
);
router.post(
  "/review/candidates/:id/family",
  handle((req) => contentEditorial.linkQuestionFamily(
    userId(req), String(req.params.id), String(req.body?.expectedHash || ""), String(req.body?.relatedId || ""),
  )),
);
router.post(
  "/review/candidates/:id/supersede",
  handle((req) => contentEditorial.supersedeQuestion(
    userId(req), String(req.params.id), String(req.body?.expectedHash || ""), String(req.body?.supersedesId || ""),
  )),
);
router.post(
  "/review/candidates/:id/withdraw",
  handle((req) =>
    contentEditorial.withdrawQuestion(
      userId(req),
      String(req.params.id),
      String(req.body?.expectedHash || ""),
      String(req.body?.reason || "reviewer-withdrawn"),
    ),
  ),
);
router.get(
  "/scoring-queue",
  handle((req) => contentEditorial.scoringQueue(userId(req))),
);
router.get("/interview-bank",handle(req=>contentEditorial.interviewBank(userId(req))));
router.get(
  "/published",
  handle((req) => contentEditorial.scoringQueue(userId(req))),
);
router.get(
  "/seed-review",
  handle((req) => contentEditorial.seedReview(userId(req))),
);
router.get(
  "/technical-references",
  handle((req) => contentEditorial.technicalReferenceOptions(userId(req))),
);
router.post(
  "/scoring/:questionVersionId/references",
  handle((req) =>
    contentEditorial.addTechnicalReference(
      userId(req),
      String(req.params.questionVersionId),
      String(req.body?.chunkId || ""),
    ),
  ),
);
router.delete(
  "/scoring/:questionVersionId/references/:chunkId",
  handle((req) =>
    contentEditorial.removeTechnicalReference(
      userId(req),
      String(req.params.questionVersionId),
      String(req.params.chunkId),
      String(req.body?.reason || "reference-withdrawn"),
    ),
  ),
);
router.post(
  "/scoring/:questionVersionId/draft",
  handle((req) =>
    contentEditorial.draftScoringPacket(
      userId(req),
      String(req.params.questionVersionId),
      String((req as AuthenticatedRequest & {requestId?:string}).requestId||""),
    ),
  ),
);
router.post(
  "/scoring/drafts/:draftId/edit",
  handle((req) => contentEditorial.editScoringPacket(userId(req),String(req.params.draftId),String(req.body?.expectedHash || ""),req.body?.content)),
);
router.post(
  "/scoring/drafts/:draftId/approve",
  handle((req) =>
    contentEditorial.approveScoringPacket(
      userId(req),
      String(req.params.draftId),
      String(req.body?.expectedHash || ""),
    ),
  ),
);
router.post(
  "/scoring/drafts/:draftId/reject",
  handle((req) =>
    contentEditorial.rejectScoringPacket(
      userId(req),
      String(req.params.draftId),
      String(req.body?.expectedHash || ""),
      String(req.body?.reason || "scoring-rejected"),
    ),
  ),
);
router.post(
  "/scoring/:questionVersionId/withdraw",
  handle((req) => contentEditorial.withdrawScoringPacket(userId(req),String(req.params.questionVersionId),String(req.body?.expectedHash || ""))),
);
router.post(
  "/review/candidates/:id/publish",
  handle((req) =>
    contentEditorial.publishQuestion(userId(req), String(req.params.id),String(req.body?.expectedHash || "")),
  ),
);
export default router;
