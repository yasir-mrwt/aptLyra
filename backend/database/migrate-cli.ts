import "dotenv/config";
import { pool } from "../config/db.js";
import { runMigrations } from "./migrations.js";

async function main() {
try {
  if (["production", "staging"].includes(process.env.NODE_ENV || "") && !process.argv.includes("--apply")) {
    throw new Error("Production/staging migrations require explicit --apply; use the reviewed release step");
  }
  const result = await runMigrations(pool);
  console.log(`Migrations current: ${result.current.length}; applied: ${result.applied.join(", ") || "none"}`);
} catch (error) {
  // Do not print SQL, connection strings or nested driver errors.
  console.error(error instanceof Error ? error.message : "Migration failed");
  process.exitCode = 1;
} finally { await pool.end(); }
}
void main();
