import "dotenv/config";
import { pool } from "../config/db.js";
import { roleManagement } from "./roleManagement.js";

function option(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main() {
  const email = option("--email");
  const confirmEmail = option("--confirm-email");
  if (!email || !confirmEmail || !process.argv.includes("--apply")) {
    throw new Error("usage: npm run admin:bootstrap-owner -- --email ACCOUNT_EMAIL --confirm-email ACCOUNT_EMAIL --apply");
  }
  const result = await roleManagement.bootstrapInitialOwner(email, confirmEmail);
  process.stdout.write(`Initial owner assigned: ${result.email} (${result.role}).\n`);
}

main().catch(error => {
  const code = error instanceof Error ? error.message.split(":")[0] : "owner-bootstrap-failed";
  process.stderr.write(`Owner bootstrap failed: ${code}.\n`);
  process.exitCode = 1;
}).finally(async () => { await pool.end(); });
