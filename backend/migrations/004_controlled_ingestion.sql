-- Local editorial import state. No vectors, planner or scoring execution.
CREATE TABLE ingestion_reviewers (
  id TEXT PRIMARY KEY CHECK (id ~ '^[a-z][a-z0-9-]{2,79}$'),
  display_name TEXT NOT NULL CHECK (length(display_name) BETWEEN 1 AND 200),
  kind TEXT NOT NULL CHECK (kind IN ('human','fixture')),
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE ingestion_adapters (
  source_id UUID PRIMARY KEY REFERENCES sources(id),
  adapter_id TEXT NOT NULL CHECK (adapter_id='local-file'),
  adapter_version TEXT NOT NULL CHECK (adapter_version='1'),
  contract knowledge_json NOT NULL CHECK (jsonb_typeof(contract)='object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE ingestion_records (
  id UUID PRIMARY KEY,
  source_id UUID NOT NULL REFERENCES sources(id),
  document_version_id UUID UNIQUE REFERENCES source_document_versions(id),
  input_hash knowledge_hash NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('quarantined','normalized','review_required','approved','published','rejected','withdrawn')),
  signals knowledge_json NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(signals)='array'),
  draft_questions knowledge_json NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(draft_questions)='array'),
  duplicates knowledge_json NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(duplicates)='array'),
  duplicate_decision TEXT CHECK (duplicate_decision IN ('distinct','retain-provenance')),
  reviewed_by TEXT REFERENCES ingestion_reviewers(id),
  reviewed_at TIMESTAMPTZ,
  reason_code TEXT CHECK (reason_code ~ '^[a-z][a-z0-9-]{1,99}$'),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT now()+interval '7 days',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (state NOT IN ('approved','published') OR (document_version_id IS NOT NULL AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL AND signals='[]'::jsonb)),
  CHECK (state NOT IN ('rejected','withdrawn') OR (reason_code IS NOT NULL AND draft_questions='[]'::jsonb))
);
CREATE INDEX idx_ingestion_state_expiry ON ingestion_records(state,expires_at);
CREATE TABLE ingestion_candidates (
  id UUID PRIMARY KEY,
  record_id UUID NOT NULL REFERENCES ingestion_records(id),
  chunk_id UUID NOT NULL REFERENCES source_chunks(id),
  specification knowledge_json NOT NULL CHECK (jsonb_typeof(specification)='object'),
  content_hash knowledge_hash NOT NULL,
  evidence_start INTEGER NOT NULL CHECK (evidence_start>=0),
  evidence_end INTEGER NOT NULL CHECK (evidence_end>evidence_start),
  extraction_method TEXT NOT NULL DEFAULT 'structured-local-v1' CHECK (extraction_method='structured-local-v1'),
  state TEXT NOT NULL DEFAULT 'review_required' CHECK (state IN ('review_required','approved','published','rejected','withdrawn')),
  duplicate_links knowledge_json NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(duplicate_links)='array'),
  reviewed_by TEXT REFERENCES ingestion_reviewers(id),
  reviewed_at TIMESTAMPTZ,
  question_version_id UUID UNIQUE REFERENCES question_versions(id),
  reason_code TEXT CHECK (reason_code ~ '^[a-z][a-z0-9-]{1,99}$'),
  UNIQUE(record_id,content_hash),
  CHECK (state NOT IN ('approved','published') OR (reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL)),
  CHECK (state<>'published' OR question_version_id IS NOT NULL)
);
CREATE INDEX idx_ingestion_candidates_record ON ingestion_candidates(record_id,state);
CREATE TABLE interview_experience_records (
  document_version_id UUID PRIMARY KEY REFERENCES source_document_versions(id),
  company_label TEXT NOT NULL CHECK (length(company_label) BETWEEN 1 AND 200),
  company_claim TEXT NOT NULL DEFAULT 'unverified-report' CHECK (company_claim='unverified-report'),
  role TEXT NOT NULL CHECK (role IN ('Software Engineer','Backend Developer','Full Stack Developer')),
  occurred_on DATE,
  track TEXT CHECK (length(track)<=200),
  submitter_type TEXT NOT NULL CHECK (submitter_type IN ('self-report','permission-approved-report','fixture')),
  consent_evidence TEXT NOT NULL CHECK (length(consent_evidence) BETWEEN 1 AND 2000),
  permission_revision TEXT NOT NULL CHECK (length(permission_revision) BETWEEN 1 AND 100),
  CHECK (occurred_on IS NULL OR occurred_on>=DATE '1970-01-01')
);
CREATE TABLE ingestion_review_events (
  id UUID PRIMARY KEY,
  source_id UUID NOT NULL REFERENCES sources(id),
  record_id UUID REFERENCES ingestion_records(id),
  candidate_id UUID REFERENCES ingestion_candidates(id),
  action TEXT NOT NULL CHECK (action IN ('source-approved','received','normalized','review-required','approved','rejected','published','extracted','withdrawn','expired')),
  reviewer_id TEXT REFERENCES ingestion_reviewers(id),
  content_hash knowledge_hash NOT NULL,
  reason_code TEXT CHECK (reason_code ~ '^[a-z][a-z0-9-]{1,99}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_ingestion_events_record ON ingestion_review_events(record_id,created_at);
CREATE FUNCTION protect_ingestion_audit() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Editorial audit is append-only' USING ERRCODE='23514'; END $$;
CREATE TRIGGER ingestion_audit_immutable BEFORE UPDATE OR DELETE ON ingestion_review_events FOR EACH ROW EXECUTE FUNCTION protect_ingestion_audit();

-- Phase 3 intentionally allowed internal draft publication. Phase 4 adds its
-- explicit review/provenance gate without editing checksum-protected migrations.
CREATE FUNCTION enforce_reviewed_question_publication() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status='published' AND (NEW.reviewed_by IS NULL OR NEW.reviewed_at IS NULL) THEN
    RAISE EXCEPTION 'Question publication requires editorial review' USING ERRCODE='23514';
  END IF;
  IF NEW.status='published' AND EXISTS (
    SELECT 1 FROM question_provenance p JOIN source_document_versions v ON v.id=p.document_version_id
    JOIN source_documents d ON d.id=v.document_id JOIN sources s ON s.id=d.source_id
    LEFT JOIN source_chunks c ON c.id=p.chunk_id
    WHERE p.question_version_id=NEW.id AND (v.status<>'published' OR s.state<>'enabled' OR
      s.permission_status<>'permitted' OR s.review_status<>'approved' OR (p.chunk_id IS NOT NULL AND c.status<>'active'))
  ) THEN RAISE EXCEPTION 'Question provenance is not available' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER question_editorial_publication BEFORE INSERT OR UPDATE ON question_versions FOR EACH ROW EXECUTE FUNCTION enforce_reviewed_question_publication();
