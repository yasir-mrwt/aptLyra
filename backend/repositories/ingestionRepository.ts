import { randomUUID } from "node:crypto";
import { query, withDatabaseLock } from "../config/db.js";
import { knowledgeRepository as knowledge } from "./knowledgeRepository.js";
import { fail, sha256, screen, normalize, validateContract, validateQuestion, parseEnvelope,
  readLocalFile, jaccard, textField, type AdapterContract, type DocumentEnvelope, type QuestionSpec } from "../ingestion/localAdapter.js";

const editorial = <T>(work: () => Promise<T>): Promise<T> => withDatabaseLock("ingestion:editorial:v1",work);
const reason = (value: string): string => /^[a-z][a-z0-9-]{1,99}$/.test(value) ? value : fail("invalid-reason-code");
const uuid = (value: string): string => /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value) ? value : fail("invalid-id");
const row = async (sql: string, values: unknown[]) => (await query(sql,values)).rows[0];
async function source(id: string, enabled = true) {
  const s = await row(`SELECT s.*,a.contract FROM sources s JOIN ingestion_adapters a ON a.source_id=s.id WHERE s.id=$1`,[uuid(id)]);
  if (!s || (enabled && (s.state!=="enabled" || s.permission_status!=="permitted" || s.review_status!=="approved"))) return fail("source-not-approved");
  const contract = validateContract(s.contract);
  if (contract.fixture && process.env.NODE_ENV!=="test") return fail("fixture-source-denied");
  return {...s,contract};
}
async function reviewer(id: string, contract: AdapterContract) {
  const r=await row("SELECT * FROM ingestion_reviewers WHERE id=$1 AND enabled",[id]);
  if (!r || (r.kind!=="human" && !(process.env.NODE_ENV==="test" && contract.fixture))) return fail("reviewer-not-authorized");
  return r;
}
async function event(sourceId: string, action: string, hash: string, recordId: string | null = null,
  reviewerId: string | null = null, candidateId: string | null = null, reasonCode: string | null = null) {
  await query(`INSERT INTO ingestion_review_events(id,source_id,record_id,candidate_id,action,reviewer_id,content_hash,reason_code)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,[randomUUID(),sourceId,recordId,candidateId,action,reviewerId,hash,reasonCode]);
}
async function record(id: string) {
  const r=await row(`SELECT r.*,v.normalized_text,v.content_hash,v.status AS document_status,v.document_id FROM ingestion_records r
    LEFT JOIN source_document_versions v ON v.id=r.document_version_id WHERE r.id=$1`,[uuid(id)]);
  if (!r) return fail("record-not-found");
  return r;
}
async function candidate(id: string) {
  const c=await row("SELECT * FROM ingestion_candidates WHERE id=$1",[uuid(id)]);
  if (!c) return fail("candidate-not-found");
  return c;
}
function matchHash(actual: string, expected: string) {
  if (actual!==expected || !/^[a-f0-9]{64}$/.test(expected)) fail("review-hash-mismatch");
}
function unexpired(r: any) {
  if (["rejected","withdrawn"].includes(r.state) || (!['published'].includes(r.state) && new Date(r.expires_at).getTime()<=Date.now())) fail("record-unavailable");
}
async function children(): Promise<Set<string>> {
  return new Set((await knowledge.listCompetencies("junior-se-v1")).filter(c=>c.kind==="child" && c.status==="active").map(c=>c.id));
}
async function duplicateDocuments(text: string, hash: string) {
  // Bounded comparisons fail closed when this preparatory corpus outgrows the
  // budget. Phase 5 must measure a scalable strategy, never silently skip dedupe.
  const rows=(await query(`SELECT v.id,v.content_hash,v.normalized_text FROM source_document_versions v
    JOIN source_documents d ON d.id=v.document_id JOIN sources s ON s.id=d.source_id
    WHERE v.status IN ('quarantined','published') AND v.normalized_text IS NOT NULL AND s.state='enabled' ORDER BY v.id LIMIT 1001`)).rows;
  if (rows.length>1000) fail("dedupe-budget-exceeded");
  return rows.map(v=>({documentVersionId:v.id,kind:v.content_hash===hash ? "exact" : "near",similarity:jaccard(text,v.normalized_text)}))
    .filter((v,i)=>rows[i].content_hash===hash || v.similarity>=0.8);
}
async function ingestDocument(s: any, envelope: DocumentEnvelope, inputHash: string, allowedChildren: Set<string>): Promise<string> {
  const id=randomUUID();
  const raw=JSON.stringify(envelope);
  const signals=screen(raw);
  let text: string | null = null, specs: QuestionSpec[]=[];
  let rejection: string | null = null;
  try {
    text=normalize(envelope.text);
    specs=envelope.questions.map(q=>validateQuestion(q,allowedChildren,text!));
    if (new Set(specs.map(q=>sha256(q.text))).size!==specs.length) fail("duplicate-question-specification");
  } catch (error) { rejection=error instanceof Error ? reason(error.message) : "invalid-envelope"; }
  if (signals.length || rejection) {
    // No raw/normalized text, title, experience metadata or candidate specs retained.
    await query(`INSERT INTO ingestion_records(id,source_id,input_hash,state,signals,reason_code) VALUES($1,$2,$3,'quarantined',$4,$5)`,
      [id,s.id,inputHash,JSON.stringify(signals.length ? signals : [rejection]),rejection || "screening-required"]);
    await event(s.id,"received",inputHash,id);
    return id;
  }
  text=text!;
  const hash=sha256(text), duplicates=await duplicateDocuments(text,hash);
  let doc=await row("SELECT id FROM source_documents WHERE source_id=$1 AND external_key=$2",[s.id,envelope.key]);
  if (!doc) doc={id:await knowledge.createDocument(s.id,envelope.key)};
  const version=(await row("SELECT COALESCE(max(version),0)+1 AS n FROM source_document_versions WHERE document_id=$1",[doc.id])).n;
  const docVersion=await knowledge.createDocumentVersion({documentId:doc.id,version,title:envelope.title,text,contentHash:hash,
    fetchedAt:new Date().toISOString(),occurredAt:envelope.experience?.occurredOn ? envelope.experience.occurredOn+"T00:00:00Z" : undefined,
    policyRevision:s.policy_revision,permissionStatus:"permitted",reviewStatus:"pending",quality:s.source_type==="voluntary-experience" ? "reported-experience" : "unverified",
    piiStatus:"pending",confidentialityStatus:"pending",status:"quarantined"});
  await query(`INSERT INTO source_chunks(id,document_version_id,chunk_index,excerpt,content_hash,chunker_version,section,start_offset,end_offset)
    VALUES($1,$2,0,$3,$4,'local-document-v1','document',0,$5)`,[randomUUID(),docVersion,text,hash,text.length]);
  await query(`INSERT INTO ingestion_records(id,source_id,document_version_id,input_hash,state,draft_questions,duplicates)
    VALUES($1,$2,$3,$4,'quarantined',$5,$6)`,[id,s.id,docVersion,inputHash,JSON.stringify(specs),JSON.stringify(duplicates)]);
  await event(s.id,"received",hash,id);
  await query("UPDATE ingestion_records SET state='normalized' WHERE id=$1",[id]);
  await event(s.id,"normalized",hash,id);
  if (envelope.experience) {
    const e=envelope.experience;
    await query(`INSERT INTO interview_experience_records(document_version_id,company_label,role,occurred_on,track,submitter_type,consent_evidence,permission_revision)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,[docVersion,e.company,e.role,e.occurredOn,e.track,e.submitterType,e.consentEvidence,e.permissionRevision]);
  }
  await query("UPDATE ingestion_records SET state='review_required' WHERE id=$1",[id]);
  await event(s.id,"review-required",hash,id);
  return id;
}
async function approveRecord(id: string, reviewerId: string, expectedHash: string, duplicateDecision?: string) {
  const r=await record(id), s=await source(r.source_id);
  await reviewer(reviewerId,s.contract); unexpired(r); matchHash(r.content_hash,expectedHash);
  if (r.state!=="review_required" || r.signals.length || !r.normalized_text) return fail("record-not-reviewable");
  if (r.duplicates.length && !["distinct","retain-provenance"].includes(duplicateDecision || "")) return fail("duplicate-review-required");
  // Exact duplicate is explicitly retained for provenance, never represented as distinct.
  if (r.duplicates.some((d:any)=>d.kind==="exact") && duplicateDecision!=="retain-provenance") return fail("exact-duplicate-decision");
  await query(`UPDATE ingestion_records SET state='approved',reviewed_by=$2,reviewed_at=now(),duplicate_decision=$3 WHERE id=$1`,[id,reviewerId,duplicateDecision || null]);
  await query(`UPDATE source_document_versions SET review_status='approved',reviewed_by=$2,reviewed_at=now(),pii_status='clear',confidentiality_status='clear' WHERE id=$1`,[r.document_version_id,reviewerId]);
  await event(s.id,"approved",expectedHash,id,reviewerId);
}
async function publishRecord(id: string) {
  const r=await record(id); await source(r.source_id); unexpired(r);
  if (r.state!=="approved") return fail("record-not-approved");
  await query("UPDATE source_document_versions SET status='published' WHERE id=$1",[r.document_version_id]);
  await query("UPDATE source_chunks SET status='active' WHERE document_version_id=$1",[r.document_version_id]);
  await query("UPDATE ingestion_records SET state='published' WHERE id=$1",[id]);
  await event(r.source_id,"published",r.content_hash,id,r.reviewed_by);
}
async function extract(id: string): Promise<string[]> {
  const r=await record(id); await source(r.source_id); unexpired(r);
  if (!["review_required","approved","published"].includes(r.state) || r.signals.length || !r.normalized_text) return fail("record-not-extractable");
  const existing=(await query("SELECT id FROM ingestion_candidates WHERE record_id=$1 ORDER BY id",[id])).rows;
  if (existing.length) return existing.map(c=>c.id);
  const chunk=await row("SELECT id FROM source_chunks WHERE document_version_id=$1 AND chunk_index=0 AND status<>'retired'",[r.document_version_id]);
  if (!chunk) return fail("chunk-not-available");
  const allowed=await children(), ids:string[]=[];
  const previous=(await query("SELECT id,content_hash,specification FROM ingestion_candidates WHERE state NOT IN ('rejected','withdrawn') ORDER BY id LIMIT 1001")).rows;
  if (previous.length>1000) return fail("dedupe-budget-exceeded");
  for (const proposed of r.draft_questions) {
    const spec=validateQuestion(proposed,allowed,r.normalized_text), hash=sha256(spec.text), start=r.normalized_text.indexOf(spec.text), cid=randomUUID();
    const links=previous.map(c=>({candidateId:c.id,kind:c.content_hash===hash ? "exact" : "near",similarity:jaccard(c.specification.text,spec.text)}))
      .filter((c,i)=>previous[i].content_hash===hash || c.similarity>=0.8);
    await query(`INSERT INTO ingestion_candidates(id,record_id,chunk_id,specification,content_hash,evidence_start,evidence_end,duplicate_links)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,[cid,id,chunk.id,JSON.stringify(spec),hash,start,start+spec.text.length,JSON.stringify(links)]);
    ids.push(cid); previous.push({id:cid,content_hash:hash,specification:spec});
  }
  await event(r.source_id,"extracted",r.content_hash,id);
  return ids;
}
async function approveCandidate(id: string, reviewerId: string, hash: string, duplicateDecision?: string) {
  const c=await candidate(id), r=await record(c.record_id), s=await source(r.source_id);
  await reviewer(reviewerId,s.contract); unexpired(r); matchHash(c.content_hash,hash);
  if (c.state!=="review_required") return fail("candidate-not-reviewable");
  if (c.duplicate_links.length && !["distinct","retain-provenance"].includes(duplicateDecision || "")) return fail("duplicate-review-required");
  if (c.duplicate_links.some((v:any)=>v.kind==="exact") && duplicateDecision!=="retain-provenance") return fail("exact-duplicate-decision");
  const spec=validateQuestion(c.specification,await children(),r.normalized_text);
  await query("UPDATE ingestion_candidates SET state='approved',reviewed_by=$2,reviewed_at=now() WHERE id=$1",[id,reviewerId]);
  await event(s.id,"approved",sha256(spec.text),r.id,reviewerId,id,duplicateDecision ? reason(duplicateDecision) : null);
}
async function publishCandidate(id: string): Promise<string> {
  const c=await candidate(id), r=await record(c.record_id); await source(r.source_id); unexpired(r);
  if (c.state!=="approved" || r.state!=="published" || r.document_status!=="published") return fail("candidate-not-approved");
  const spec=validateQuestion(c.specification,await children(),r.normalized_text);
  const qid=await knowledge.createQuestion({familyKey:`local:${id}`,taxonomyVersion:"junior-se-v1",primaryCompetency:spec.primary});
  const qv=await knowledge.createQuestionVersion({questionId:qid,version:1,text:spec.text,category:spec.category,difficulty:spec.difficulty,
    origin:"retrieved",evidenceStatus:"available",contentHash:c.content_hash,reviewedBy:c.reviewed_by,reviewedAt:new Date(c.reviewed_at).toISOString(),
    secondaryCompetencies:spec.secondary,generationMetadata:{extractionMethod:"structured-local-v1",model:null,promptVersion:null,roles:spec.roles,
      evidenceStart:c.evidence_start,evidenceEnd:c.evidence_end,reviewHints:["authored-selection-evidence-not-a-rubric"]},
    provenance:[{documentVersionId:r.document_version_id,chunkId:c.chunk_id,relation:"origin"}],publish:true});
  await query("UPDATE interview_questions SET status='active' WHERE id=$1",[qid]);
  await query("UPDATE ingestion_candidates SET state='published',question_version_id=$2 WHERE id=$1",[id,qv]);
  await event(r.source_id,"published",c.content_hash,r.id,c.reviewed_by,id);
  return qv;
}
async function withdrawRecord(id: string, reviewerId: string, code: string) {
  const r=await record(id), s=await source(r.source_id,false); await reviewer(reviewerId,s.contract);
  if (r.state==="withdrawn") return;
  const candidates=(await query("SELECT id,question_version_id FROM ingestion_candidates WHERE record_id=$1",[id])).rows;
  for (const c of candidates) if (c.question_version_id) await query("UPDATE question_versions SET status='retired' WHERE id=$1",[c.question_version_id]);
  await query(`UPDATE ingestion_candidates SET state='withdrawn',specification='{}',reason_code=$2 WHERE record_id=$1`,[id,reason(code)]);
  if (r.document_version_id) {
    await knowledge.withdrawDocumentVersion(r.document_version_id,reason(code));
    // Keep identity, date, role and unverified status; remove voluntary claim/consent text.
    await query(`UPDATE interview_experience_records SET company_label='withdrawn',track=NULL,consent_evidence='withdrawn' WHERE document_version_id=$1`,[r.document_version_id]);
  }
  await query(`UPDATE ingestion_records SET state='withdrawn',draft_questions='[]',reason_code=$2 WHERE id=$1`,[id,reason(code)]);
  await event(s.id,"withdrawn",r.content_hash || r.input_hash,id,reviewerId,null,code);
}

/** OS/DB-authorized internal editorial workflow. No HTTP routes, model calls or
 * private candidate-record access. Core publication uses Phase 3 primitives. */
export const ingestionRepository = {
  async registerReviewer(id: string, displayName: string, kind: "human" | "fixture") {
    if (!/^[a-z][a-z0-9-]{2,79}$/.test(id) || !["human","fixture"].includes(kind)) fail("invalid-reviewer");
    if (kind==="fixture" && process.env.NODE_ENV!=="test") fail("fixture-reviewer-denied");
    await query("INSERT INTO ingestion_reviewers(id,display_name,kind) VALUES($1,$2,$3)",[id,textField(displayName,200),kind]);
  },
  async registerSource(key: string, title: string, value: unknown): Promise<string> {
    const contract=validateContract(value);
    if (!contract.approvedInputHashes.length) fail("permission-hash-required");
    if (contract.fixture && process.env.NODE_ENV!=="test") fail("fixture-source-denied");
    return editorial(async()=>{
      const id=await knowledge.createSource({stableKey:textField(key,200),type:contract.sourceType,title:textField(title,300),
        policyRevision:"source-policy-v1",permissionStatus:"unknown",reviewStatus:"proposed",state:"disabled",
        termsRevision:contract.termsRevision,licenseId:contract.licenseId,permissionEvidence:contract.permissionEvidence,attribution:contract.attribution});
      await query("INSERT INTO ingestion_adapters(source_id,adapter_id,adapter_version,contract) VALUES($1,'local-file','1',$2)",[id,JSON.stringify(contract)]);
      return id;
    });
  },
  approveSource: (id: string, reviewerId: string, contractHash: string) => editorial(async()=>{
    const s=await source(id,false); await reviewer(reviewerId,s.contract); matchHash(sha256(JSON.stringify(s.contract)),contractHash);
    if (s.state!=="disabled" || s.review_status!=="proposed") return fail("source-not-reviewable");
    await query(`UPDATE sources SET permission_status='permitted',review_status='approved',state='enabled',reviewed_by=$2,reviewed_at=now() WHERE id=$1`,[id,reviewerId]);
    await event(id,"source-approved",contractHash,null,reviewerId);
  }),
  async ingestFile(sourceId: string, path: string): Promise<string[]> {
    // Reading outside SQL lock; rights are rechecked before any durable effect.
    const s=await source(sourceId), buffer=await readLocalFile(path,s.contract), inputHash=sha256(buffer);
    if (!s.contract.approvedInputHashes.includes(inputHash)) fail("input-hash-not-permitted");
    let envelopes: DocumentEnvelope[];
    try { envelopes=parseEnvelope(buffer,path,s.contract); } catch (error) {
      const code=error instanceof Error ? reason(error.message) : "invalid-envelope";
      return editorial(async()=>{
        await source(sourceId); const id=randomUUID();
        await query("INSERT INTO ingestion_records(id,source_id,input_hash,state,signals,reason_code) VALUES($1,$2,$3,'quarantined',$4,$5)",
          [id,sourceId,inputHash,JSON.stringify([code]),code]); await event(sourceId,"received",inputHash,id); return [id];
      });
    }
    return editorial(async()=>{
      const current=await source(sourceId);
      if (!current.contract.approvedInputHashes.includes(inputHash)) fail("input-hash-not-permitted");
      const last=await row("SELECT max(created_at) AS at FROM ingestion_records WHERE source_id=$1",[sourceId]);
      if (last.at && Date.now()-new Date(last.at).getTime()<current.contract.minIntervalMs) fail("source-rate-limit");
      const allowed=await children(), ids:string[]=[];
      for (const envelope of envelopes) ids.push(await ingestDocument(current,envelope,inputHash,allowed));
      return ids;
    });
  },
  inspect: (id: string) => editorial(async()=>{
    const r=await record(id);
    return {id:r.id,sourceId:r.source_id,state:r.state,inputHash:r.input_hash,contentHash:r.content_hash || null,
      signals:r.signals,duplicates:r.duplicates,expiresAt:r.expires_at,documentVersionId:r.document_version_id,
      candidates:(await query("SELECT id,state,content_hash,evidence_start,evidence_end,duplicate_links,question_version_id FROM ingestion_candidates WHERE record_id=$1 ORDER BY id",[id])).rows};
  }),
  inspectSource: async(id: string)=>{
    const s=await source(id,false); return {id:s.id,state:s.state,reviewStatus:s.review_status,contractHash:sha256(JSON.stringify(s.contract))};
  },
  approveDocument: (id: string, reviewerId: string, hash: string, duplicateDecision?: string)=>editorial(()=>approveRecord(id,reviewerId,hash,duplicateDecision)),
  // A separate explicit technical review; question-content approval cannot imply this.
  approveTechnicalReference: (id:string,reviewerId:string,hash:string,duplicateDecision?:string)=>editorial(async()=>{
    const r=await record(id),s=await source(r.source_id);
    if(s.source_type==="voluntary-experience")fail("experience-not-technical-reference");
    await approveRecord(id,reviewerId,hash,duplicateDecision);
    await query("UPDATE source_document_versions SET quality='technical-reference' WHERE id=$1 AND status='quarantined'",[r.document_version_id]);
  }),
  publishDocument: (id: string)=>editorial(()=>publishRecord(id)),
  extract: (id: string)=>editorial(()=>extract(id)),
  approveQuestion: (id: string, reviewerId: string, hash: string, duplicateDecision?: string)=>editorial(()=>approveCandidate(id,reviewerId,hash,duplicateDecision)),
  publishQuestion: (id: string)=>editorial(()=>publishCandidate(id)),
  rejectDocument: (id: string, reviewerId: string, code: string)=>editorial(async()=>{
    const r=await record(id), s=await source(r.source_id,false); await reviewer(reviewerId,s.contract); unexpired(r);
    if (!["quarantined","review_required","approved"].includes(r.state)) fail("record-not-rejectable");
    await withdrawRecord(id,reviewerId,reason(code));
    await query("UPDATE ingestion_records SET state='rejected' WHERE id=$1",[id]);
    await event(s.id,"rejected",r.content_hash || r.input_hash,id,reviewerId,null,code);
  }),
  rejectQuestion: (id: string, reviewerId: string, code: string)=>editorial(async()=>{
    const c=await candidate(id), r=await record(c.record_id), s=await source(r.source_id,false); await reviewer(reviewerId,s.contract);
    if (!["review_required","approved"].includes(c.state)) fail("candidate-not-rejectable");
    await query("UPDATE ingestion_candidates SET state='rejected',specification='{}',reason_code=$2 WHERE id=$1",[id,reason(code)]);
    await event(s.id,"rejected",c.content_hash,r.id,reviewerId,id,code);
  }),
  withdrawDocument: (id: string, reviewerId: string, code: string)=>editorial(()=>withdrawRecord(id,reviewerId,reason(code))),
  withdrawSource: (id: string, reviewerId: string, code: string)=>editorial(async()=>{
    const s=await source(id,false); await reviewer(reviewerId,s.contract);
    for (const r of (await query("SELECT id FROM ingestion_records WHERE source_id=$1 ORDER BY id",[id])).rows) await withdrawRecord(r.id,reviewerId,reason(code));
    await query("UPDATE sources SET state='suspended',permission_status='expired' WHERE id=$1",[id]);
    await event(id,"withdrawn",sha256(JSON.stringify(s.contract)),null,reviewerId,null,reason(code));
  }),
  withdrawQuestion: (id: string, reviewerId: string, code: string)=>editorial(async()=>{
    const c=await candidate(id), r=await record(c.record_id), s=await source(r.source_id,false); await reviewer(reviewerId,s.contract);
    if (c.question_version_id) await query("UPDATE question_versions SET status='retired' WHERE id=$1",[c.question_version_id]);
    await query("UPDATE ingestion_candidates SET state='withdrawn',specification='{}',reason_code=$2 WHERE id=$1",[id,reason(code)]);
    await event(s.id,"withdrawn",c.content_hash,r.id,reviewerId,id,code);
  }),
  expire: ()=>editorial(async()=>{
    const rows=(await query("SELECT id,document_version_id,input_hash,source_id FROM ingestion_records WHERE state IN ('quarantined','normalized','review_required','approved') AND expires_at<=now() ORDER BY id LIMIT 1000")).rows;
    for (const r of rows) {
      if (r.document_version_id) {
        await knowledge.withdrawDocumentVersion(r.document_version_id,"review-expired");
        await query("UPDATE interview_experience_records SET company_label='expired',track=NULL,consent_evidence='expired' WHERE document_version_id=$1",[r.document_version_id]);
      }
      await query("UPDATE ingestion_candidates SET state='withdrawn',specification='{}',reason_code='review-expired' WHERE record_id=$1",[r.id]);
      await query("UPDATE ingestion_records SET state='rejected',draft_questions='[]',reason_code='review-expired' WHERE id=$1",[r.id]);
      await event(r.source_id,"expired",r.input_hash,r.id,null,null,"review-expired");
    }
    return rows.length;
  }),
  /** One explicit operator approval binds the entire exact file hash. Transaction
   * rolls back on any signal/duplicate/invalid item; there is no automatic review. */
  approveBatch: (sourceId: string, inputHash: string, reviewerId: string)=>editorial(async()=>{
    const s=await source(sourceId); await reviewer(reviewerId,s.contract);
    const rows=(await query("SELECT r.id,v.content_hash FROM ingestion_records r JOIN source_document_versions v ON v.id=r.document_version_id WHERE r.source_id=$1 AND r.input_hash=$2 AND r.state='review_required' ORDER BY r.id",[sourceId,inputHash])).rows;
    const all=(await row("SELECT count(*)::int AS n FROM ingestion_records WHERE source_id=$1 AND input_hash=$2 AND state NOT IN ('withdrawn','rejected')",[sourceId,inputHash])).n;
    if (!rows.length || all!==rows.length) fail("batch-not-reviewable");
    const published:string[]=[];
    for (const r of rows) {
      await approveRecord(r.id,reviewerId,r.content_hash); await publishRecord(r.id);
      for (const id of await extract(r.id)) {
        const c=await candidate(id); await approveCandidate(id,reviewerId,c.content_hash); published.push(await publishCandidate(id));
      }
    }
    return {documents:rows.length,questions:published.length};
  }),
  manifest: ()=>editorial(async()=>{
    const rows=(await query(`SELECT c.id,c.state AS review_status,s.source_type,a.contract->>'fixture' AS fixture,
      q.primary_competency,q.category,q.difficulty,q.generation_metadata->'roles' AS roles,q.content_hash,
      c.specification->>'primary' AS proposed_primary,c.specification->>'category' AS proposed_category,c.specification->>'difficulty' AS proposed_difficulty,
      c.specification->'roles' AS proposed_roles,
      (q.status='published' AND v.status='published' AND s.state='enabled' AND s.permission_status='permitted' AND s.review_status='approved' AND ch.status='active') AS available
      FROM ingestion_candidates c JOIN ingestion_records r ON r.id=c.record_id JOIN sources s ON s.id=r.source_id
      JOIN ingestion_adapters a ON a.source_id=s.id JOIN source_document_versions v ON v.id=r.document_version_id
      JOIN source_chunks ch ON ch.id=c.chunk_id LEFT JOIN question_versions q ON q.id=c.question_version_id ORDER BY c.id`)).rows;
    const count=(values:string[])=>Object.fromEntries([...new Set(values)].sort().map(k=>[k,values.filter(v=>v===k).length]));
    const eligible=rows.filter(r=>r.available && r.fixture==='false');
    const proposed=rows.filter(r=>r.review_status==='review_required' && r.fixture==='false');
    const stats=(items:any[],draft=false)=>({total:items.length,
      roots:count(items.map(r=>String(draft?r.proposed_primary:r.primary_competency).split('.')[0])),
      children:count(items.map(r=>draft?r.proposed_primary:r.primary_competency)),
      categories:count(items.map(r=>draft?r.proposed_category:r.category)),difficulties:count(items.map(r=>draft?r.proposed_difficulty:r.difficulty)),
      sourceClasses:count(items.map(r=>r.source_type)),roles:count(items.flatMap(r=>draft?r.proposed_roles:r.roles))});
    return {schemaVersion:"corpus-manifest-v1",reviewed:stats(eligible),pending:stats(proposed,true),
      reviewStatus:count(rows.filter(r=>r.fixture==='false').map(r=>r.review_status)),fixtureCandidates:rows.filter(r=>r.fixture==='true').length,
      corpusHash:sha256(eligible.map(r=>r.content_hash).sort().join("\n"))};
  }),
};
