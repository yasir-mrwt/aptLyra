import { createHash, randomUUID } from "node:crypto";
import { query, withDatabaseLock } from "../config/db.js";
import { contentOperations } from "../runtime/contentOperations.js";

const digest=(value:string)=>createHash("sha256").update(value).digest("hex");
const safeCategory=(value:string)=>/^[a-z][a-z0-9-]{1,99}$/.test(value)?value:(()=>{throw new Error("invalid_source_request");})();
const allowedTypes=new Set(["official_api","rss_atom"]);
function validate(value:any){
  if(!value||typeof value!=="object"||Array.isArray(value)||!allowedTypes.has(value.sourceType)||typeof value.name!=="string"||!value.name.trim()||value.name.length>500||
    typeof value.baseUrl!=="string"||value.baseUrl.length>2000||typeof value.termsUrl!=="string"||value.termsUrl.length>2000||
    typeof value.permissionBasis!=="string"||!value.permissionBasis.trim()||value.permissionBasis.length>200||typeof value.permissionEvidence!=="string"||!value.permissionEvidence.trim()||value.permissionEvidence.length>4000||
    (value.attribution!==undefined&&(typeof value.attribution!=="string"||value.attribution.length>4000))||
    !Array.isArray(value.allowedHosts)||!value.allowedHosts.length||value.allowedHosts.length>10||value.allowedHosts.some((x:any)=>typeof x!=="string"||!/^(?:[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?)$/.test(x))||
    !Array.isArray(value.allowedPaths)||!value.allowedPaths.length||value.allowedPaths.length>20||value.allowedPaths.some((x:any)=>typeof x!=="string"||!x.startsWith("/")||x.length>300)||
    !Number.isInteger(value.intervalMinutes)||value.intervalMinutes<60||value.intervalMinutes>10080||
    (value.rawRetentionDays!==undefined&&(!Number.isInteger(value.rawRetentionDays)||value.rawRetentionDays<0||value.rawRetentionDays>30))||
    typeof value.fullTextStorage!=="boolean"||typeof value.derivedDataStorage!=="boolean"||typeof value.modelProcessingAllowed!=="boolean"||
    (value.permissionExpiresAt!==undefined&&value.permissionExpiresAt!==null&&(typeof value.permissionExpiresAt!=="string"||!Number.isFinite(Date.parse(value.permissionExpiresAt)))))throw new Error("invalid_source_request");
  const u=new URL(value.baseUrl);const terms=new URL(value.termsUrl);if(u.protocol!=="https:"||terms.protocol!=="https:"||u.username||u.password||u.search||u.hash||terms.username||terms.password||
    !value.allowedHosts.includes(u.hostname.toLowerCase())||!value.allowedPaths.includes(u.pathname))throw new Error("invalid_source_request");
  const scope={allowedHosts:[...new Set(value.allowedHosts.map((x:string)=>x.toLowerCase()))],allowedPaths:[...new Set(value.allowedPaths)],allowedQueryKeys:Array.isArray(value.allowedQueryKeys)?value.allowedQueryKeys.filter((x:any)=>typeof x==="string"&&x.length<100).slice(0,30):[],maxItems:100,maxPages:5};
  const permissionExpiresAt=value.permissionExpiresAt?new Date(value.permissionExpiresAt).toISOString():null;
  const evidenceHash=digest(JSON.stringify({sourceType:value.sourceType,baseUrl:u.toString(),termsUrl:terms.toString(),permissionBasis:value.permissionBasis.trim(),permissionEvidence:value.permissionEvidence.trim(),attribution:value.attribution||null,scope,fullTextStorage:value.fullTextStorage,derivedDataStorage:value.derivedDataStorage,modelProcessingAllowed:value.modelProcessingAllowed,intervalMinutes:value.intervalMinutes,rawRetentionDays:value.rawRetentionDays??7,permissionExpiresAt}));
  return { ...value, permissionExpiresAt, name:value.name.trim(), baseUrl:u.toString(),termsUrl:terms.toString(),permissionBasis:value.permissionBasis.trim(),permissionEvidence:value.permissionEvidence.trim(),scope,evidenceHash };
}
async function reviewer(userId:string){const r=(await query(`SELECT r.id,r.display_name,u.app_role FROM ingestion_reviewers r JOIN users u ON u.id=r.user_id
  WHERE r.user_id=$1 AND r.kind='human' AND r.enabled AND u.app_role IN ('owner','admin')`,[userId])).rows[0];if(!r)throw new Error("reviewer-not-authorized");return r;}
const sourceSelect=`SELECT s.id,s.title AS name,s.source_type,s.origin AS base_url,s.terms_url,s.permission_basis,s.permission_status,s.review_status,s.permission_evidence,
  s.attribution,s.reviewed_by,s.reviewed_at,s.state,s.allowed_scope,s.full_text_storage,s.derived_facts_storage,s.model_processing_allowed,s.raw_retention,
  s.collection_interval_minutes,s.last_collection_at,s.last_success_at,s.last_failure_code,s.last_failure_category,s.next_due_at,s.collection_cursor,s.source_health,s.withdrawn_at,s.withdrawal_reason,
  s.permission_evidence_hash,s.permission_reviewed_hash,s.permission_expires_at,a.adapter_id,
  (SELECT jsonb_build_object('status',r.status,'discovered',r.discovered_count,'imported',r.imported_count,'duplicates',r.duplicate_count,
    'quarantined',r.quarantined_count,'rejected',r.rejected_count,'errorCategory',r.safe_error_category,'completedAt',r.completed_at)
    FROM source_collection_runs r WHERE r.source_id=s.id ORDER BY r.created_at DESC LIMIT 1) AS last_safe_result
  FROM sources s LEFT JOIN ingestion_adapters a ON a.source_id=s.id`;
export const sourceRegistry={
  async list(userId:string){await reviewer(userId);return (await query(`${sourceSelect} ORDER BY s.created_at DESC LIMIT 200`)).rows;},
  async get(userId:string,id:string){await reviewer(userId);const row=(await query(`${sourceSelect} WHERE s.id=$1`,[id])).rows[0];if(!row)throw new Error("source-not-found");return row;},
  async create(userId:string,value:unknown){const who=await reviewer(userId),v=validate(value);return withDatabaseLock("source-registry:v1",async()=>{
    const id=randomUUID(),adapter=v.sourceType==="rss_atom"?"rss-atom":"official-api";
    await query(`INSERT INTO sources(id,stable_key,source_type,title,origin,policy_revision,permission_status,license_id,terms_revision,permission_evidence,attribution,
      review_status,state,adapter_name,terms_url,permission_basis,allowed_scope,rate_limit,raw_retention,full_text_storage,derived_facts_storage,model_processing_allowed,permission_evidence_hash,
      permission_reviewed_hash,permission_expires_at,collection_interval_minutes,next_due_at,source_health,attribution_required)
      VALUES($1,$2,$3,$4,$5,'content-policy-v1','unknown',NULL,NULL,$6,$7,'proposed','disabled',$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,NULL,$18,$19,$20,'disabled',$21)`,
    [id,`registry:${id}`,v.sourceType,v.name,v.baseUrl,v.permissionEvidence,v.attribution||null,adapter,v.termsUrl,v.permissionBasis,JSON.stringify(v.scope),JSON.stringify({minimumIntervalMs:3600000}),`${Math.min(30,Math.max(0,v.rawRetentionDays??7))} days`,v.fullTextStorage,v.derivedDataStorage,v.modelProcessingAllowed,v.evidenceHash,v.permissionExpiresAt,v.intervalMinutes,new Date(Date.now()+v.intervalMinutes*60000).toISOString(),Boolean(v.attribution)]);
    await query("INSERT INTO ingestion_adapters(source_id,adapter_id,adapter_version,contract) VALUES($1,$2,'1',$3)",[id,adapter,JSON.stringify({fixture:false,contract:adapter==="rss-atom"?"rss-atom-v1":"official-api-v1"})]);
    return {id,state:"disabled",permissionStatus:"unknown",reviewStatus:"proposed",createdBy:who.id};
  });},
  async update(userId:string,id:string,value:unknown){const who=await reviewer(userId),v=validate(value);return withDatabaseLock("source-registry:v1",async()=>{
    const old=(await query("SELECT permission_evidence_hash,withdrawn_at FROM sources WHERE id=$1 FOR UPDATE",[id])).rows[0];if(!old||old.withdrawn_at)throw new Error("source-not-found");
    const permissionChanged=old.permission_evidence_hash!==v.evidenceHash;
    const adapter=v.sourceType==="rss_atom"?"rss-atom":"official-api";
    await query(`UPDATE sources SET title=$2,source_type=$3,origin=$4,terms_url=$5,permission_basis=$6,permission_evidence=$7,attribution=$8,
      allowed_scope=$9,full_text_storage=$10,derived_facts_storage=$11,model_processing_allowed=$12,permission_evidence_hash=$13,
      collection_interval_minutes=$14,raw_retention=$15,attribution_required=$16,permission_expires_at=$18,
      permission_status=CASE WHEN $17 THEN 'unknown' ELSE permission_status END,review_status=CASE WHEN $17 THEN 'proposed' ELSE review_status END,
      reviewed_by=CASE WHEN $17 THEN NULL ELSE reviewed_by END,reviewed_at=CASE WHEN $17 THEN NULL ELSE reviewed_at END,
      permission_reviewed_hash=CASE WHEN $17 THEN NULL ELSE permission_reviewed_hash END,
      state=CASE WHEN $17 THEN 'disabled' ELSE state END,source_health=CASE WHEN $17 THEN 'disabled' ELSE source_health END,
      next_due_at=CASE WHEN $17 THEN NULL ELSE next_due_at END,updated_at=now() WHERE id=$1`,
    [id,v.name,v.sourceType,v.baseUrl,v.termsUrl,v.permissionBasis,v.permissionEvidence,v.attribution||null,JSON.stringify(v.scope),v.fullTextStorage,v.derivedDataStorage,
      v.modelProcessingAllowed,v.evidenceHash,v.intervalMinutes,`${v.rawRetentionDays??7} days`,Boolean(v.attribution),permissionChanged,v.permissionExpiresAt]);
    await query("UPDATE ingestion_adapters SET adapter_id=$2,contract=$3 WHERE source_id=$1",[id,adapter,JSON.stringify({fixture:false,contract:adapter==="rss-atom"?"rss-atom-v1":"official-api-v1"})]);
    return {id,updatedBy:who.display_name,permissionReviewRequired:permissionChanged,state:permissionChanged?"disabled":undefined};
  });},
  async reviewPermission(userId:string,id:string,expectedHash:string){const who=await reviewer(userId);return withDatabaseLock("source-registry:v1",async()=>{
    const s=(await query(`SELECT id,permission_evidence_hash,permission_expires_at,state,withdrawn_at FROM sources WHERE id=$1 FOR UPDATE`,[id])).rows[0];if(!s||s.withdrawn_at)throw new Error("source-not-found");
    if(s.permission_expires_at&&new Date(s.permission_expires_at).getTime()<=Date.now())throw new Error("source-permission-expired");
    if(!/^[a-f0-9]{64}$/.test(expectedHash)||s.permission_evidence_hash!==expectedHash)throw new Error("permission-hash-mismatch");
    await query(`UPDATE sources SET permission_status='permitted',review_status='approved',reviewed_by=$2,reviewed_at=now(),last_verified_at=now(),permission_reviewed_hash=$3,
      terms_revision=$4,updated_at=now() WHERE id=$1`,[id,who.id,expectedHash,`terms-review-${expectedHash.slice(0,32)}`]);
    return {id,reviewStatus:"approved",permissionStatus:"permitted",reviewedBy:who.display_name,reviewedAt:new Date().toISOString(),permissionHash:expectedHash};
  });},
  async setEnabled(userId:string,id:string,enabled:boolean){const who=await reviewer(userId);return withDatabaseLock("source-registry:v1",async()=>{
    const s=(await query("SELECT * FROM sources WHERE id=$1 FOR UPDATE",[id])).rows[0];if(!s||s.withdrawn_at)throw new Error("source-not-found");
    if(enabled&&(s.permission_status!=="permitted"||s.review_status!=="approved"||!s.reviewed_at||!s.reviewed_by||s.permission_reviewed_hash!==s.permission_evidence_hash||(s.permission_expires_at&&new Date(s.permission_expires_at).getTime()<=Date.now())))throw new Error("source-permission-required");
    await query("UPDATE sources SET state=$2,source_health=$3,next_due_at=CASE WHEN $2='enabled' THEN COALESCE(next_due_at,now()) ELSE NULL END,updated_at=now() WHERE id=$1",[id,enabled?"enabled":"disabled",enabled?"healthy":"disabled"]);
    return {id,state:enabled?"enabled":"disabled",changedBy:who.display_name};
  });},
  async withdraw(userId:string,id:string,reason:string){const who=await reviewer(userId);if(!reason.trim()||reason.length>1000)throw new Error("invalid_source_request");return withDatabaseLock("source-registry:v1",async()=>{
    const s=(await query("UPDATE sources SET state='suspended',source_health='withdrawn',withdrawn_at=now(),withdrawal_reason=$2,next_due_at=NULL,updated_at=now() WHERE id=$1 AND withdrawn_at IS NULL RETURNING id",[id,reason.trim()])).rows[0];if(!s)throw new Error("source-not-found");
    const pending=(await query(`UPDATE durable_operations SET status='terminal_failed',error_code='source_withdrawn',next_retry_at=NULL,
      lease_owner=NULL,lease_token=NULL,lease_expires_at=NULL,updated_at=now() WHERE source_id=$1 AND runtime_version=$2
      AND operation_type IN ('source_collection','source_extraction') AND status IN ('queued','retryable_failed') RETURNING id,operation_type,payload`,[id,"aptlyra-content-v1"])).rows;
    for(const op of pending){
      await query("UPDATE transactional_outbox SET status='failed',published_at=NULL,updated_at=now() WHERE operation_id=$1",[op.id]);
      if(op.operation_type==="source_collection"&&typeof op.payload?.runId==="string")await query(`UPDATE source_collection_runs SET status='cancelled',completed_at=now(),safe_error_category='source_withdrawn'
        WHERE id=$1 AND status IN ('queued','retryable_failed')`,[op.payload.runId]);
    }
    await query("UPDATE source_document_versions v SET status='withdrawn',withdrawal_reason='source-withdrawn',normalized_text=NULL,redacted_at=now() FROM source_documents d WHERE d.id=v.document_id AND d.source_id=$1 AND v.status<>'withdrawn'",[id]);
    await query("UPDATE source_chunks c SET status='retired',excerpt=NULL,redacted_at=now() FROM source_document_versions v JOIN source_documents d ON d.id=v.document_id WHERE c.document_version_id=v.id AND d.source_id=$1",[id]);
    return {id,state:"withdrawn",changedBy:who.display_name};
  });},
  async collect(userId:string,id:string,trigger:"manual"|"retry"="manual") {await reviewer(userId);return queueCollection(id,trigger,userId);},
  async history(userId:string,id:string){await reviewer(userId);return (await query(`SELECT id,operation_id,trigger,status,started_at,completed_at,discovered_count,imported_count,duplicate_count,quarantined_count,rejected_count,safe_error_category,created_at
    FROM source_collection_runs WHERE source_id=$1 ORDER BY created_at DESC LIMIT 100`,[id])).rows;},
};
export async function queueCollection(id:string,trigger:"scheduled"|"manual"|"retry",requestedBy?:string){
  const s=(await query("SELECT id,source_health,collection_interval_minutes,last_collection_at FROM sources WHERE id=$1 AND state='enabled' AND withdrawn_at IS NULL AND (permission_expires_at IS NULL OR permission_expires_at>now()) AND full_text_storage=true AND permission_status='permitted' AND review_status='approved' AND permission_reviewed_hash=permission_evidence_hash AND permission_evidence_hash IS NOT NULL AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL",[id])).rows[0];
  if(!s)throw new Error("source-permission-required");
  const active=(await query(`SELECT r.id AS run_id,o.id AS operation_id,o.status FROM source_collection_runs r JOIN durable_operations o ON o.id=r.operation_id
    WHERE r.source_id=$1 AND o.status IN ('queued','running','retryable_failed') ORDER BY r.created_at DESC LIMIT 1`,[id])).rows[0];
  if(active)return {runId:active.run_id,operationId:active.operation_id,status:active.status};
  const runId=randomUUID();
  if(trigger==="manual"&&s.last_collection_at&&Date.now()-new Date(s.last_collection_at).getTime()<s.collection_interval_minutes*60_000)throw new Error("source-rate-limit");
  const key=trigger==="scheduled"?`due:${Math.floor(Date.now()/(s.collection_interval_minutes*60000))}`:`${trigger}:${randomUUID()}`;
  let op;
  try{op=await contentOperations.enqueue({type:"source_collection",scopeType:"source",scopeId:id,sourceId:id,idempotencyKey:key,payload:{runId,trigger},requestedBy,maxAttempts:3});}
  catch(error){const competing=(await query(`SELECT r.id AS run_id,o.id AS operation_id,o.status FROM source_collection_runs r JOIN durable_operations o ON o.id=r.operation_id
      WHERE r.source_id=$1 AND o.status IN ('queued','running','retryable_failed') ORDER BY r.created_at DESC LIMIT 1`,[id])).rows[0];if(competing)return {runId:competing.run_id,operationId:competing.operation_id,status:competing.status};throw error;}
  await query(`INSERT INTO source_collection_runs(id,source_id,operation_id,requested_by,trigger,status) VALUES($1,$2,$3,$4,$5,'queued')
    ON CONFLICT(operation_id) WHERE operation_id IS NOT NULL DO NOTHING`,[runId,id,op.id,requestedBy||null,trigger]);
  return {runId,operationId:op.id,status:op.status};
}
export async function scheduleDueSources(){
  const due=(await query(`SELECT id FROM sources WHERE state='enabled' AND withdrawn_at IS NULL AND (permission_expires_at IS NULL OR permission_expires_at>now()) AND full_text_storage=true AND permission_status='permitted' AND review_status='approved'
    AND permission_evidence_hash IS NOT NULL AND permission_reviewed_hash=permission_evidence_hash AND next_due_at<=now()
    ORDER BY next_due_at LIMIT 50`)).rows;
  let queued=0;for(const s of due){try{await queueCollection(s.id,"scheduled");queued++;}catch{/* competing scheduler or source transition; next tick rechecks durable state */}}
  const maintenanceScope="00000000-0000-4000-8000-000000000001";
  await contentOperations.enqueue({type:"retention_expiry",scopeType:"maintenance",scopeId:maintenanceScope,
    idempotencyKey:`retention:${new Date().toISOString().slice(0,10)}`,payload:{scheduled:true},maxAttempts:3}).catch(()=>{});
  return queued;
}
export const safeFailureCategory=(message:string)=>safeCategory(({rate_limited:"rate_limited",permission_expired:"permission_expired",invalid_payload:"invalid_payload",authentication_required:"authentication_required",terms_review_required:"terms_review_required",source_format_changed:"source_format_changed"} as Record<string,string>)[message]||"network_failure");
