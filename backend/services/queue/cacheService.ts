/**
 * @file services/queue/cacheService.ts
 * @description Redis-based caching layer for AI analysis results.
 *
 * Each pipeline step (process, analyze, match) produces deterministic output
 * for the same input.  We hash the input and store the JSON result in Redis
 * so that re-uploading the same resume (or resume+JD) skips the expensive
 * Groq API calls entirely.
 *
 * Cache keys follow the pattern:  resume-cache:<step>:<sha256>
 * Default TTL: 24 hours (configurable via CACHE_TTL_SECONDS env var).
 */

import { createHash } from "crypto";
import { connection } from "./queueService.js";

// Default cache lifetime — 24 hours.
const CACHE_TTL = parseInt(process.env.CACHE_TTL_SECONDS || "86400", 10);

const PREFIX = "resume-cache";

// ============================================================================
// Helpers
// ============================================================================

/**
 * Build a deterministic SHA-256 hash from an arbitrary string payload.
 */
const hashKey = (data: string): string =>
  createHash("sha256").update(data).digest("hex");

/**
 * Construct the full Redis key.
 * @param step  Pipeline step identifier ("process" | "analyze" | "match")
 * @param inputFingerprint  Raw string whose hash becomes the key suffix
 */
const buildKey = (step: string, inputFingerprint: string): string =>
  `${PREFIX}:${step}:${hashKey(inputFingerprint)}`;

// ============================================================================
// Public API
// ============================================================================

/**
 * Try to retrieve a cached result for a given pipeline step + input.
 * Returns the parsed object, or `null` on miss / error.
 */
export const getCachedResult = async (
  step: string,
  inputFingerprint: string
): Promise<any | null> => {
  try {
    const key = buildKey(step, inputFingerprint);
    const raw = await connection.get(key);
    if (raw) {
      console.log(`[Cache] HIT  — ${step} (key=${key.slice(0, 50)}…)`);
      return JSON.parse(raw);
    }
    console.log(`[Cache] MISS — ${step}`);
    return null;
  } catch (err) {
    // Cache failures must never break the pipeline — just log and continue.
    console.warn("[Cache] GET error (non-fatal):", err);
    return null;
  }
};

/**
 * Store a result in Redis with the configured TTL.
 */
export const setCachedResult = async (
  step: string,
  inputFingerprint: string,
  data: any
): Promise<void> => {
  try {
    const key = buildKey(step, inputFingerprint);
    await connection.set(key, JSON.stringify(data), "EX", CACHE_TTL);
    console.log(`[Cache] SET  — ${step} (ttl=${CACHE_TTL}s)`);
  } catch (err) {
    console.warn("[Cache] SET error (non-fatal):", err);
  }
};

/**
 * Invalidate (delete) a specific cached entry.
 */
export const invalidateCache = async (
  step: string,
  inputFingerprint: string
): Promise<void> => {
  try {
    const key = buildKey(step, inputFingerprint);
    await connection.del(key);
    console.log(`[Cache] DEL  — ${step}`);
  } catch (err) {
    console.warn("[Cache] DEL error (non-fatal):", err);
  }
};
