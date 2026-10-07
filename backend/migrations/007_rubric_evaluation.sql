-- Forward-only Phase 7. Historical legacy projections and migrations 001-006 stay intact.
ALTER TABLE sessions ADD COLUMN scoring_version TEXT NOT NULL DEFAULT 'legacy' CHECK(scoring_version IN ('legacy','rubric-v1'));
ALTER TABLE sessions ADD COLUMN reviewed_summary knowledge_json;
CREATE TABLE rubric_drafts (
  id UUID PRIMARY KEY,
  question_version_id UUID NOT NULL REFERENCES question_versions(id),
  content knowledge_json NOT NULL CHECK(jsonb_typeof(content)='object'),
  content_hash knowledge_hash NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE rubric_review_approvals (
  rubric_version_id UUID PRIMARY KEY REFERENCES rubric_versions(id),
  draft_id UUID NOT NULL REFERENCES rubric_drafts(id),
  content_hash knowledge_hash NOT NULL,
  reviewer_id TEXT NOT NULL REFERENCES ingestion_reviewers(id),
  reviewed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE rubric_versions ADD COLUMN content_hash knowledge_hash;
ALTER TABLE rubric_versions ADD COLUMN draft_id UUID REFERENCES rubric_drafts(id);
CREATE FUNCTION seal_rubric_review() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Rubric reviews/drafts are immutable' USING ERRCODE='23514'; END IF;
  IF TG_TABLE_NAME='rubric_review_approvals' AND NOT EXISTS(
    SELECT 1 FROM rubric_drafts d JOIN rubric_versions v ON v.id=NEW.rubric_version_id
    JOIN ingestion_reviewers r ON r.id=NEW.reviewer_id
    WHERE d.id=NEW.draft_id AND d.content_hash=NEW.content_hash AND d.question_version_id=v.question_version_id
      AND r.enabled AND r.kind='human' AND v.kind='known' AND v.status='reviewed') THEN
    RAISE EXCEPTION 'Exact draft hash and actual human reviewer required' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER rubric_draft_sealed BEFORE UPDATE OR DELETE ON rubric_drafts FOR EACH ROW EXECUTE FUNCTION seal_rubric_review();
CREATE TRIGGER rubric_approval_sealed BEFORE INSERT OR UPDATE OR DELETE ON rubric_review_approvals FOR EACH ROW EXECUTE FUNCTION seal_rubric_review();
ALTER TABLE answer_attempts ADD COLUMN follow_up_index INTEGER CHECK(follow_up_index>=0);
ALTER TABLE answer_attempts ADD COLUMN selected_rubric_id UUID REFERENCES rubric_versions(id);
ALTER TABLE answer_attempts ADD COLUMN grounding_snapshot knowledge_json NOT NULL DEFAULT '{}';
ALTER TABLE answer_attempts ADD COLUMN creation_transaction xid8 NOT NULL DEFAULT pg_current_xact_id();
CREATE FUNCTION phase7_answer_seal() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.creation_transaction<>pg_current_xact_id() AND
    (to_jsonb(NEW)-ARRAY['status','updated_at','privacy_status','redacted_at','answer_text','code_text','artifact_refs']) IS DISTINCT FROM
    (to_jsonb(OLD)-ARRAY['status','updated_at','privacy_status','redacted_at','answer_text','code_text','artifact_refs']) THEN
    RAISE EXCEPTION 'Answer lineage is immutable' USING ERRCODE='23514'; END IF;
  IF OLD.creation_transaction<>pg_current_xact_id() AND NEW.privacy_status='present' AND
    ROW(NEW.answer_text,NEW.code_text,NEW.artifact_refs) IS DISTINCT FROM ROW(OLD.answer_text,OLD.code_text,OLD.artifact_refs) THEN
    RAISE EXCEPTION 'Answer content is immutable; create a new attempt' USING ERRCODE='23514'; END IF;
  IF OLD.privacy_status<>'present' AND NEW.privacy_status='present' THEN RAISE EXCEPTION 'Cannot restore erased answer' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER phase7_answer_immutable BEFORE UPDATE ON answer_attempts FOR EACH ROW EXECUTE FUNCTION phase7_answer_seal();
ALTER TABLE evaluations ALTER COLUMN rubric_version_id DROP NOT NULL;
ALTER TABLE evaluations ADD COLUMN rubric_kind_snapshot TEXT CHECK(rubric_kind_snapshot IN ('reviewed','provisional','unavailable'));
ALTER TABLE evaluations ADD COLUMN feedback TEXT CHECK(length(feedback)<=4000);
ALTER TABLE evaluations ADD COLUMN concept_summary knowledge_json NOT NULL DEFAULT '[]' CHECK(jsonb_typeof(concept_summary)='array');
ALTER TABLE evaluations ADD COLUMN objective_evidence knowledge_json NOT NULL DEFAULT '{}';
CREATE TABLE coding_execution_evidence (
  id UUID PRIMARY KEY,
  session_id UUID NOT NULL,
  user_id UUID NOT NULL,
  question_index INTEGER NOT NULL CHECK(question_index>=0),
  code_hash knowledge_hash NOT NULL,
  language TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('passed','failed')),
  summary TEXT NOT NULL CHECK(length(summary)<=2000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY(session_id,user_id) REFERENCES sessions(id,user_id) ON DELETE CASCADE
);
CREATE INDEX coding_evidence_lookup ON coding_execution_evidence(session_id,question_index,code_hash,created_at DESC);
CREATE FUNCTION enforce_phase7_evaluation() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE total numeric; rubric_kind text;
BEGIN
  IF NEW.scoring_policy_version<>'rubric-v1' THEN RETURN NEW; END IF;
  IF NEW.rubric_kind_snapshot IS NULL THEN RAISE EXCEPTION 'Rubric classification required' USING ERRCODE='23514'; END IF;
  IF NEW.rubric_version_id IS NULL AND (NEW.status<>'abstained' OR NEW.rubric_kind_snapshot<>'unavailable') THEN
    RAISE EXCEPTION 'Missing rubric must abstain' USING ERRCODE='23514'; END IF;
  IF NEW.rubric_version_id IS NOT NULL THEN
    SELECT v.kind INTO rubric_kind FROM rubric_versions v WHERE v.id=NEW.rubric_version_id;
    IF NEW.rubric_kind_snapshot='reviewed' AND (rubric_kind<>'known' OR NOT EXISTS(SELECT 1 FROM rubric_review_approvals WHERE rubric_version_id=NEW.rubric_version_id)) THEN
      RAISE EXCEPTION 'Reviewed result requires exact human rubric approval' USING ERRCODE='23514'; END IF;
    IF NEW.rubric_kind_snapshot='provisional' AND NEW.evaluator_confidence='high' THEN
      RAISE EXCEPTION 'Provisional confidence ceiling medium' USING ERRCODE='23514'; END IF;
  END IF;
  IF NEW.status='succeeded' THEN
    IF NOT NEW.dimensions ?& ARRAY['correctness','concept-coverage','reasoning','practical-application','trade-off-awareness'] OR jsonb_object_length_safe(NEW.dimensions)<>5 THEN
      RAISE EXCEPTION 'Five frozen technical dimensions required' USING ERRCODE='23514'; END IF;
    total:=round(25*((NEW.dimensions->>'correctness')::numeric*45+(NEW.dimensions->>'concept-coverage')::numeric*20+
      (NEW.dimensions->>'reasoning')::numeric*20+(NEW.dimensions->>'practical-application')::numeric*10+(NEW.dimensions->>'trade-off-awareness')::numeric*5)/100,1);
    IF NEW.technical_score IS DISTINCT FROM total THEN RAISE EXCEPTION 'Technical total must match frozen policy' USING ERRCODE='23514'; END IF;
    IF NEW.objective_evidence->>'status'='failed' AND (NEW.dimensions->>'correctness')::numeric<>0 THEN
      RAISE EXCEPTION 'Objective failure cannot be overridden' USING ERRCODE='23514'; END IF;
  END IF;
  IF NEW.supersedes_id IS NULL AND NEW.revision<>1 THEN RAISE EXCEPTION 'First revision must be one' USING ERRCODE='23514'; END IF;
  IF NEW.supersedes_id IS NOT NULL AND NEW.revision<>(SELECT revision+1 FROM evaluations WHERE id=NEW.supersedes_id) THEN
    RAISE EXCEPTION 'Reevaluation must link preceding revision' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
-- Kept separate so installations using older PostgreSQL JSON helpers remain supported.
CREATE FUNCTION jsonb_object_length_safe(v jsonb) RETURNS integer LANGUAGE sql IMMUTABLE AS $$ SELECT count(*)::integer FROM jsonb_object_keys(v) $$;
CREATE TRIGGER phase7_evaluation_policy BEFORE INSERT OR UPDATE ON evaluations FOR EACH ROW EXECUTE FUNCTION enforce_phase7_evaluation();
CREATE FUNCTION phase7_evidence_seal() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' AND pg_trigger_depth()>1 THEN RETURN OLD; END IF;
  IF TG_OP<>'INSERT' AND EXISTS(SELECT 1 FROM evaluations WHERE id=OLD.evaluation_id AND scoring_policy_version='rubric-v1') THEN
    RAISE EXCEPTION 'Evaluation evidence is immutable' USING ERRCODE='23514'; END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER phase7_evidence_sealed BEFORE UPDATE OR DELETE ON evaluation_evidence FOR EACH ROW EXECUTE FUNCTION phase7_evidence_seal();
CREATE FUNCTION phase7_evaluation_delete() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.scoring_policy_version='rubric-v1' AND pg_trigger_depth()=1 THEN
    RAISE EXCEPTION 'Evaluations are historical; delete the owned session instead' USING ERRCODE='23514'; END IF;
  RETURN OLD;
END $$;
CREATE TRIGGER phase7_evaluation_history BEFORE DELETE ON evaluations FOR EACH ROW EXECUTE FUNCTION phase7_evaluation_delete();
CREATE FUNCTION phase7_concept_completeness() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target uuid; e evaluations;
BEGIN
  IF TG_TABLE_NAME='evaluations' THEN target:=coalesce(NEW.id,OLD.id);
  ELSE target:=coalesce(NEW.evaluation_id,OLD.evaluation_id); END IF;
  SELECT * INTO e FROM evaluations WHERE id=target;
  IF FOUND AND e.scoring_policy_version='rubric-v1' AND e.status='succeeded' AND (
    (SELECT count(*) FROM evaluation_evidence WHERE evaluation_id=e.id)<>(SELECT count(*) FROM expected_concepts WHERE rubric_version_id=e.rubric_version_id)
    OR (SELECT count(DISTINCT expected_concept_id) FROM evaluation_evidence WHERE evaluation_id=e.id)<>(SELECT count(*) FROM expected_concepts WHERE rubric_version_id=e.rubric_version_id)) THEN
    RAISE EXCEPTION 'Every concept requires one evidence judgment' USING ERRCODE='23514';
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER phase7_evaluation_concepts AFTER INSERT ON evaluations DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION phase7_concept_completeness();
CREATE CONSTRAINT TRIGGER phase7_evidence_concepts AFTER INSERT OR UPDATE OR DELETE ON evaluation_evidence DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION phase7_concept_completeness();
