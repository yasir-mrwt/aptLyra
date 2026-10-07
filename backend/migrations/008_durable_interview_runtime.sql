-- Forward-only runtime extension. Applied history, seed approvals and rubric policy stay intact.
ALTER TABLE sessions ADD COLUMN runtime_version TEXT CHECK(runtime_version IS NULL OR runtime_version='aptlyra-runtime-v1');
ALTER TABLE sessions ADD COLUMN runtime_state TEXT NOT NULL DEFAULT 'active' CHECK(runtime_state IN ('active','finishing','completed'));
ALTER TABLE sessions ADD COLUMN runtime_revision BIGINT NOT NULL DEFAULT 0 CHECK(runtime_revision>=0);
-- Existing account/session content is not rewritten. Idle planner sessions opt in on an owned write.

ALTER TABLE answer_attempts ADD COLUMN runtime_prepared BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE answer_attempts ADD COLUMN runtime_extracted BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE answer_attempts ADD COLUMN extracted_text TEXT CHECK(octet_length(extracted_text)<=200000);
ALTER TABLE answer_attempts ADD COLUMN speech_result knowledge_json;
-- Submitted content/lineage remain immutable. Derived transcription and rubric pins are written once.
CREATE OR REPLACE FUNCTION phase7_answer_seal() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE preparing boolean; extracting boolean;
BEGIN
  preparing:=NOT OLD.runtime_prepared AND NEW.runtime_prepared AND OLD.status IN ('received','transcribing','evaluating','failed')
    AND NEW.status='evaluating' AND OLD.privacy_status='present' AND NEW.privacy_status='present';
  extracting:=OLD.input_kind='audio' AND NOT OLD.runtime_extracted AND NEW.runtime_extracted AND OLD.status IN ('received','transcribing','failed')
    AND NEW.status='evaluating' AND OLD.privacy_status='present' AND NEW.privacy_status='present';
  IF OLD.creation_transaction<>pg_current_xact_id() AND
    (to_jsonb(NEW)-ARRAY['status','updated_at','privacy_status','redacted_at','answer_text','code_text','artifact_refs',
      'runtime_prepared','runtime_extracted','extracted_text','speech_result','selected_rubric_id','grounding_snapshot']) IS DISTINCT FROM
    (to_jsonb(OLD)-ARRAY['status','updated_at','privacy_status','redacted_at','answer_text','code_text','artifact_refs',
      'runtime_prepared','runtime_extracted','extracted_text','speech_result','selected_rubric_id','grounding_snapshot']) THEN
    RAISE EXCEPTION 'Answer lineage is immutable' USING ERRCODE='23514'; END IF;
  IF OLD.creation_transaction<>pg_current_xact_id() AND NEW.privacy_status='present' AND
    ROW(NEW.answer_text,NEW.code_text,NEW.artifact_refs) IS DISTINCT FROM ROW(OLD.answer_text,OLD.code_text,OLD.artifact_refs) THEN
    RAISE EXCEPTION 'Answer content is immutable; create a new attempt' USING ERRCODE='23514'; END IF;
  IF OLD.creation_transaction<>pg_current_xact_id() AND NOT preparing AND NOT
    (NEW.privacy_status<>'present' AND NEW.extracted_text IS NULL AND NEW.speech_result IS NULL
      AND NEW.runtime_prepared=OLD.runtime_prepared AND NEW.selected_rubric_id IS NOT DISTINCT FROM OLD.selected_rubric_id
      AND NEW.grounding_snapshot=OLD.grounding_snapshot) AND
    ROW(NEW.runtime_prepared,NEW.selected_rubric_id,NEW.grounding_snapshot) IS DISTINCT FROM
    ROW(OLD.runtime_prepared,OLD.selected_rubric_id,OLD.grounding_snapshot) THEN
    RAISE EXCEPTION 'Prepared answer pins are immutable' USING ERRCODE='23514'; END IF;
  IF OLD.creation_transaction<>pg_current_xact_id() AND NOT extracting AND NOT
    (NEW.privacy_status<>'present' AND NEW.extracted_text IS NULL AND NEW.speech_result IS NULL AND NEW.runtime_extracted=OLD.runtime_extracted) AND
    ROW(NEW.runtime_extracted,NEW.extracted_text,NEW.speech_result) IS DISTINCT FROM ROW(OLD.runtime_extracted,OLD.extracted_text,OLD.speech_result) THEN
    RAISE EXCEPTION 'Extracted answer content is immutable' USING ERRCODE='23514'; END IF;
  IF OLD.privacy_status<>'present' AND NEW.privacy_status='present' THEN RAISE EXCEPTION 'Cannot restore erased answer' USING ERRCODE='23514'; END IF;
  IF NEW.privacy_status<>'present' AND (NEW.extracted_text IS NOT NULL OR NEW.speech_result IS NOT NULL) THEN
    RAISE EXCEPTION 'Erased answer must clear extracted content' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;

ALTER TABLE durable_operations ADD COLUMN runtime_version TEXT;
ALTER TABLE answer_attempts ADD CONSTRAINT runtime_answer_owner UNIQUE(id,session_id,user_id);
ALTER TABLE durable_operations ADD COLUMN answer_attempt_id UUID REFERENCES answer_attempts(id) ON DELETE CASCADE;
ALTER TABLE durable_operations ADD COLUMN plan_item_id UUID REFERENCES plan_items(id) ON DELETE CASCADE;
ALTER TABLE durable_operations ADD COLUMN question_index INTEGER CHECK(question_index>=0);
ALTER TABLE durable_operations ADD COLUMN payload knowledge_json NOT NULL DEFAULT '{}';
ALTER TABLE durable_operations ADD COLUMN max_attempts INTEGER NOT NULL DEFAULT 3 CHECK(max_attempts BETWEEN 1 AND 3);
ALTER TABLE durable_operations ADD COLUMN lease_owner UUID;
ALTER TABLE durable_operations ADD COLUMN lease_token UUID;
ALTER TABLE durable_operations ADD COLUMN next_retry_at TIMESTAMPTZ;
ALTER TABLE durable_operations ADD COLUMN total_attempts INTEGER NOT NULL DEFAULT 0 CHECK(total_attempts>=0);
ALTER TABLE durable_operations ADD COLUMN manual_retries INTEGER NOT NULL DEFAULT 0 CHECK(manual_retries>=0);
ALTER TABLE durable_operations ADD COLUMN result knowledge_json;
ALTER TABLE durable_operations ADD COLUMN committed_revision BIGINT CHECK(committed_revision>=0);
ALTER TABLE durable_operations ADD CONSTRAINT runtime_operation_lease CHECK(runtime_version IS NULL OR status<>'running'
  OR (lease_owner IS NOT NULL AND lease_token IS NOT NULL));
ALTER TABLE durable_operations ADD CONSTRAINT runtime_operation_answer_owner FOREIGN KEY(answer_attempt_id,session_id,user_id)
  REFERENCES answer_attempts(id,session_id,user_id) ON DELETE CASCADE;
CREATE INDEX runtime_operation_recovery ON durable_operations(status,next_retry_at,lease_expires_at) WHERE runtime_version IS NOT NULL;
CREATE UNIQUE INDEX runtime_one_active_operation ON durable_operations(session_id) WHERE runtime_version IS NOT NULL AND status IN ('queued','running');

ALTER TABLE transactional_outbox ADD COLUMN operation_id UUID REFERENCES durable_operations(id) ON DELETE CASCADE;
ALTER TABLE transactional_outbox ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
CREATE UNIQUE INDEX runtime_outbox_operation ON transactional_outbox(operation_id) WHERE operation_id IS NOT NULL;
CREATE TABLE staged_interview_media (
  id UUID PRIMARY KEY,
  session_id UUID NOT NULL,
  user_id UUID NOT NULL,
  answer_attempt_id UUID NOT NULL UNIQUE,
  filename TEXT NOT NULL UNIQUE CHECK(filename ~ '^[0-9a-f-]{36}\.(webm|wav|mp3|ogg|m4a)$'),
  content_hash knowledge_hash NOT NULL,
  size_bytes INTEGER NOT NULL CHECK(size_bytes BETWEEN 1 AND 10485760),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY(session_id,user_id) REFERENCES sessions(id,user_id) ON DELETE CASCADE,
  FOREIGN KEY(answer_attempt_id,session_id,user_id) REFERENCES answer_attempts(id,session_id,user_id) ON DELETE CASCADE
);
CREATE TABLE interview_reports (
  id UUID PRIMARY KEY,
  session_id UUID NOT NULL UNIQUE,
  user_id UUID NOT NULL,
  snapshot_revision BIGINT NOT NULL CHECK(snapshot_revision>=0),
  scoring_version TEXT NOT NULL,
  summary knowledge_json NOT NULL,
  questions JSONB NOT NULL CHECK(jsonb_typeof(questions)='array' AND octet_length(questions::text)<=1048576),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY(session_id,user_id) REFERENCES sessions(id,user_id) ON DELETE CASCADE
);
CREATE FUNCTION seal_interview_report() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' AND pg_trigger_depth()>1 THEN RETURN OLD; END IF;
  RAISE EXCEPTION 'Completed report snapshots are immutable; delete the owned session instead' USING ERRCODE='23514';
END $$;
CREATE TRIGGER interview_report_sealed BEFORE UPDATE OR DELETE ON interview_reports FOR EACH ROW EXECUTE FUNCTION seal_interview_report();
