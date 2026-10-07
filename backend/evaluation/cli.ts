/** OS/database-authorized operator workflow, never a candidate-facing approval API. */
import "dotenv/config";
import {readFile,writeFile} from "node:fs/promises";
import {pool,query,withDatabaseLock} from "../config/db.js";
import {rubricEditor} from "./rubrics.js";
import {EvaluationError} from "./contracts.js";
const help=`Rubric operator workflow (requires authorized database access):
seed-drafts OUTPUT_FILE -- exports unreviewed proposals; no publication/review
draft PACKAGE_JSON -- persist a new immutable draft
inspect DRAFT_ID -- private packet and exact content hash
provisional DRAFT_ID HASH -- publish unreviewed, grounded practice rubric
approve DRAFT_ID HASH HUMAN_REVIEWER_ID -- attest actual review of exact packet
retire RUBRIC_VERSION_ID -- stop future use, preserve history
reevaluate ANSWER_ATTEMPT_ID OWNER_ID -- append a pinned revision, no score replacement/reward
Never infer review from question approval, register AI as human, or approve unread content.
Production/staging mutations require a trailing --apply.`;
async function main(){const [command,...args]=process.argv.slice(2);if(!command || command==="--help"){console.log(help);return;}
  if(["production","staging"].includes(process.env.NODE_ENV || "") && !["inspect","seed-drafts"].includes(command) && args.pop()!=="--apply")throw new EvaluationError("production_requires_apply");
  const counts:Record<string,number>={"seed-drafts":1,draft:1,inspect:1,provisional:2,approve:3,retire:1,reevaluate:2};if(args.length!==counts[command])throw new EvaluationError("invalid_arguments");
  if(command==="seed-drafts"){
    const seed=JSON.parse(await readFile(new URL("../../data/ingestion/junior-se-seed.json",import.meta.url),"utf8"));
    const documents=seed.documents as any[];const packets=[];
    for(const doc of documents)for(const q of doc.questions){
      const rows=(await query("SELECT id FROM question_versions WHERE question_text=$1 AND status='published' ORDER BY version DESC LIMIT 1",[q.text])).rows;
      if(rows.length)packets.push({question:q.text,reviewStatus:"draft",limitations:["Concept proposal derived from question editorial context, not a reviewed scoring rubric.","Add permitted reviewed technical-reference chunk IDs and verify observable concepts before publication."],package:{questionVersionId:rows[0].id,concepts:[{key:"core-explanation",label:"Core mechanism and reasoning",description:doc.text.slice(0,4000),importance:1,required:true,sourceIds:[]}]}});
    }
    await writeFile(args[0],JSON.stringify({reviewStatus:"draft",scoringVersion:"rubric-v1",packets},null,2),{flag:"wx",mode:0o600});console.log(JSON.stringify({draftPackets:packets.length,published:0}));return;
  }
  let result:unknown;
  if(command==="draft"){const file=await readFile(args[0]);if(file.length>100000)throw new EvaluationError("draft_byte_limit");result=await rubricEditor.createDraft(JSON.parse(file.toString()));}
  else if(command==="inspect")result=await rubricEditor.inspect(args[0]);
  else if(command==="provisional" || command==="approve")result={rubricVersionId:await rubricEditor.publish(args[0],args[1],command==="approve"?args[2]:undefined)};
  else if(command==="retire"){await withDatabaseLock("ingestion:editorial:v1",()=>query("UPDATE rubric_versions SET status='retired' WHERE id=$1",[args[0]]));result={retired:true};}
  else if(command==="reevaluate"){const {evaluationService}=await import("./service.js");const view=await evaluationService.reevaluate(args[1],args[0]);result={evaluationId:view.id,status:view.status};}
  console.log(JSON.stringify(result));
}
pool.removeAllListeners("error");pool.on("error",()=>console.error("Database unavailable"));
main().catch(e=>{console.error(JSON.stringify({error:e instanceof EvaluationError?e.code:"rubric_operation_failed"}));process.exitCode=1;}).finally(()=>pool.end());
