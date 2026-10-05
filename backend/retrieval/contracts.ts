import type { Json, QuestionCategory, Difficulty, QuestionOrigin } from "../types/knowledge.js";

export const MODEL = Object.freeze({modelId:"sentence-transformers/paraphrase-MiniLM-L3-v2",
  modelRevision:"4ca70771034acceecb2e72475f72050fcdde4ddc", dimension:384, normalization:"l2",
  embeddingVersion:"onnx-mean-l2-v1"});
export type Purpose = "question-selection" | "technical-grounding";
export type Outcome = "success" | "no_match" | "unavailable" | "invalid_filters" | "model_mismatch" | "corpus_unavailable";
export type Reason = "exact_match" | "semantic_match" | "reviewed_seed_available" | "no_relevant_hit" | "no_permitted_source" | "model_unavailable" | "corpus_unavailable" | "invalid_filters" | "model_mismatch";
export interface Filters {
  taxonomyVersion?: string; competencies?: string[]; role?: "Software Engineer" | "Backend Developer" | "Full Stack Developer";
  difficulties?: Difficulty[]; categories?: QuestionCategory[]; origins?: QuestionOrigin[];
  qualities?: ("technical-reference" | "reported-experience" | "unverified")[];
  sourceStates?: "enabled"[]; reviewStates?: "approved"[];
  company?: string; occurredAfter?: string; occurredBefore?: string;
  sourceKeys?: string[]; documentKeys?: string[];
  excludedFamilies?: string[]; excludedVersions?: string[]; alreadySelectedIds?: string[];
}
export interface RetrievalRequest { query: string; filters?: Filters; limit?: number; candidatePool?: number;
  minimumSimilarity?: number; expectedCorpusGeneration?: string; expectedModelRevision?: string;
  strategy?: "semantic" | "structured-seed"; ownership?: { userId: string; sessionId: string } }
export interface EmbeddingBatch { modelId: string; modelRevision: string; dimension: number; normalization: string;
  embeddingVersion: string; vectors: number[][]; processingMs: number }
export interface Embedder { embed(texts: string[], mode: "documents" | "query"): Promise<EmbeddingBatch> }
export interface Entity {
  entity_id: string; entity_type: "question" | "chunk"; purpose: Purpose; text: string; content_hash: string;
  question_id: string | null; family_key: string | null; taxonomy_version: string | null;
  primary_competency: string | null; category: QuestionCategory | null; difficulty: Difficulty | null; origin: QuestionOrigin | null;
  roles: string[] | null; candidate_id: string | null; duplicate_links: {candidateId: string; kind: string}[];
  provenance: Record<string, Json>[];
}
export interface RetrievalHit {
  questionId: string | null; questionVersionId: string | null; chunkId: string | null; familyKey: string | null;
  text: string; competency: string | null; category: QuestionCategory | null; difficulty: Difficulty | null; origin: QuestionOrigin | null;
  provenance: Record<string, Json>[]; provenanceAvailable: true; similarity: number | null; rank: number; reason: Reason;
  retrievalOperationId: string; model: typeof MODEL; corpusGeneration: string;
}
export interface RetrievalResponse {
  operationId: string; outcome: Outcome; reason: Reason; hits: RetrievalHit[]; corpusGeneration: string | null;
  cacheHit: false; timings: {embeddingMs: number; databaseMs: number; totalMs: number};
}
export class RetrievalFailure extends Error {
  constructor(public readonly code: string) { super(code); }
}
export function validateBatch(value: unknown, count: number): EmbeddingBatch {
  const v = value as EmbeddingBatch;
  if (!v || typeof v!=="object" || Object.entries(MODEL).some(([k,expected])=>v[k as keyof EmbeddingBatch]!==expected))
    throw new RetrievalFailure("model_mismatch");
  if (!Number.isFinite(v.processingMs) || v.processingMs<0 || !Array.isArray(v.vectors) || v.vectors.length!==count
    || v.vectors.some(vec=>!Array.isArray(vec) || vec.length!==384 || vec.some(n=>typeof n!=="number" || !Number.isFinite(n))
      || Math.abs(vec.reduce((sum,n)=>sum+n*n,0)-1)>0.002)) throw new RetrievalFailure("invalid_model_output");
  return v;
}
