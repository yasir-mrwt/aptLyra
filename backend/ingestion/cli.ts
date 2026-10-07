import "dotenv/config";
import { open } from "node:fs/promises";
import { constants } from "node:fs";
import { fail, IngestionError, decode } from "./localAdapter.js";

async function configFile(path: string): Promise<unknown> {
  const file=await open(path,constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const stat=await file.stat();
    if (!stat.isFile() || stat.size>16384) fail("config-file-limit");
    const buffer=Buffer.alloc(16385), {bytesRead}=await file.read(buffer,0,buffer.length,0);
    if (bytesRead>16384) fail("config-file-limit");
    try { return JSON.parse(decode(buffer.subarray(0,bytesRead))); } catch { return fail("invalid-config-json"); }
  } finally { await file.close(); }
}
const help=`Internal CLI; requires authorized OS/database access. No public API.
register-reviewer ID DISPLAY_NAME human
register-source STABLE_KEY TITLE CONTRACT_JSON
inspect-source SOURCE_ID
approve-source SOURCE_ID REVIEWER_ID CONTRACT_HASH
ingest SOURCE_ID CANONICAL_ALLOWED_FILE
inspect RECORD_ID
approve-document RECORD_ID REVIEWER_ID CONTENT_HASH [distinct|retain-provenance]
approve-reference RECORD_ID REVIEWER_ID CONTENT_HASH [distinct|retain-provenance]
publish-document RECORD_ID
extract RECORD_ID
approve-question CANDIDATE_ID REVIEWER_ID CONTENT_HASH [distinct|retain-provenance]
publish-question CANDIDATE_ID
reject-document RECORD_ID REVIEWER_ID REASON_CODE
reject-question CANDIDATE_ID REVIEWER_ID REASON_CODE
withdraw-source SOURCE_ID REVIEWER_ID REASON_CODE
withdraw-document RECORD_ID REVIEWER_ID REASON_CODE
withdraw-question CANDIDATE_ID REVIEWER_ID REASON_CODE
approve-batch SOURCE_ID EXACT_INPUT_SHA256 REVIEWER_ID
expire
manifest
Approval commands attest actual human permission/PII/technical editorial review.
Never register a model as human, infer consent, or approve unread material.`;

async function main() {
  const [command,...args]=process.argv.slice(2);
  if (!command || command==="--help") { console.log(help); return; }
  if (["production","staging"].includes(process.env.NODE_ENV || "")) {
    // Deliberate launch gate in addition to OS/database authorization.
    if (args.pop()!=="--apply") fail("production-requires-apply");
  }
  const {pool}=await import("../config/db.js");
  // Override the baseline process logger only in this separate CLI process.
  // Unexpected idle-client errors must not print driver payloads/SQL content.
  pool.removeAllListeners("error");
  pool.on("error",()=>console.error(JSON.stringify({error:"database-pool-error"})));
  try {
    const {ingestionRepository:r}=await import("../repositories/ingestionRepository.js");
    const arity:Record<string,[number,number]>={"register-reviewer":[3,3],"register-source":[3,3],"inspect-source":[1,1],"approve-source":[3,3],ingest:[2,2],inspect:[1,1],
      "approve-document":[3,4],"approve-reference":[3,4],"publish-document":[1,1],extract:[1,1],"approve-question":[3,4],"publish-question":[1,1],"reject-document":[3,3],"reject-question":[3,3],
      "withdraw-source":[3,3],"withdraw-document":[3,3],"withdraw-question":[3,3],"approve-batch":[3,3],expire:[0,0],manifest:[0,0]};
    if (!arity[command] || args.length<arity[command][0] || args.length>arity[command][1]) fail("invalid-command-arguments");
    let result: unknown={ok:true};
    const [a,b,c,d]=args;
    switch (command) {
    case "register-reviewer": if(c!=="human") fail("human-reviewer-required"); await r.registerReviewer(a,b,"human"); break;
    case "register-source": result={sourceId:await r.registerSource(a,b,await configFile(c))}; break;
    case "inspect-source": result=await r.inspectSource(a); break;
    case "approve-source": await r.approveSource(a,b,c); break;
    case "ingest": result={recordIds:await r.ingestFile(a,b)}; break;
    case "inspect": result=await r.inspect(a); break;
    case "approve-document": await r.approveDocument(a,b,c,d); break;
    case "approve-reference": await r.approveTechnicalReference(a,b,c,d); break;
    case "publish-document": await r.publishDocument(a); break;
    case "extract": result={candidateIds:await r.extract(a)}; break;
    case "approve-question": await r.approveQuestion(a,b,c,d); break;
    case "publish-question": result={questionVersionId:await r.publishQuestion(a)}; break;
    case "reject-document": await r.rejectDocument(a,b,c); break;
    case "reject-question": await r.rejectQuestion(a,b,c); break;
    case "withdraw-source": await r.withdrawSource(a,b,c); break;
    case "withdraw-document": await r.withdrawDocument(a,b,c); break;
    case "withdraw-question": await r.withdrawQuestion(a,b,c); break;
    case "approve-batch": result=await r.approveBatch(a,b,c); break;
    case "expire": result={expired:await r.expire()}; break;
    case "manifest": result=await r.manifest(); break;
    }
    console.log(JSON.stringify(result));
  } finally { await pool.end(); }
}
main().catch(error=>{
  console.error(JSON.stringify({error:error instanceof IngestionError ? error.code : "ingestion-operation-failed"}));
  process.exitCode=1;
});
