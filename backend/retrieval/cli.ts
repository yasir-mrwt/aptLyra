import "dotenv/config";
import { pool } from "../config/db.js";
import { embedCorpus } from "./corpus.js";
import { RetrievalService } from "./service.js";
import { RetrievalFailure } from "./contracts.js";

async function main() {
  pool.removeAllListeners("error");pool.on("error",()=>console.error("database_pool_error"));
  try {
    const [command,...args]=process.argv.slice(2);
    if(["production","staging"].includes(process.env.NODE_ENV || "") && args.pop()!=="--apply")throw new RetrievalFailure("production_requires_apply");
    if(command==="embed") {
      if(args.some(a=>a!=="--dry-run"))throw new RetrievalFailure("invalid_arguments");
      console.log(JSON.stringify(await embedCorpus(undefined,args.includes("--dry-run"))));
    } else if(command==="questions" || command==="references") {
      // CLI arguments are for public development queries only; no candidate data.
      if(!args[0] || args.length>2)throw new RetrievalFailure("invalid_arguments");
      const request={query:args[0],filters:args[1]?JSON.parse(args[1]):{}};
      const service=new RetrievalService();console.log(JSON.stringify(await (command==="questions"?service.retrieveQuestions(request):service.retrieveTechnicalEvidence(request))));
    } else throw new RetrievalFailure("usage_embed_or_questions_or_references");
  }catch(error) {
    console.error(JSON.stringify({error:error instanceof RetrievalFailure?error.code:"retrieval_failed",
      summary:(error as {summary?:unknown}).summary}));process.exitCode=1;
  }finally {await pool.end();}
}
void main();
