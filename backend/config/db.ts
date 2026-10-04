/**
 * @file config/db.ts
 * @description Neon PostgreSQL — the PRIMARY datastore.
 *
 * Users, sessions, resumes, gamification records and refresh tokens live in
 * Neon (serverless Postgres). Upstash Redis remains the SECONDARY store for
 * BullMQ job queues, response caches and the XP buffer.
 *
 * The schema is bootstrapped idempotently on boot (CREATE TABLE IF NOT
 * EXISTS) — no separate migration tooling needed for this project.
 */

import pg from "pg";
import { AsyncLocalStorage } from "node:async_hooks";

const { Pool } = pg;

const databaseUrl = process.env.DATABASE_URL || process.env.NEON_DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL (Neon Postgres connection string) is not set");
}

// Neon requires TLS; `channel_binding` in the URL is ignored by node-postgres.
// The generous connect timeout covers Neon free-tier cold starts (compute
// auto-suspends after inactivity and takes a few seconds to wake).
export const pool = new Pool({
  connectionString: databaseUrl,
  ssl: process.env.DATABASE_SSL === "false" && !["production", "staging"].includes(process.env.NODE_ENV || "")
    ? false : { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 30_000,
});

pool.on("error", (err) => {
  console.error("Unexpected Postgres pool error:", err.message);
});

/** Convenience query helper used by all repositories. */
const transactionClient = new AsyncLocalStorage<pg.PoolClient>();
export const query = async (text: string, params: any[] = []): Promise<pg.QueryResult> =>
  (transactionClient.getStore() || pool).query(text, params);

/** Serialize repository mutations across API processes, on one transaction/client.
 * Never hold this lock while waiting for an AI/provider request. */
export async function withDatabaseLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const existing = transactionClient.getStore();
  if (existing) {
    await existing.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [key]);
    return fn();
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [key]);
    const result = await transactionClient.run(client, fn);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
}
export const bootstrapSchema = () => pool.query(SCHEMA_SQL);

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password TEXT,
  google_id TEXT UNIQUE,
  preferred_role TEXT NOT NULL DEFAULT 'Full Stack Developer',
  xp INTEGER NOT NULL DEFAULT 0,
  current_level INTEGER NOT NULL DEFAULT 1,
  streak_days INTEGER NOT NULL DEFAULT 0,
  last_active_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Additive migrations (safe to re-run)
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;

CREATE TABLE IF NOT EXISTS refresh_tokens (
  token TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires ON refresh_tokens(expires_at);

CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  level TEXT NOT NULL,
  interview_type TEXT NOT NULL,
  company TEXT,
  company_track TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  overall_score INTEGER NOT NULL DEFAULT 0,
  avg_technical INTEGER NOT NULL DEFAULT 0,
  avg_confidence INTEGER NOT NULL DEFAULT 0,
  resume_id UUID,
  questions JSONB NOT NULL DEFAULT '[]'::jsonb,
  start_time TIMESTAMPTZ NOT NULL DEFAULT now(),
  end_time TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sessions_user_created ON sessions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_user_status ON sessions(user_id, status);

CREATE TABLE IF NOT EXISTS resumes (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  original_filename TEXT NOT NULL,
  stored_filename TEXT NOT NULL UNIQUE,
  file_type TEXT NOT NULL,
  file_size INTEGER NOT NULL DEFAULT 0,
  file_path TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  job_id TEXT,
  parsed_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  analysis_report JSONB NOT NULL DEFAULT '{}'::jsonb,
  jd_text TEXT,
  jd_match_report JSONB NOT NULL DEFAULT '{}'::jsonb,
  scores JSONB NOT NULL DEFAULT '{"ats":0,"overall":0,"jdMatch":0}'::jsonb,
  error TEXT,
  metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_resumes_user_created ON resumes(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS gamification (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  current_streak INTEGER NOT NULL DEFAULT 0,
  longest_streak INTEGER NOT NULL DEFAULT 0,
  last_activity_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  xp INTEGER NOT NULL DEFAULT 0,
  level INTEGER NOT NULL DEFAULT 1,
  badges JSONB NOT NULL DEFAULT '[]'::jsonb,
  achievements JSONB NOT NULL DEFAULT '[]'::jsonb,
  leaderboard_opt_in BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_gamification_xp ON gamification(xp DESC) WHERE leaderboard_opt_in = true;
`;

const connectDB = async (): Promise<void> => {
  const MAX_ATTEMPTS = 3;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const { rows } = await pool.query("SELECT version()");
      console.log(`Neon PostgreSQL Connected: ${rows[0].version.split(",")[0]}`);

      await bootstrapSchema();
      console.log("Postgres schema verified (primary datastore ready)");
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(
        `Error connecting to Neon PostgreSQL (attempt ${attempt}/${MAX_ATTEMPTS}): ${message}`
      );
      if (attempt === MAX_ATTEMPTS) {
        process.exit(1);
      }
      // Neon cold start — give the compute a moment to wake up
      await new Promise((resolve) => setTimeout(resolve, 5_000));
    }
  }
};

export default connectDB;
