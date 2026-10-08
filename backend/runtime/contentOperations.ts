import { createHash, randomUUID } from "node:crypto";
import { query, withDatabaseLock } from "../config/db.js";

export const CONTENT_RUNTIME = "aptlyra-content-v1";
export const CONTENT_OPERATION_TYPES = [
  "source_collection", "source_extraction", "question_candidate_processing",
  "scoring_packet_draft", "embedding_publication", "withdrawal_reconciliation", "retention_expiry",
] as const;
export type ContentOperationType = typeof CONTENT_OPERATION_TYPES[number];
export type ContentScopeType = "source" | "submission" | "question" | "maintenance";

export interface ContentOperationInput {
  type: ContentOperationType;
  scopeType: ContentScopeType;
  scopeId: string;
  idempotencyKey: string;
  payload: Record<string, unknown>;
  sourceId?: string;
  requestedBy?: string;
  deadlineMs?: number;
  maxAttempts?: number;
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

/** Inserts into the Phase 8 SQL operation/outbox tables; Redis only receives the stable operation ID. */
export const contentOperations = {
  async enqueue(input: ContentOperationInput) {
    if (!CONTENT_OPERATION_TYPES.includes(input.type) || !uuid.test(input.scopeId) ||
      (input.sourceId && !uuid.test(input.sourceId)) || (input.requestedBy && !uuid.test(input.requestedBy)) ||
      input.idempotencyKey.length < 1 || input.idempotencyKey.length > 200 ||
      !input.payload || Array.isArray(input.payload) || typeof input.payload !== "object" ||
      Buffer.byteLength(JSON.stringify(input.payload)) > 16_384) throw new Error("invalid_content_operation");
    if ((input.scopeType === "source") !== Boolean(input.sourceId) ||
      (input.scopeType === "source" && input.sourceId !== input.scopeId)) throw new Error("invalid_content_operation_scope");
    const maxAttempts = Math.max(1, Math.min(input.maxAttempts ?? 3, 3));
    const deadlineMs = Math.max(10_000, Math.min(input.deadlineMs ?? 15 * 60_000, 60 * 60_000));
    const payloadHash = hash(input.payload);
    const lock = `content-operation:${input.scopeType}:${input.scopeId}:${input.type}:${input.idempotencyKey}`;
    return withDatabaseLock(lock, async () => {
      const existing = (await query(`SELECT * FROM durable_operations WHERE runtime_version=$1 AND scope_type=$2
        AND scope_id=$3 AND operation_type=$4 AND idempotency_key=$5`,
      [CONTENT_RUNTIME, input.scopeType, input.scopeId, input.type, input.idempotencyKey])).rows[0];
      if (existing) {
        if (existing.payload_hash !== payloadHash) throw new Error("idempotency_payload_conflict");
        return existing;
      }
      if (input.sourceId) {
        const source = (await query(`SELECT state,withdrawn_at,permission_status,review_status,permission_evidence,
          permission_evidence_hash,reviewed_by,reviewed_at,permission_basis
          FROM sources WHERE id=$1`, [input.sourceId])).rows[0];
        if (!source || source.state !== "enabled" || source.withdrawn_at || source.permission_status !== "permitted" ||
          source.review_status !== "approved" || !source.permission_basis || !source.permission_evidence ||
          !source.permission_evidence_hash || !source.reviewed_by || !source.reviewed_at)
          throw new Error("source_permission_required");
      }
      const operationId = randomUUID();
      const row = (await query(`INSERT INTO durable_operations(id,session_id,user_id,operation_type,idempotency_key,status,
        deadline,payload_hash,session_revision,runtime_version,payload,max_attempts,scope_type,scope_id,source_id)
        VALUES($1,NULL,$2,$3,$4,'queued',now()+($5*interval '1 millisecond'),$6,0,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [operationId, input.requestedBy ?? null, input.type, input.idempotencyKey, deadlineMs, payloadHash,
        CONTENT_RUNTIME, JSON.stringify(input.payload), maxAttempts, input.scopeType, input.scopeId, input.sourceId ?? null])).rows[0];
      await query(`INSERT INTO transactional_outbox(id,session_id,user_id,aggregate_revision,event_type,payload,
        operation_id,scope_type,scope_id,source_id) VALUES($1,NULL,$2,0,$3,$4,$5,$6,$7,$8)`,
      [randomUUID(), input.requestedBy ?? null, input.type, JSON.stringify({ operationId }), operationId,
        input.scopeType, input.scopeId, input.sourceId ?? null]);
      return row;
    });
  },
};
