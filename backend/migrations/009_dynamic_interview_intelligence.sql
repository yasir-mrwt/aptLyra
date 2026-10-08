-- Phase 8.5: extend the Phase 4 editorial pipeline without rewriting seed data.
-- Sources remain disabled unless permission evidence and a human review exist.
ALTER TABLE sources DROP CONSTRAINT sources_source_type_check;
ALTER TABLE sources ADD CONSTRAINT sources_source_type_check CHECK (source_type IN (
  'authored','licensed-reference','permitted-api','voluntary-experience',
  'official_api','rss_atom','licensed_dataset','operator_import','user_submission','permitted_web'
));
ALTER TABLE sources ADD COLUMN adapter_name TEXT;
ALTER TABLE sources ADD COLUMN terms_url TEXT CHECK (length(terms_url)<=2000);
ALTER TABLE sources ADD COLUMN permission_basis TEXT CHECK(length(permission_basis)<=200);
ALTER TABLE sources ADD COLUMN allowed_scope knowledge_json NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(allowed_scope)='object');
ALTER TABLE sources ADD COLUMN rate_limit knowledge_json NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(rate_limit)='object');
ALTER TABLE sources ADD COLUMN raw_retention interval NOT NULL DEFAULT interval '7 days' CHECK(raw_retention>=interval '0' AND raw_retention<=interval '30 days');
ALTER TABLE sources ADD COLUMN full_text_storage BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE sources ADD COLUMN derived_facts_storage BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE sources ADD COLUMN model_processing_allowed BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE sources ADD COLUMN permission_evidence_hash knowledge_hash;
ALTER TABLE sources ADD COLUMN last_success_at TIMESTAMPTZ;
ALTER TABLE sources ADD COLUMN last_failure_code TEXT CHECK(length(last_failure_code)<=100);
ALTER TABLE sources ADD COLUMN next_due_at TIMESTAMPTZ;
ALTER TABLE sources ADD COLUMN withdrawn_at TIMESTAMPTZ;
ALTER TABLE sources ADD COLUMN withdrawal_reason TEXT CHECK(length(withdrawal_reason)<=1000);
ALTER TABLE sources ADD CONSTRAINT source_withdrawal_pair CHECK ((withdrawn_at IS NULL)=(withdrawal_reason IS NULL));

ALTER TABLE ingestion_adapters DROP CONSTRAINT ingestion_adapters_adapter_id_check;
ALTER TABLE ingestion_adapters ADD CONSTRAINT ingestion_adapters_adapter_id_check
  CHECK(adapter_id IN ('local-file','user-submission','official-api','rss-atom','operator-import'));
ALTER TABLE ingestion_adapters DROP CONSTRAINT ingestion_adapters_adapter_version_check;
ALTER TABLE ingestion_adapters ADD CONSTRAINT ingestion_adapters_adapter_version_check CHECK(length(adapter_version) BETWEEN 1 AND 40);
ALTER TABLE ingestion_adapters ADD COLUMN disabled_reason TEXT CHECK(length(disabled_reason)<=500);

ALTER TABLE ingestion_reviewers ADD COLUMN user_id UUID UNIQUE REFERENCES users(id) ON DELETE RESTRICT;

ALTER TABLE interview_experience_records ALTER COLUMN company_label DROP NOT NULL;
ALTER TABLE interview_experience_records ADD COLUMN submitter_user_id UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE interview_experience_records ADD COLUMN round_type TEXT CHECK(length(round_type)<=100);
ALTER TABLE interview_experience_records ADD COLUMN topics knowledge_json NOT NULL DEFAULT '[]' CHECK(jsonb_typeof(topics)='array');
ALTER TABLE interview_experience_records ADD COLUMN notes TEXT CHECK(octet_length(notes)<=12000);
ALTER TABLE interview_experience_records ADD COLUMN practice_consent BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE interview_experience_records ADD COLUMN right_to_share BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE interview_experience_records ADD COLUMN anonymized_research_consent BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE interview_experience_records ADD COLUMN ai_processing_consent BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE interview_experience_records ADD COLUMN consented_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE interview_experience_records ADD CONSTRAINT experience_consent_required CHECK(practice_consent AND right_to_share);

ALTER TABLE ingestion_review_events DROP CONSTRAINT ingestion_review_events_action_check;
ALTER TABLE ingestion_review_events ADD CONSTRAINT ingestion_review_events_action_check CHECK(action IN (
  'source-approved','received','normalized','review-required','approved','rejected','published','extracted','withdrawn','expired',
  'duplicate','edited-approved','re-extraction-requested','family-linked','scoring-approved','scoring-rejected','superseded'
));

ALTER TABLE ingestion_candidates DROP CONSTRAINT ingestion_candidates_extraction_method_check;
ALTER TABLE ingestion_candidates ADD CONSTRAINT ingestion_candidates_extraction_method_check
  CHECK(extraction_method IN ('structured-local-v1','structured-experience-v1','model-proposal-v1'));
ALTER TABLE ingestion_candidates ADD COLUMN derivation_type TEXT NOT NULL DEFAULT 'direct'
  CHECK(derivation_type IN ('direct','paraphrased','topic-derived'));
ALTER TABLE ingestion_candidates ADD COLUMN extraction_contract TEXT NOT NULL DEFAULT 'question-extraction-v1';
ALTER TABLE ingestion_candidates ADD COLUMN confidence NUMERIC(4,3) CHECK(confidence BETWEEN 0 AND 1);
ALTER TABLE ingestion_candidates ADD COLUMN extraction_metadata knowledge_json NOT NULL DEFAULT '{}'
  CHECK(jsonb_typeof(extraction_metadata)='object' AND octet_length(extraction_metadata::text)<=8000);
ALTER TABLE ingestion_candidates DROP CONSTRAINT ingestion_candidates_state_check;
ALTER TABLE ingestion_candidates ADD CONSTRAINT ingestion_candidates_state_check
  CHECK (state IN ('review_required','approved','published','rejected','withdrawn','duplicate','superseded'));
ALTER TABLE ingestion_candidates ADD COLUMN duplicate_of UUID REFERENCES ingestion_candidates(id) ON DELETE RESTRICT;
ALTER TABLE ingestion_candidates ADD COLUMN supersedes_id UUID REFERENCES ingestion_candidates(id) ON DELETE RESTRICT;
ALTER TABLE ingestion_review_events ADD COLUMN event_metadata knowledge_json NOT NULL DEFAULT '{}'
  CHECK(jsonb_typeof(event_metadata)='object' AND octet_length(event_metadata::text)<=4000);

-- Reviewer-approved technical grounding is tracked separately from interview
-- provenance; reported interview text can never masquerade as technical truth.
CREATE TABLE question_technical_references (
  id UUID PRIMARY KEY,
  question_version_id UUID NOT NULL REFERENCES question_versions(id) ON DELETE CASCADE,
  chunk_id UUID NOT NULL REFERENCES source_chunks(id) ON DELETE RESTRICT,
  reviewer_id TEXT NOT NULL REFERENCES ingestion_reviewers(id) ON DELETE RESTRICT,
  source_version_hash knowledge_hash NOT NULL,
  permission_hash knowledge_hash NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('approved','withdrawn')),
  reviewed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  withdrawn_at TIMESTAMPTZ,
  UNIQUE(question_version_id,chunk_id),
  CHECK ((state='approved' AND withdrawn_at IS NULL) OR (state='withdrawn' AND withdrawn_at IS NOT NULL))
);
CREATE INDEX question_technical_references_ready ON question_technical_references(question_version_id,state);
CREATE FUNCTION seal_question_technical_reference() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' OR OLD.state='withdrawn' OR
    (OLD.state='approved' AND NEW.state='approved' AND ROW(NEW.question_version_id,NEW.chunk_id,NEW.reviewer_id,
      NEW.source_version_hash,NEW.permission_hash) IS DISTINCT FROM ROW(OLD.question_version_id,OLD.chunk_id,OLD.reviewer_id,
      OLD.source_version_hash,OLD.permission_hash)) THEN
    RAISE EXCEPTION 'Technical reference review is append-only' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER question_technical_reference_sealed BEFORE UPDATE OR DELETE ON question_technical_references
  FOR EACH ROW EXECUTE FUNCTION seal_question_technical_reference();
CREATE FUNCTION validate_question_technical_reference() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.state='approved' AND NOT EXISTS(
    SELECT 1 FROM ingestion_reviewers r JOIN source_chunks c ON c.id=NEW.chunk_id
    JOIN source_document_versions v ON v.id=c.document_version_id JOIN source_documents d ON d.id=v.document_id
    JOIN sources s ON s.id=d.source_id
    WHERE r.id=NEW.reviewer_id AND r.kind='human' AND r.enabled AND r.user_id IS NOT NULL
      AND c.status='active' AND v.status='published' AND v.quality='technical-reference'
      AND v.permission_status='permitted' AND v.review_status='approved' AND v.pii_status='clear'
      AND v.confidentiality_status='clear' AND s.state='enabled' AND s.permission_status='permitted'
      AND s.review_status='approved' AND s.withdrawn_at IS NULL AND s.permission_evidence_hash=NEW.permission_hash
      AND v.content_hash=NEW.source_version_hash) THEN
    RAISE EXCEPTION 'Eligible reviewed technical reference required' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER question_technical_reference_eligible BEFORE INSERT OR UPDATE ON question_technical_references
  FOR EACH ROW EXECUTE FUNCTION validate_question_technical_reference();
CREATE VIEW content_question_readiness AS
SELECT qv.id AS question_version_id,qv.question_id,qv.status AS question_status,
  CASE WHEN qv.status='published' AND EXISTS(SELECT 1 FROM rubric_versions rv
    JOIN rubric_review_approvals ra ON ra.rubric_version_id=rv.id AND ra.content_hash=rv.content_hash
    WHERE rv.question_version_id=qv.id AND rv.kind='known' AND rv.status='reviewed')
    AND EXISTS(SELECT 1 FROM question_technical_references tr JOIN source_chunks c ON c.id=tr.chunk_id
      JOIN source_document_versions dv ON dv.id=c.document_version_id JOIN source_documents d ON d.id=dv.document_id
      JOIN sources s ON s.id=d.source_id WHERE tr.question_version_id=qv.id AND tr.state='approved' AND c.status='active'
        AND dv.status='published' AND dv.content_hash=tr.source_version_hash AND s.permission_evidence_hash=tr.permission_hash AND dv.quality='technical-reference' AND dv.permission_status='permitted'
        AND dv.review_status='approved' AND s.state='enabled' AND s.permission_status='permitted'
        AND s.review_status='approved' AND s.withdrawn_at IS NULL)
    AND NOT EXISTS(SELECT 1 FROM rubric_versions rv JOIN expected_concepts ec ON ec.rubric_version_id=rv.id
      JOIN concept_references cr ON cr.concept_id=ec.id WHERE rv.question_version_id=qv.id AND rv.kind='known'
      AND NOT EXISTS(SELECT 1 FROM question_technical_references tr JOIN source_chunks c ON c.id=tr.chunk_id
        JOIN source_document_versions dv ON dv.id=c.document_version_id JOIN source_documents d ON d.id=dv.document_id
        JOIN sources s ON s.id=d.source_id WHERE tr.question_version_id=qv.id AND tr.chunk_id=cr.chunk_id AND tr.state='approved'
          AND c.status='active' AND dv.status='published' AND dv.permission_status='permitted' AND dv.review_status='approved'
          AND s.state='enabled' AND s.permission_status='permitted' AND s.review_status='approved' AND s.withdrawn_at IS NULL))
    AND EXISTS(SELECT 1 FROM embedding_metadata em JOIN embedding_vectors ev ON ev.metadata_id=em.id
      WHERE em.question_version_id=qv.id AND em.purpose='question-selection' AND em.status='active')
    THEN 'reviewed/scoring-ready'
    WHEN qv.status='published' AND EXISTS(SELECT 1 FROM embedding_metadata em JOIN embedding_vectors ev ON ev.metadata_id=em.id
      WHERE em.question_version_id=qv.id AND em.purpose='question-selection' AND em.status='active') THEN 'fresh/provisional'
    WHEN qv.status='published' THEN 'approved-not-retrieval-ready'
    ELSE 'unpublished' END AS publication_class
FROM question_versions qv;
CREATE TABLE content_scoring_review_events (
  id UUID PRIMARY KEY,
  question_version_id UUID NOT NULL REFERENCES question_versions(id) ON DELETE CASCADE,
  draft_id UUID REFERENCES rubric_drafts(id) ON DELETE SET NULL,
  reviewer_id TEXT NOT NULL REFERENCES ingestion_reviewers(id) ON DELETE RESTRICT,
  action TEXT NOT NULL CHECK(action IN ('drafted','approved','rejected','regeneration-requested','withdrawn')),
  packet_hash knowledge_hash NOT NULL,
  reason TEXT CHECK(length(reason)<=1000),
  event_metadata knowledge_json NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(event_metadata)='object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE FUNCTION seal_content_scoring_event() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Scoring review history is append-only' USING ERRCODE='23514'; END $$;
CREATE TRIGGER content_scoring_events_sealed BEFORE UPDATE OR DELETE ON content_scoring_review_events
  FOR EACH ROW EXECUTE FUNCTION seal_content_scoring_event();

-- Extend the existing Phase 8 durable operation/outbox records with explicit
-- non-session scopes. Content jobs still use the same PostgreSQL authority,
-- outbox, and BullMQ transport; NULL session ownership is intentional.
ALTER TABLE durable_operations DROP CONSTRAINT durable_operations_operation_type_check;
ALTER TABLE durable_operations ADD CONSTRAINT durable_operations_operation_type_check CHECK (operation_type IN (
  'plan','transcribe','evaluate','follow-up','report','delete',
  'source_collection','source_extraction','question_candidate_processing',
  'scoring_packet_draft','embedding_publication','withdrawal_reconciliation','retention_expiry'
));
ALTER TABLE durable_operations DROP CONSTRAINT durable_operations_session_id_user_id_fkey;
ALTER TABLE durable_operations ALTER COLUMN session_id DROP NOT NULL;
ALTER TABLE durable_operations ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE durable_operations ADD CONSTRAINT runtime_operation_session_owner FOREIGN KEY(session_id,user_id)
  REFERENCES sessions(id,user_id) ON DELETE CASCADE;
ALTER TABLE durable_operations ADD COLUMN scope_type TEXT NOT NULL DEFAULT 'session'
  CHECK(scope_type IN ('session','source','submission','question','maintenance'));
ALTER TABLE durable_operations ADD COLUMN scope_id UUID;
ALTER TABLE durable_operations ADD COLUMN source_id UUID REFERENCES sources(id) ON DELETE RESTRICT;
UPDATE durable_operations SET scope_id=session_id WHERE session_id IS NOT NULL;
ALTER TABLE durable_operations ADD CONSTRAINT runtime_operation_scope CHECK (
  (runtime_version='aptlyra-runtime-v1' AND scope_type='session' AND session_id IS NOT NULL AND user_id IS NOT NULL AND scope_id=session_id AND source_id IS NULL)
  OR (runtime_version='aptlyra-content-v1' AND session_id IS NULL AND
      ((scope_type='source' AND scope_id IS NOT NULL AND source_id=scope_id) OR
       (scope_type IN ('submission','question','maintenance') AND scope_id IS NOT NULL))));
CREATE UNIQUE INDEX runtime_content_operation_idempotency
  ON durable_operations(scope_type,scope_id,operation_type,idempotency_key)
  WHERE runtime_version='aptlyra-content-v1';
CREATE UNIQUE INDEX runtime_content_one_active_operation
  ON durable_operations(scope_type,scope_id,operation_type)
  WHERE runtime_version='aptlyra-content-v1' AND status IN ('queued','running');

ALTER TABLE transactional_outbox DROP CONSTRAINT transactional_outbox_session_id_user_id_fkey;
ALTER TABLE transactional_outbox ALTER COLUMN session_id DROP NOT NULL;
ALTER TABLE transactional_outbox ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE transactional_outbox ADD CONSTRAINT runtime_outbox_session_owner FOREIGN KEY(session_id,user_id)
  REFERENCES sessions(id,user_id) ON DELETE CASCADE;
ALTER TABLE transactional_outbox ADD COLUMN scope_type TEXT NOT NULL DEFAULT 'session'
  CHECK(scope_type IN ('session','source','submission','question','maintenance'));
ALTER TABLE transactional_outbox ADD COLUMN scope_id UUID;
ALTER TABLE transactional_outbox ADD COLUMN source_id UUID REFERENCES sources(id) ON DELETE RESTRICT;
UPDATE transactional_outbox SET scope_id=session_id;
ALTER TABLE transactional_outbox ADD CONSTRAINT runtime_outbox_scope CHECK (
  (scope_type='session' AND session_id IS NOT NULL AND user_id IS NOT NULL AND scope_id=session_id AND source_id IS NULL)
  OR (scope_type<>'session' AND session_id IS NULL AND scope_id IS NOT NULL));

CREATE INDEX idx_sources_due_collection ON sources(next_due_at) WHERE state='enabled' AND withdrawn_at IS NULL;
CREATE INDEX idx_experience_submitter ON interview_experience_records(submitter_user_id,document_version_id);
CREATE INDEX idx_ingestion_review_queue ON ingestion_candidates(state,id) WHERE state='review_required';
