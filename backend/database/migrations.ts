import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import type { Pool } from "pg";

export const migrationDirectory = fileURLToPath(new URL("../../migrations/", import.meta.url));
export interface MigrationResult { applied: string[]; current: string[] }

/** Explicit invocation only. One database-wide lock, one transaction per file. */
export async function runMigrations(database: Pool, directory = migrationDirectory): Promise<MigrationResult> {
  const names = (await readdir(directory)).filter(name => name.endsWith(".sql")).sort();
  if (!names.length || names.some(name => !/^\d{3}_[a-z0-9_]+\.sql$/.test(name))) {
    throw new Error("Migration directory must contain ordered NNN_name.sql files");
  }
  if (new Set(names.map(name => name.slice(0, 3))).size !== names.length) {
    throw new Error("Duplicate migration sequence number");
  }
  const files = await Promise.all(names.map(async name => {
    const sql = await readFile(`${directory}/${name}`, "utf8");
    return { name, sql, checksum: createHash("sha256").update(sql).digest("hex") };
  }));
  const client = await database.connect();
  let locked = false;
  try {
    await client.query("SET lock_timeout = '10s'");
    await client.query("SET statement_timeout = '120s'");
    await client.query("SELECT pg_advisory_lock(hashtextextended($1, 0))", ["techvera:migrations:v1"]);
    locked = true;
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      checksum TEXT NOT NULL CHECK (checksum ~ '^[0-9a-f]{64}$'),
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
    const history = await client.query<{ name: string; checksum: string }>(
      "SELECT name, checksum FROM schema_migrations ORDER BY name"
    );
    history.rows.forEach((row, index) => {
      if (files[index]?.name !== row.name || files[index]?.checksum !== row.checksum) {
        throw new Error(`Migration history mismatch at ${row.name}; restore applied files before proceeding`);
      }
    });
    const applied: string[] = [];
    for (const file of files.slice(history.rows.length)) {
      await client.query("BEGIN");
      try {
        await client.query("SET LOCAL lock_timeout = '10s'");
        await client.query("SET LOCAL statement_timeout = '120s'");
        await client.query(file.sql);
        await client.query("INSERT INTO schema_migrations(name, checksum) VALUES ($1, $2)", [file.name, file.checksum]);
        await client.query("COMMIT");
        applied.push(file.name);
      } catch (error) {
        await client.query("ROLLBACK");
        const code = (error as { code?: string }).code || "unknown";
        const detail = code === "55000" ? "; pgvector must be installed on this PostgreSQL server" : "";
        const failure = new Error(`Migration ${file.name} rolled back (${code})${detail}`);
        Object.defineProperty(failure, "cause", { value: error });
        throw failure;
      }
    }
    return { applied, current: files.map(file => file.name) };
  } finally {
    try {
      if (locked) await client.query("SELECT pg_advisory_unlock(hashtextextended($1, 0))", ["techvera:migrations:v1"]);
    } finally {
      try { await client.query("RESET lock_timeout; RESET statement_timeout"); }
      finally { client.release(); }
    }
  }
}
