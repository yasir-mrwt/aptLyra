import { randomUUID } from "node:crypto";
import { query, withDatabaseLock } from "../config/db.js";
import { fail } from "../ingestion/localAdapter.js";
import { validateSubmission } from "./contracts.js";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const q = async (sql: string, params: unknown[] = []) => (await query(sql, params)).rows;

export const contentSubmissions = {
  async create(userId: string, value: unknown) {
    const data = validateSubmission(value);
    return withDatabaseLock("content-intelligence:submission:v1", async () => {
      const id = randomUUID(), sourceId = randomUUID(), documentId = randomUUID(), versionId = randomUUID(), recordId = randomUUID();
      const sourceKey = `user-submission:${id}`;
      await query(`INSERT INTO sources(id,stable_key,source_type,title,policy_revision,permission_status,permission_evidence,
        review_status,state,adapter_name,allowed_scope,raw_retention,full_text_storage,derived_facts_storage,model_processing_allowed)
        VALUES($1,$2,'user_submission','Aptlyra user interview experience','content-policy-v1','permitted',
          'Authenticated submitter consent and right-to-share confirmation','proposed','disabled','user-submission',
          '{"scope":"single-user-submission"}','7 days',false,true,$3)`, [sourceId, sourceKey, data.aiProcessingConsent]);
      await query(`INSERT INTO ingestion_adapters(source_id,adapter_id,adapter_version,contract,disabled_reason)
        VALUES($1,'user-submission','1','{"fixture":false,"contract":"user-submission-v1"}','Requires reviewer approval')`, [sourceId]);
      await query("INSERT INTO source_documents(id,source_id,external_key) VALUES($1,$2,$3)", [documentId, sourceId, id]);
      await query(`INSERT INTO source_document_versions(id,document_id,version,title,occurred_at,fetched_at,content_hash,normalized_text,
        policy_revision,permission_status,review_status,quality,pii_status,confidentiality_status,status)
        VALUES($1,$2,1,'User-submitted interview experience',$3,now(),$4,$5,'content-policy-v1','permitted','pending',
          'reported-experience','clear','pending','quarantined')`, [versionId, documentId, data.occurredOn, data.hash, data.cleaned]);
      await query(`INSERT INTO source_chunks(id,document_version_id,chunk_index,excerpt,content_hash,chunker_version,section,start_offset,end_offset)
        VALUES($1,$2,0,$3,$4,'submission-v1','submitted experience',0,char_length($3))`, [randomUUID(), versionId, data.cleaned, data.hash]);
      await query(`INSERT INTO ingestion_records(id,source_id,document_version_id,input_hash,state,draft_questions,expires_at)
        VALUES($1,$2,$3,$4,'review_required','[]',now()+interval '7 days')`, [recordId, sourceId, versionId, data.hash]);
      await query(`INSERT INTO interview_experience_records(document_version_id,company_label,role,occurred_on,track,submitter_type,
        consent_evidence,permission_revision,submitter_user_id,round_type,topics,notes,practice_consent,right_to_share,
        anonymized_research_consent,ai_processing_consent,consented_at)
        VALUES($1,$2,$3,$4,$5,'self-report','Authenticated consent v1','content-policy-v1',$6,$7,$8,$9,true,true,$10,$11,now())`,
      [versionId, data.company, data.role, data.occurredOn, null, userId, data.roundType, JSON.stringify(data.topics), data.notes, data.anonymized,data.aiProcessingConsent]);
      await query(`INSERT INTO ingestion_review_events(id,source_id,record_id,action,content_hash,reason_code)
        VALUES($1,$2,$3,'received',$4,'user-consent-submission')`, [randomUUID(), sourceId, recordId, data.hash]);
      return { id: recordId, state: "quarantined", expiresInDays: 7 };
    });
  },
  async listMine(userId: string) {
    return q(`SELECT r.id,r.state,r.created_at,r.expires_at,v.content_hash
      FROM ingestion_records r JOIN interview_experience_records e ON e.document_version_id=r.document_version_id
      JOIN source_document_versions v ON v.id=r.document_version_id
      WHERE e.submitter_user_id=$1 ORDER BY r.created_at DESC LIMIT 50`, [userId]);
  },
  async withdrawMine(userId: string, id: string) {
    if (!uuid.test(id)) fail("submission-not-found");
    return withDatabaseLock("content-intelligence:submission:v1", async () => {
      const row = (await q(`SELECT r.id,r.source_id,r.document_version_id,r.input_hash,r.state FROM ingestion_records r
        JOIN interview_experience_records e ON e.document_version_id=r.document_version_id
        WHERE r.id=$1 AND e.submitter_user_id=$2 FOR UPDATE`, [id,userId]))[0];
      if (!row) fail("submission-not-found");
      if (["published","withdrawn","rejected"].includes(row.state)) fail("submission-not-withdrawable");
      await query("UPDATE ingestion_records SET state='withdrawn',draft_questions='[]',reason_code='submitter-withdrawal' WHERE id=$1", [id]);
      await query("UPDATE source_document_versions SET status='withdrawn',withdrawal_reason='submitter-withdrawal',normalized_text=NULL,redacted_at=now() WHERE id=$1", [row.document_version_id]);
      await query("UPDATE source_chunks SET status='retired',excerpt=NULL,redacted_at=now() WHERE document_version_id=$1", [row.document_version_id]);
      await query("UPDATE interview_experience_records SET company_label=NULL,track=NULL,notes=NULL,topics='[]',consent_evidence='withdrawn' WHERE document_version_id=$1", [row.document_version_id]);
      await query("UPDATE sources SET state='suspended',withdrawn_at=now(),withdrawal_reason='submitter-withdrawal' WHERE id=$1", [row.source_id]);
      await query(`INSERT INTO ingestion_review_events(id,source_id,record_id,action,content_hash,reason_code)
        VALUES($1,$2,$3,'withdrawn',$4,'submitter-withdrawal')`, [randomUUID(),row.source_id,id,row.input_hash]);
      return { id, state: "withdrawn" };
    });
  },
  async reviewerFor(userId: string) {
    return (await q(`SELECT r.id,r.display_name,u.app_role FROM ingestion_reviewers r JOIN users u ON u.id=r.user_id
      WHERE r.user_id=$1 AND r.kind='human' AND r.enabled AND u.app_role IN ('owner','admin','reviewer')`, [userId]))[0] || null;
  },
  async reviewQueue(userId: string) {
    const reviewer = await this.reviewerFor(userId);
    if (!reviewer) fail("reviewer-not-authorized");
    return q(`SELECT r.id,r.state,r.created_at,r.expires_at,v.content_hash,s.source_type,s.origin,
      e.company_label,e.role,e.occurred_on,e.round_type,e.topics,e.notes,e.anonymized_research_consent,e.ai_processing_consent,
      (SELECT count(*)::int FROM ingestion_candidates c WHERE c.record_id=r.id) AS candidate_count,
      left(v.normalized_text,12000) AS excerpt,
      CASE WHEN v.normalized_text ~* '[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}' THEN ARRAY['email']::text[] ELSE ARRAY[]::text[] END AS warnings
      FROM ingestion_records r JOIN sources s ON s.id=r.source_id JOIN source_document_versions v ON v.id=r.document_version_id
      LEFT JOIN interview_experience_records e ON e.document_version_id=v.id
      WHERE r.state IN ('review_required','approved') AND r.expires_at>now() ORDER BY r.created_at LIMIT 100`);
  },
};
