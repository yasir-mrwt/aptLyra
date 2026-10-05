import { fileURLToPath } from "node:url";
import { readLocalFile, parseEnvelope, sha256, validateContract } from "./localAdapter.js";

// Reproducible artifact inventory; publication counts come from the database CLI.
const path=fileURLToPath(new URL("../../data/ingestion/junior-se-seed.json",import.meta.url));
const reviewPath=fileURLToPath(new URL("../../../docs/seed-review.md",import.meta.url));
const attestationPath=fileURLToPath(new URL("../../data/ingestion/seed-review-attestation.json",import.meta.url));
const contract=validateContract({adapterId:"local-file",version:"1",sourceType:"authored",allowedInputs:[path,reviewPath,attestationPath],approvedInputHashes:[],
  permissionEvidence:"Inventory only; exact human review is verified below",licenseId:"inventory-only",termsRevision:"local-authored-v1",attribution:"TechVera AI-assisted original draft",
  authentication:"operator-filesystem",refresh:"manual",maxBytes:262144,timeoutMs:5000,maxDocuments:80,minIntervalMs:0,
  timestampSemantics:"occurrence-explicit-fetch-observed",withdrawal:"retire-and-redact",retainRaw:false,fixture:false});
async function main() {
  const buffer=await readLocalFile(path,contract), docs=parseEnvelope(buffer,path,contract);
  const packet=await readLocalFile(reviewPath,contract);
  const attestation=JSON.parse((await readLocalFile(attestationPath,contract)).toString('utf8'));
  const concordant=attestation.approvedArtifactHash==='be9d40c94f1941374a7332fd4b15cbe940ab6cc4e58495b4a0877c40cfb7b7cd' &&
    attestation.linkedCorpusInputHash==='b85d0e09bb94eaf6751a0ae3a86ffb1f76169ee4faf6e314b60f579cee69e995' &&
    attestation.reviewer.id==='muhammad-yasir' && attestation.reviewer.name==='Muhammad Yasir' &&
    sha256(buffer)===attestation.linkedCorpusInputHash && sha256(packet)===attestation.approvedArtifactHash &&
    packet.toString('utf8').includes(sha256(buffer)) && docs.every(d=>{
      const q=d.questions[0] as {primary:string;category:string;difficulty:string;secondary:string[];roles:string[]};
      return packet.toString('utf8').includes(d.text) && packet.toString('utf8').includes(`${q.category} / ${q.difficulty} / \`${q.primary}\``) &&
        q.secondary.length===0 && JSON.stringify(q.roles)===JSON.stringify(['Software Engineer','Backend Developer','Full Stack Developer']);
    });
  if (!concordant) throw new Error('review-artifact-mismatch');
  const questions=docs.flatMap(d=>d.questions) as {primary:string;category:string;difficulty:string;roles:string[]}[];
  const count=(values:string[])=>Object.fromEntries([...new Set(values)].sort().map(k=>[k,values.filter(v=>v===k).length]));
  console.log(JSON.stringify({schemaVersion:"seed-artifact-manifest-v1",inputHash:sha256(buffer),
    sourceClass:"authored",authorship:"TechVera original AI-assisted authored material",reviewStatus:"human-reviewed-artifacts",
    reviewer:attestation.reviewer,approvedReviewArtifactHash:attestation.approvedArtifactHash,reviewedQuestionArtifacts:questions.length,publishedQuestions:"query-ingestion-manifest",
    documents:docs.length,questions:questions.length,roots:count(questions.map(q=>q.primary.split('.')[0])),children:count(questions.map(q=>q.primary)),
    categories:count(questions.map(q=>q.category)),difficulties:count(questions.map(q=>q.difficulty)),roles:count(questions.flatMap(q=>q.roles))},null,2));
}
main().catch(()=>{console.error('seed-manifest-validation-failed');process.exitCode=1;});
