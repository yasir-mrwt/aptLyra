/**
 * @file config/redisConfig.ts
 * @description Shared Upstash Redis client (ioredis) — the SECONDARY store.
 *
 * Neon PostgreSQL holds the primary data; this Redis instance powers the
 * fast-moving parts: BullMQ job queues, ML result caches, resume view cache
 * and the atomic XP buffer. Configured for Upstash's TLS endpoint
 * (rediss://) and BullMQ-compatible (maxRetriesPerRequest: null).
 *
 * Env vars (first match wins):
 *   UPSTASH_REDIS_URL — rediss://default:<password>@<endpoint>.upstash.io:6379
 *   REDIS_URL         — kept as an alias for local dev / other providers
 */
import Redis from 'ioredis';

const redisUrl =
  process.env.UPSTASH_REDIS_URL ||
  process.env.REDIS_URL ||
  'redis://localhost:6379';

if (
  (process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'staging') &&
  !process.env.UPSTASH_REDIS_URL &&
  !process.env.REDIS_URL
) {
  throw new Error(
    'UPSTASH_REDIS_URL (or REDIS_URL) environment variable is required in production/staging environments.'
  );
}

const isTls = redisUrl.startsWith('rediss://');

const redisClient = new Redis(redisUrl, {
  // Required by BullMQ — commands must never fail fast while reconnecting.
  maxRetriesPerRequest: null,
  // Upstash terminates TLS itself; rejectUnauthorized relaxed for managed certs.
  ...(isTls && { tls: { rejectUnauthorized: false } }),
});

redisClient.on('error', () => {
  // Driver errors can contain AUTH command arguments; never log the raw object.
  console.error('Redis connection unavailable. Durable interview work remains in PostgreSQL.');
});

redisClient.on('connect', () => {
  console.log('Connected to Upstash Redis successfully');
});

// The server owns shutdown ordering: stop durable workers before closing Redis/PostgreSQL.
export default redisClient;
