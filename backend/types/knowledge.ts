/** Internal persistence contracts only; not a public API or scoring engine. */
export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export type JsonObject = { [key: string]: Json };
export type QuestionCategory = "conceptual-oral" | "scenario" | "coding" | "debugging" | "sql" | "system-design-lite";
export type Difficulty = "easy" | "standard" | "stretch";
export type QuestionOrigin = "retrieved" | "generated" | "adapted" | "fallback" | "follow-up";
export type RubricKind = "known" | "provisional";
export type Dimension = "correctness" | "concept-coverage" | "reasoning" | "practical-application" | "trade-off-awareness" | "communication-clarity";
export type Confidence = "high" | "medium" | "low";
export type Judgment = "satisfied" | "partial" | "absent" | "incorrect" | "unobservable";
export interface StoredPlan {
  id: string; session_id: string; user_id: string; taxonomy_version: string;
  revision: number; status: "building" | "ready" | "active" | "completed" | "failed";
}
export interface StoredQuestionVersion {
  id: string; question_id: string; version: number; taxonomy_version: string;
  primary_competency: string; question_text: string; category: QuestionCategory;
  difficulty: Difficulty; origin: QuestionOrigin; status: "draft" | "published" | "retired";
}
export interface SourceInput {
  stableKey: string; type: "authored" | "licensed-reference" | "permitted-api" | "voluntary-experience";
  title: string; origin?: string; policyRevision: string;
  permissionStatus: "unknown" | "permitted" | "rejected" | "expired";
  termsRevision?: string; licenseId?: string; permissionEvidence?: string; attribution?: string;
  reviewStatus: "proposed" | "approved" | "rejected";
  state: "disabled" | "enabled" | "suspended"; reviewedBy?: string; reviewedAt?: string;
}
export interface DocumentVersionInput {
  documentId: string; version: number; title: string; canonicalUrl?: string;
  occurredAt?: string; publishedAt?: string; fetchedAt?: string; reviewedAt?: string; reviewedBy?: string;
  contentHash: string; text?: string; policyRevision: string;
  permissionStatus: "unknown" | "permitted" | "rejected" | "expired";
  reviewStatus: "pending" | "approved" | "rejected";
  quality: "technical-reference" | "reported-experience" | "unverified";
  piiStatus: "pending" | "clear" | "redacted" | "rejected";
  confidentialityStatus: "pending" | "clear" | "rejected";
  status: "quarantined" | "published";
}
export interface QuestionVersionInput {
  questionId: string; version: number; text: string; category: QuestionCategory;
  difficulty: Difficulty; origin: QuestionOrigin; evidenceStatus: "available" | "unavailable";
  baseVersionId?: string; transformationSummary?: string; generationMetadata?: JsonObject;
  contentHash: string; secondaryCompetencies?: string[];
  provenance?: { documentVersionId: string; chunkId?: string; relation: "origin" | "technical-grounding" | "editorial" }[];
  publish?: boolean; reviewedBy?: string; reviewedAt?: string;
}
export interface RubricInput {
  rubricId: string; questionVersionId: string; version: number; kind: RubricKind;
  scoringPolicyVersion: string; reviewedBy?: string; reviewedAt?: string; fatalRule?: JsonObject;
  dimensions: { dimension: Dimension; aggregation: "technical" | "delivery"; applicable: boolean; weight: number; anchors: JsonObject }[];
  concepts: { key: string; label: string; description: string; importance: number; essential?: boolean;
    critical?: boolean; alternatives?: Json[]; anchors?: JsonObject; referenceChunkIds: string[] }[];
}
export interface PlanInput {
  sessionId: string; contractVersion: string; plannerVersion: string; taxonomyVersion: string; corpusVersion: string;
  role: "Software Engineer" | "Backend Developer" | "Full Stack Developer";
  mode: "oral" | "coding" | "mixed"; requestedCount: number; effectiveCount: number;
  requestedMinutes: number; effectiveMinutes: number; selectedCompetencies: string[];
  difficultyDistribution?: JsonObject; modifiers?: JsonObject; coverage?: JsonObject;
  timeBudget?: JsonObject; shortages?: Json[];
}
export interface RetrievalInput {
  operationKey: string; sessionId?: string; planId?: string; redactedQuery?: string; queryHash: string;
  filters?: JsonObject; embeddingMetadata?: JsonObject; corpusVersion: string; sourcePolicyRevision: string;
  outcome: "hits" | "no-evidence" | "unavailable"; cacheHit?: boolean;
  results: { questionVersionId?: string; chunkId?: string; rank: number; similarity?: number; selected?: boolean; reason: string }[];
}
export interface AnswerInput {
  planItemId: string; attempt: number; inputKind: "text" | "audio" | "code" | "diagram" | "mixed";
  text?: string; code?: string; artifactRefs?: Json[]; contentHash: string;
}
export interface EvaluationInput {
  answerAttemptId: string; rubricVersionId: string; scoringPolicyVersion: string; revision: number; supersedesId?: string;
  status: "pending" | "succeeded" | "abstained" | "failed"; technicalScore?: number;
  evaluatorConfidence?: Confidence; reasonCodes?: string[]; dimensions?: Partial<Record<Dimension, number>>;
  delivery?: JsonObject; modelMetadata?: JsonObject; promptVersion?: string;
  evidence?: { conceptId: string; answerStart?: number; answerEnd?: number; artifactOrTest?: JsonObject;
    referenceChunkId?: string; judgment: Judgment; explanation: string; reasonCode: string }[];
}
