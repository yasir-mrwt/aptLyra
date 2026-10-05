-- Preparatory relational structures only: no runtime execution or vector model.
CREATE DOMAIN knowledge_hash AS TEXT CHECK (VALUE ~ '^[0-9a-f]{64}$');
CREATE DOMAIN knowledge_json AS JSONB CHECK (octet_length(VALUE::text) <= 65536);

CREATE TABLE taxonomy_versions (
  id TEXT PRIMARY KEY CHECK (length(id) BETWEEN 1 AND 100),
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','deprecated')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE competencies (
  taxonomy_version TEXT NOT NULL REFERENCES taxonomy_versions(id),
  id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('root','child')),
  parent_id TEXT,
  parent_kind TEXT,
  display_name TEXT NOT NULL CHECK (length(display_name) BETWEEN 1 AND 200),
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','deprecated')),
  sort_order INTEGER NOT NULL CHECK (sort_order >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (taxonomy_version,id),
  UNIQUE (taxonomy_version,id,kind),
  FOREIGN KEY (taxonomy_version,parent_id,parent_kind) REFERENCES competencies(taxonomy_version,id,kind),
  CHECK ((kind='root' AND parent_id IS NULL AND parent_kind IS NULL AND id ~ '^[a-z][a-z0-9-]*$') OR
         (kind='child' AND parent_id IS NOT NULL AND parent_kind IS NOT NULL AND parent_kind='root' AND id ~ '^[a-z][a-z0-9-]*\.[a-z][a-z0-9-]*$'
          AND split_part(id,'.',1)=parent_id))
);
CREATE INDEX idx_competencies_parent ON competencies(taxonomy_version,parent_id);

CREATE TABLE sources (
  id UUID PRIMARY KEY,
  stable_key TEXT NOT NULL UNIQUE CHECK (length(stable_key) BETWEEN 1 AND 200),
  source_type TEXT NOT NULL CHECK (source_type IN ('authored','licensed-reference','permitted-api','voluntary-experience')),
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 500),
  origin TEXT CHECK (length(origin) <= 2000),
  permission_status TEXT NOT NULL DEFAULT 'unknown' CHECK (permission_status IN ('unknown','permitted','rejected','expired')),
  license_id TEXT,
  terms_revision TEXT,
  policy_revision TEXT NOT NULL,
  permission_evidence TEXT CHECK (length(permission_evidence) <= 4000),
  attribution TEXT CHECK (length(attribution) <= 4000),
  review_status TEXT NOT NULL DEFAULT 'proposed' CHECK (review_status IN ('proposed','approved','rejected')),
  state TEXT NOT NULL DEFAULT 'disabled' CHECK (state IN ('disabled','enabled','suspended')),
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,
  last_verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (state <> 'enabled' OR (permission_status='permitted' AND review_status='approved'
    AND reviewed_at IS NOT NULL AND nullif(btrim(reviewed_by),'') IS NOT NULL
    AND nullif(btrim(permission_evidence),'') IS NOT NULL AND nullif(btrim(terms_revision),'') IS NOT NULL))
);
CREATE TABLE source_documents (
  id UUID PRIMARY KEY,
  source_id UUID NOT NULL REFERENCES sources(id),
  external_key TEXT NOT NULL CHECK (length(external_key) BETWEEN 1 AND 500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (source_id,external_key)
);
CREATE INDEX idx_source_documents_source ON source_documents(source_id);
CREATE TABLE source_document_versions (
  id UUID PRIMARY KEY,
  document_id UUID NOT NULL REFERENCES source_documents(id),
  version INTEGER NOT NULL CHECK (version > 0),
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 500),
  canonical_url TEXT CHECK (length(canonical_url) <= 2000),
  occurred_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  fetched_at TIMESTAMPTZ,
  reviewed_at TIMESTAMPTZ,
  reviewed_by TEXT,
  content_hash knowledge_hash NOT NULL,
  normalized_text TEXT CHECK (octet_length(normalized_text) <= 1048576),
  permission_status TEXT NOT NULL DEFAULT 'unknown' CHECK (permission_status IN ('unknown','permitted','rejected','expired')),
  policy_revision TEXT NOT NULL,
  review_status TEXT NOT NULL DEFAULT 'pending' CHECK (review_status IN ('pending','approved','rejected')),
  quality TEXT NOT NULL DEFAULT 'unverified' CHECK (quality IN ('technical-reference','reported-experience','unverified')),
  pii_status TEXT NOT NULL DEFAULT 'pending' CHECK (pii_status IN ('pending','clear','redacted','rejected')),
  confidentiality_status TEXT NOT NULL DEFAULT 'pending' CHECK (confidentiality_status IN ('pending','clear','rejected')),
  status TEXT NOT NULL DEFAULT 'quarantined' CHECK (status IN ('quarantined','published','superseded','withdrawn','rejected')),
  withdrawal_reason TEXT,
  redacted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (document_id,version),
  CHECK (status NOT IN ('published','superseded') OR (permission_status='permitted' AND review_status='approved'
    AND pii_status IN ('clear','redacted') AND confidentiality_status='clear' AND reviewed_at IS NOT NULL
    AND nullif(btrim(reviewed_by),'') IS NOT NULL)),
  CHECK (status <> 'withdrawn' OR nullif(btrim(withdrawal_reason),'') IS NOT NULL)
);
CREATE INDEX idx_document_versions_status ON source_document_versions(status,quality,occurred_at);
CREATE INDEX idx_document_versions_hash ON source_document_versions(content_hash);
CREATE TABLE source_chunks (
  id UUID PRIMARY KEY,
  document_version_id UUID NOT NULL REFERENCES source_document_versions(id),
  chunk_index INTEGER NOT NULL CHECK (chunk_index >= 0),
  excerpt TEXT CHECK (octet_length(excerpt) <= 16000),
  content_hash knowledge_hash NOT NULL,
  chunker_version TEXT NOT NULL,
  section TEXT CHECK (length(section) <= 500),
  start_offset INTEGER CHECK (start_offset >= 0),
  end_offset INTEGER,
  status TEXT NOT NULL DEFAULT 'staged' CHECK (status IN ('staged','active','retired')),
  redacted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (document_version_id,chunk_index),
  UNIQUE (id,document_version_id),
  CHECK ((start_offset IS NULL AND end_offset IS NULL) OR (start_offset IS NOT NULL AND end_offset IS NOT NULL AND end_offset >= start_offset)),
  CHECK (status <> 'active' OR nullif(btrim(excerpt),'') IS NOT NULL)
);

CREATE TABLE interview_questions (
  id UUID PRIMARY KEY,
  family_key TEXT NOT NULL CHECK (length(family_key) BETWEEN 1 AND 200),
  taxonomy_version TEXT NOT NULL,
  primary_competency TEXT NOT NULL,
  competency_kind TEXT NOT NULL DEFAULT 'child' CHECK (competency_kind='child'),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','retired')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (id,taxonomy_version,primary_competency),
  FOREIGN KEY (taxonomy_version,primary_competency,competency_kind) REFERENCES competencies(taxonomy_version,id,kind)
);
CREATE INDEX idx_questions_family ON interview_questions(family_key);
CREATE TABLE question_versions (
  id UUID PRIMARY KEY,
  question_id UUID NOT NULL,
  version INTEGER NOT NULL CHECK (version > 0),
  taxonomy_version TEXT NOT NULL,
  primary_competency TEXT NOT NULL,
  question_text TEXT NOT NULL CHECK (length(btrim(question_text)) > 0 AND octet_length(question_text) <= 16000),
  category TEXT NOT NULL CHECK (category IN ('conceptual-oral','scenario','coding','debugging','sql','system-design-lite')),
  difficulty TEXT NOT NULL CHECK (difficulty IN ('easy','standard','stretch')),
  origin TEXT NOT NULL CHECK (origin IN ('retrieved','generated','adapted','fallback','follow-up')),
  evidence_status TEXT NOT NULL CHECK (evidence_status IN ('available','unavailable')),
  base_version_id UUID REFERENCES question_versions(id),
  transformation_summary TEXT CHECK (length(transformation_summary) <= 4000),
  generation_metadata knowledge_json NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(generation_metadata)='object'),
  content_hash knowledge_hash NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','retired')),
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (question_id,version),
  UNIQUE (id,question_id),
  UNIQUE (id,taxonomy_version,primary_competency,category,difficulty,origin),
  FOREIGN KEY (question_id,taxonomy_version,primary_competency) REFERENCES interview_questions(id,taxonomy_version,primary_competency),
  CHECK (base_version_id IS NULL OR base_version_id <> id),
  CHECK (origin <> 'adapted' OR (base_version_id IS NOT NULL AND nullif(btrim(transformation_summary),'') IS NOT NULL)),
  CHECK (origin <> 'retrieved' OR evidence_status='available'),
  CHECK ((reviewed_by IS NULL)=(reviewed_at IS NULL))
);
CREATE INDEX idx_question_versions_selection ON question_versions(taxonomy_version,primary_competency,difficulty,status);
CREATE TABLE question_version_competencies (
  question_version_id UUID NOT NULL REFERENCES question_versions(id),
  taxonomy_version TEXT NOT NULL,
  competency_id TEXT NOT NULL,
  competency_kind TEXT NOT NULL DEFAULT 'child' CHECK (competency_kind='child'),
  PRIMARY KEY (question_version_id,competency_id),
  FOREIGN KEY (taxonomy_version,competency_id,competency_kind) REFERENCES competencies(taxonomy_version,id,kind)
);
CREATE TABLE question_provenance (
  id UUID PRIMARY KEY,
  question_version_id UUID NOT NULL REFERENCES question_versions(id),
  document_version_id UUID NOT NULL REFERENCES source_document_versions(id),
  chunk_id UUID,
  relation TEXT NOT NULL CHECK (relation IN ('origin','technical-grounding','editorial')),
  FOREIGN KEY (chunk_id,document_version_id) REFERENCES source_chunks(id,document_version_id)
);
CREATE INDEX idx_question_provenance_question ON question_provenance(question_version_id);

CREATE TABLE rubrics (
  id UUID PRIMARY KEY,
  question_id UUID NOT NULL REFERENCES interview_questions(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (id,question_id)
);
CREATE TABLE rubric_versions (
  id UUID PRIMARY KEY,
  rubric_id UUID NOT NULL,
  question_id UUID NOT NULL,
  question_version_id UUID NOT NULL,
  version INTEGER NOT NULL CHECK (version > 0),
  kind TEXT NOT NULL CHECK (kind IN ('known','provisional')),
  status TEXT NOT NULL CHECK (status IN ('provisional','reviewed','retired')),
  scoring_policy_version TEXT NOT NULL CHECK (length(scoring_policy_version) BETWEEN 1 AND 100),
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,
  fatal_rule knowledge_json NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(fatal_rule)='object'),
  creation_transaction XID8 NOT NULL DEFAULT pg_current_xact_id(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (rubric_id,version),
  UNIQUE (id,question_version_id),
  UNIQUE (id,question_version_id,scoring_policy_version),
  FOREIGN KEY (rubric_id,question_id) REFERENCES rubrics(id,question_id),
  FOREIGN KEY (question_version_id,question_id) REFERENCES question_versions(id,question_id),
  CHECK ((kind='provisional' AND status IN ('provisional','retired') AND reviewed_by IS NULL AND reviewed_at IS NULL) OR
         (kind='known' AND status IN ('reviewed','retired') AND nullif(btrim(reviewed_by),'') IS NOT NULL AND reviewed_at IS NOT NULL))
);
CREATE TABLE rubric_dimensions (
  rubric_version_id UUID NOT NULL REFERENCES rubric_versions(id),
  dimension TEXT NOT NULL CHECK (dimension IN ('correctness','concept-coverage','reasoning','practical-application','trade-off-awareness','communication-clarity')),
  aggregation_kind TEXT NOT NULL CHECK (aggregation_kind IN ('technical','delivery')),
  applicable BOOLEAN NOT NULL,
  weight NUMERIC(6,3) NOT NULL CHECK (weight BETWEEN 0 AND 100),
  anchors knowledge_json NOT NULL CHECK (jsonb_typeof(anchors)='object' AND anchors ?& ARRAY['0','1','2','3','4']),
  PRIMARY KEY (rubric_version_id,dimension),
  CHECK ((dimension='communication-clarity' AND aggregation_kind='delivery' AND weight=0) OR
         (dimension<>'communication-clarity' AND aggregation_kind='technical')),
  CHECK (applicable OR weight=0),
  CHECK (dimension NOT IN ('correctness','concept-coverage','reasoning') OR (applicable AND weight>0))
);
CREATE TABLE expected_concepts (
  id UUID PRIMARY KEY,
  rubric_version_id UUID NOT NULL REFERENCES rubric_versions(id),
  stable_key TEXT NOT NULL CHECK (length(stable_key) BETWEEN 1 AND 200),
  label TEXT NOT NULL CHECK (length(label) BETWEEN 1 AND 500),
  description TEXT NOT NULL CHECK (length(description) BETWEEN 1 AND 4000),
  importance_weight NUMERIC(6,3) NOT NULL CHECK (importance_weight > 0 AND importance_weight <= 100),
  essential BOOLEAN NOT NULL DEFAULT false,
  critical BOOLEAN NOT NULL DEFAULT false,
  alternatives knowledge_json NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(alternatives)='array'),
  observable_anchors knowledge_json NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(observable_anchors)='object'),
  review_status TEXT NOT NULL CHECK (review_status IN ('provisional','reviewed')),
  UNIQUE (rubric_version_id,stable_key),
  UNIQUE (id,rubric_version_id)
);
CREATE TABLE concept_references (
  concept_id UUID NOT NULL REFERENCES expected_concepts(id),
  chunk_id UUID NOT NULL REFERENCES source_chunks(id),
  PRIMARY KEY (concept_id,chunk_id)
);

-- Composite ownership FKs reject forged session/user associations.
ALTER TABLE sessions ADD CONSTRAINT uq_sessions_owner UNIQUE (id,user_id);
CREATE TABLE interview_plans (
  id UUID PRIMARY KEY,
  session_id UUID NOT NULL,
  user_id UUID NOT NULL,
  contract_version TEXT NOT NULL,
  planner_version TEXT NOT NULL,
  taxonomy_version TEXT NOT NULL REFERENCES taxonomy_versions(id),
  corpus_version TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('Software Engineer','Backend Developer','Full Stack Developer')),
  level TEXT NOT NULL CHECK (level='junior'),
  mode TEXT NOT NULL CHECK (mode IN ('oral','coding','mixed')),
  requested_count INTEGER NOT NULL CHECK (requested_count BETWEEN 1 AND 20),
  effective_count INTEGER NOT NULL CHECK (effective_count BETWEEN 0 AND 20 AND effective_count <= requested_count),
  requested_minutes NUMERIC(6,2) NOT NULL CHECK (requested_minutes > 0 AND requested_minutes <= 60),
  effective_minutes NUMERIC(6,2) NOT NULL CHECK (effective_minutes > 0 AND effective_minutes <= requested_minutes),
  difficulty_distribution knowledge_json NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(difficulty_distribution)='object'),
  modifiers knowledge_json NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(modifiers)='object'),
  coverage knowledge_json NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(coverage)='object'),
  time_budget knowledge_json NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(time_budget)='object'),
  shortages knowledge_json NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(shortages)='array'),
  status TEXT NOT NULL DEFAULT 'building' CHECK (status IN ('building','ready','active','completed','failed')),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (id,session_id,user_id),
  UNIQUE (id,taxonomy_version),
  FOREIGN KEY (session_id,user_id) REFERENCES sessions(id,user_id) ON DELETE CASCADE
);
CREATE INDEX idx_plans_session_owner ON interview_plans(session_id,user_id);
CREATE TABLE plan_competencies (
  plan_id UUID NOT NULL,
  taxonomy_version TEXT NOT NULL,
  competency_id TEXT NOT NULL,
  competency_kind TEXT NOT NULL DEFAULT 'root' CHECK (competency_kind='root'),
  PRIMARY KEY (plan_id,competency_id),
  FOREIGN KEY (plan_id,taxonomy_version) REFERENCES interview_plans(id,taxonomy_version) ON DELETE CASCADE,
  FOREIGN KEY (taxonomy_version,competency_id,competency_kind) REFERENCES competencies(taxonomy_version,id,kind)
);
CREATE TABLE retrieval_evidence (
  id UUID PRIMARY KEY,
  operation_key TEXT NOT NULL UNIQUE CHECK (length(operation_key) BETWEEN 1 AND 200),
  session_id UUID,
  user_id UUID,
  plan_id UUID,
  redacted_query TEXT CHECK (length(redacted_query) <= 500),
  query_hash knowledge_hash NOT NULL,
  filters knowledge_json NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(filters)='object'),
  embedding_metadata knowledge_json NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(embedding_metadata)='object'),
  corpus_version TEXT NOT NULL,
  source_policy_revision TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('hits','no-evidence','unavailable')),
  cache_hit BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (id,session_id,user_id),
  FOREIGN KEY (session_id,user_id) REFERENCES sessions(id,user_id) ON DELETE CASCADE,
  FOREIGN KEY (plan_id,session_id,user_id) REFERENCES interview_plans(id,session_id,user_id) ON DELETE CASCADE,
  CHECK ((session_id IS NULL)=(user_id IS NULL)),
  CHECK (plan_id IS NULL OR session_id IS NOT NULL)
);
CREATE INDEX idx_retrieval_session ON retrieval_evidence(session_id,user_id);
CREATE TABLE retrieval_results (
  id UUID PRIMARY KEY,
  retrieval_id UUID NOT NULL REFERENCES retrieval_evidence(id) ON DELETE CASCADE,
  question_version_id UUID REFERENCES question_versions(id),
  chunk_id UUID REFERENCES source_chunks(id),
  rank INTEGER NOT NULL CHECK (rank > 0 AND rank <= 100),
  similarity NUMERIC(8,6) CHECK (similarity BETWEEN -1 AND 1),
  selected BOOLEAN NOT NULL DEFAULT false,
  reason TEXT NOT NULL CHECK (length(reason) BETWEEN 1 AND 1000),
  UNIQUE (retrieval_id,rank),
  CHECK (num_nonnulls(question_version_id,chunk_id)=1)
);
CREATE TABLE plan_items (
  id UUID PRIMARY KEY,
  plan_id UUID NOT NULL,
  session_id UUID NOT NULL,
  user_id UUID NOT NULL,
  position INTEGER NOT NULL CHECK (position >= 0),
  question_version_id UUID NOT NULL,
  rubric_version_id UUID,
  taxonomy_version TEXT NOT NULL,
  primary_competency TEXT NOT NULL,
  category TEXT NOT NULL,
  difficulty TEXT NOT NULL,
  origin TEXT NOT NULL,
  retrieval_id UUID,
  selection_reason TEXT NOT NULL CHECK (length(selection_reason) BETWEEN 1 AND 1000),
  estimated_minutes NUMERIC(6,2) NOT NULL CHECK (estimated_minutes > 0 AND estimated_minutes <= 60),
  parent_item_id UUID,
  status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','active','answered','skipped')),
  UNIQUE (plan_id,position),
  UNIQUE (id,plan_id,session_id,user_id),
  UNIQUE (id,question_version_id),
  UNIQUE (id,plan_id),
  FOREIGN KEY (plan_id,session_id,user_id) REFERENCES interview_plans(id,session_id,user_id) ON DELETE CASCADE,
  FOREIGN KEY (plan_id,taxonomy_version) REFERENCES interview_plans(id,taxonomy_version) ON DELETE CASCADE,
  FOREIGN KEY (question_version_id,taxonomy_version,primary_competency,category,difficulty,origin)
    REFERENCES question_versions(id,taxonomy_version,primary_competency,category,difficulty,origin),
  FOREIGN KEY (rubric_version_id,question_version_id) REFERENCES rubric_versions(id,question_version_id),
  FOREIGN KEY (retrieval_id,session_id,user_id) REFERENCES retrieval_evidence(id,session_id,user_id),
  FOREIGN KEY (parent_item_id,plan_id) REFERENCES plan_items(id,plan_id),
  CHECK ((origin='follow-up')=(parent_item_id IS NOT NULL)),
  CHECK (parent_item_id IS NULL OR parent_item_id <> id)
);
CREATE UNIQUE INDEX uq_plan_item_probe ON plan_items(parent_item_id) WHERE parent_item_id IS NOT NULL;
CREATE TABLE answer_attempts (
  id UUID PRIMARY KEY,
  session_id UUID NOT NULL,
  user_id UUID NOT NULL,
  plan_id UUID NOT NULL,
  plan_item_id UUID NOT NULL,
  question_version_id UUID NOT NULL,
  attempt INTEGER NOT NULL CHECK (attempt > 0),
  input_kind TEXT NOT NULL CHECK (input_kind IN ('text','audio','code','diagram','mixed')),
  answer_text TEXT CHECK (octet_length(answer_text) <= 200000),
  code_text TEXT CHECK (octet_length(code_text) <= 200000),
  artifact_refs knowledge_json NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(artifact_refs)='array'),
  content_hash knowledge_hash NOT NULL,
  status TEXT NOT NULL DEFAULT 'received' CHECK (status IN ('received','transcribing','evaluating','evaluated','abstained','failed')),
  privacy_status TEXT NOT NULL DEFAULT 'present' CHECK (privacy_status IN ('present','redacted','deleted')),
  redacted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (plan_item_id,attempt),
  UNIQUE (id,question_version_id),
  FOREIGN KEY (plan_item_id,plan_id,session_id,user_id) REFERENCES plan_items(id,plan_id,session_id,user_id) ON DELETE CASCADE,
  FOREIGN KEY (plan_item_id,question_version_id) REFERENCES plan_items(id,question_version_id),
  CHECK (privacy_status='present' OR (answer_text IS NULL AND code_text IS NULL AND artifact_refs='[]'::jsonb AND redacted_at IS NOT NULL))
);
CREATE INDEX idx_answers_owner ON answer_attempts(session_id,user_id);
CREATE TABLE evaluations (
  id UUID PRIMARY KEY,
  answer_attempt_id UUID NOT NULL,
  question_version_id UUID NOT NULL,
  rubric_version_id UUID NOT NULL,
  scoring_policy_version TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK (revision > 0),
  supersedes_id UUID,
  status TEXT NOT NULL CHECK (status IN ('pending','succeeded','abstained','failed')),
  technical_score NUMERIC(5,2) CHECK (technical_score BETWEEN 0 AND 100),
  evaluator_confidence TEXT CHECK (evaluator_confidence IN ('high','medium','low')),
  reason_codes knowledge_json NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(reason_codes)='array'),
  dimensions knowledge_json NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(dimensions)='object'),
  delivery knowledge_json NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(delivery)='object'),
  model_metadata knowledge_json NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(model_metadata)='object'),
  prompt_version TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (answer_attempt_id,revision),
  UNIQUE (id,answer_attempt_id),
  UNIQUE (id,rubric_version_id),
  FOREIGN KEY (answer_attempt_id,question_version_id) REFERENCES answer_attempts(id,question_version_id) ON DELETE CASCADE,
  FOREIGN KEY (rubric_version_id,question_version_id,scoring_policy_version) REFERENCES rubric_versions(id,question_version_id,scoring_policy_version),
  FOREIGN KEY (supersedes_id,answer_attempt_id) REFERENCES evaluations(id,answer_attempt_id),
  CHECK (supersedes_id IS NULL OR supersedes_id<>id),
  CHECK ((status='succeeded' AND technical_score IS NOT NULL AND evaluator_confidence IS NOT NULL AND evaluator_confidence IN ('high','medium')) OR
    (status='abstained' AND technical_score IS NULL AND evaluator_confidence IS NOT NULL AND evaluator_confidence='low' AND jsonb_array_length(reason_codes)>0) OR
    (status IN ('pending','failed') AND technical_score IS NULL AND evaluator_confidence IS NULL))
);
CREATE TABLE evaluation_evidence (
  id UUID PRIMARY KEY,
  evaluation_id UUID NOT NULL,
  rubric_version_id UUID NOT NULL,
  expected_concept_id UUID NOT NULL,
  answer_start INTEGER CHECK (answer_start >= 0),
  answer_end INTEGER,
  artifact_or_test knowledge_json NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(artifact_or_test)='object'),
  reference_chunk_id UUID REFERENCES source_chunks(id),
  judgment TEXT NOT NULL CHECK (judgment IN ('satisfied','partial','absent','incorrect','unobservable')),
  explanation TEXT NOT NULL CHECK (length(explanation) BETWEEN 1 AND 4000),
  reason_code TEXT NOT NULL CHECK (length(reason_code) BETWEEN 1 AND 100),
  FOREIGN KEY (evaluation_id,rubric_version_id) REFERENCES evaluations(id,rubric_version_id) ON DELETE CASCADE,
  FOREIGN KEY (expected_concept_id,rubric_version_id) REFERENCES expected_concepts(id,rubric_version_id),
  FOREIGN KEY (expected_concept_id,reference_chunk_id) REFERENCES concept_references(concept_id,chunk_id),
  CHECK ((answer_start IS NULL AND answer_end IS NULL) OR (answer_start IS NOT NULL AND answer_end IS NOT NULL AND answer_end >= answer_start))
);
CREATE INDEX idx_evidence_evaluation ON evaluation_evidence(evaluation_id);

CREATE TABLE embedding_metadata (
  id UUID PRIMARY KEY,
  question_version_id UUID REFERENCES question_versions(id),
  chunk_id UUID REFERENCES source_chunks(id),
  purpose TEXT NOT NULL CHECK (purpose IN ('question-selection','technical-grounding')),
  model_id TEXT NOT NULL,
  model_revision TEXT NOT NULL,
  dimension INTEGER NOT NULL CHECK (dimension > 0 AND dimension <= 65536),
  normalization TEXT NOT NULL CHECK (normalization IN ('l2','none')),
  embedding_version TEXT NOT NULL,
  content_hash knowledge_hash NOT NULL,
  corpus_generation TEXT NOT NULL,
  index_generation TEXT,
  status TEXT NOT NULL DEFAULT 'staged' CHECK (status IN ('staged','active','retired')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (num_nonnulls(question_version_id,chunk_id)=1)
);
CREATE UNIQUE INDEX uq_embedding_question ON embedding_metadata(question_version_id,embedding_version,corpus_generation) WHERE question_version_id IS NOT NULL;
CREATE UNIQUE INDEX uq_embedding_chunk ON embedding_metadata(chunk_id,embedding_version,corpus_generation) WHERE chunk_id IS NOT NULL;

CREATE TABLE durable_operations (
  id UUID PRIMARY KEY,
  session_id UUID NOT NULL,
  user_id UUID NOT NULL,
  operation_type TEXT NOT NULL CHECK (operation_type IN ('plan','transcribe','evaluate','follow-up','report','delete')),
  idempotency_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','succeeded','retryable_failed','terminal_failed')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  lease_expires_at TIMESTAMPTZ,
  deadline TIMESTAMPTZ,
  payload_hash knowledge_hash NOT NULL,
  session_revision INTEGER NOT NULL CHECK (session_revision >= 0),
  error_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (session_id,operation_type,idempotency_key),
  FOREIGN KEY (session_id,user_id) REFERENCES sessions(id,user_id) ON DELETE CASCADE,
  CHECK (status<>'running' OR lease_expires_at IS NOT NULL)
);
CREATE INDEX idx_operations_recovery ON durable_operations(status,lease_expires_at);
CREATE TABLE transactional_outbox (
  id UUID PRIMARY KEY,
  session_id UUID NOT NULL,
  user_id UUID NOT NULL,
  aggregate_revision INTEGER NOT NULL CHECK (aggregate_revision >= 0),
  event_type TEXT NOT NULL,
  payload knowledge_json NOT NULL CHECK (jsonb_typeof(payload)='object'),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','published','failed')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (session_id,user_id) REFERENCES sessions(id,user_id) ON DELETE CASCADE,
  CHECK (status<>'published' OR published_at IS NOT NULL)
);
CREATE INDEX idx_outbox_pending ON transactional_outbox(status,created_at);
CREATE TABLE reward_ledger (
  id UUID PRIMARY KEY,
  session_id UUID NOT NULL,
  user_id UUID NOT NULL,
  reward_key TEXT NOT NULL,
  amount INTEGER NOT NULL CHECK (amount >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (session_id,reward_key),
  FOREIGN KEY (session_id,user_id) REFERENCES sessions(id,user_id) ON DELETE CASCADE
);

-- Database immutability complements repository conventions, with explicit
-- withdrawal/redaction exceptions for source content, not arbitrary edits.
CREATE FUNCTION protect_question_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN
    IF OLD.status<>'draft' THEN RAISE EXCEPTION 'Published question versions cannot be deleted' USING ERRCODE='23514'; END IF;
    RETURN OLD;
  END IF;
  IF OLD.status<>'draft' AND (to_jsonb(NEW)-'status') IS DISTINCT FROM (to_jsonb(OLD)-'status') THEN
    RAISE EXCEPTION 'Published question versions are immutable' USING ERRCODE='23514';
  END IF;
  IF OLD.status<>'draft' AND NEW.status='draft' THEN RAISE EXCEPTION 'Cannot unpublish a question version' USING ERRCODE='23514'; END IF;
  IF OLD.status='retired' AND NEW.status<>'retired' THEN RAISE EXCEPTION 'Retired question versions remain retired' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER question_version_immutable BEFORE UPDATE OR DELETE ON question_versions FOR EACH ROW EXECUTE FUNCTION protect_question_version();

CREATE FUNCTION check_question_lineage() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v question_versions; target UUID;
BEGIN
  IF TG_TABLE_NAME='question_versions' THEN target := COALESCE(NEW.id,OLD.id);
  ELSE target := COALESCE(NEW.question_version_id,OLD.question_version_id); END IF;
  SELECT * INTO v FROM question_versions WHERE id=target;
  IF FOUND AND v.status IN ('published','retired') AND v.evidence_status='available'
     AND NOT EXISTS (SELECT 1 FROM question_provenance WHERE question_version_id=target) THEN
    RAISE EXCEPTION 'Available provenance requires a real source version' USING ERRCODE='23514';
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER question_lineage_check AFTER INSERT OR UPDATE ON question_versions DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_question_lineage();
CREATE CONSTRAINT TRIGGER provenance_lineage_check AFTER INSERT OR UPDATE OR DELETE ON question_provenance DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_question_lineage();

CREATE FUNCTION protect_question_child() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target UUID; taxonomy TEXT;
BEGIN
  target := CASE WHEN TG_OP='DELETE' THEN OLD.question_version_id ELSE NEW.question_version_id END;
  SELECT taxonomy_version INTO taxonomy FROM question_versions WHERE id=target;
  IF EXISTS (SELECT 1 FROM question_versions WHERE id=target AND status<>'draft') OR
     (TG_OP='UPDATE' AND EXISTS (SELECT 1 FROM question_versions WHERE id=OLD.question_version_id AND status<>'draft')) THEN
    RAISE EXCEPTION 'Published question lineage/tags are immutable' USING ERRCODE='23514';
  END IF;
  IF TG_TABLE_NAME='question_version_competencies' AND TG_OP<>'DELETE' THEN
    IF NEW.taxonomy_version<>taxonomy THEN RAISE EXCEPTION 'Secondary taxonomy mismatch' USING ERRCODE='23514'; END IF;
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER question_tags_immutable BEFORE INSERT OR UPDATE OR DELETE ON question_version_competencies FOR EACH ROW EXECUTE FUNCTION protect_question_child();
CREATE TRIGGER question_provenance_immutable BEFORE INSERT OR UPDATE OR DELETE ON question_provenance FOR EACH ROW EXECUTE FUNCTION protect_question_child();

CREATE FUNCTION protect_document_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN
    IF OLD.status IN ('published','superseded','withdrawn') THEN RAISE EXCEPTION 'Historical source identity must be retained' USING ERRCODE='23514'; END IF;
    RETURN OLD;
  END IF;
  IF NEW.status='published' AND NOT EXISTS (
    SELECT 1 FROM source_documents d JOIN sources s ON s.id=d.source_id
    WHERE d.id=NEW.document_id AND s.state='enabled' AND s.permission_status='permitted' AND s.review_status='approved'
  ) THEN RAISE EXCEPTION 'Publication requires an enabled permitted reviewed source' USING ERRCODE='23514'; END IF;
  IF TG_OP='INSERT' THEN RETURN NEW; END IF;
  IF OLD.status IN ('published','superseded','withdrawn') THEN
    IF NEW.status NOT IN ('published','superseded','withdrawn') OR (OLD.status='withdrawn' AND NEW.status<>'withdrawn') OR
       (to_jsonb(NEW)-ARRAY['status','normalized_text','redacted_at','withdrawal_reason']) IS DISTINCT FROM
       (to_jsonb(OLD)-ARRAY['status','normalized_text','redacted_at','withdrawal_reason']) OR
       (NEW.normalized_text IS DISTINCT FROM OLD.normalized_text AND NOT (NEW.status='withdrawn' AND NEW.normalized_text IS NULL AND NEW.redacted_at IS NOT NULL)) THEN
      RAISE EXCEPTION 'Published source versions are immutable except withdrawal/redaction' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER document_version_immutable BEFORE INSERT OR UPDATE OR DELETE ON source_document_versions FOR EACH ROW EXECUTE FUNCTION protect_document_version();

CREATE FUNCTION protect_chunk() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN
    IF OLD.status<>'staged' THEN RAISE EXCEPTION 'Historical chunks must be retired/redacted' USING ERRCODE='23514'; END IF;
    RETURN OLD;
  END IF;
  IF OLD.status<>'staged' AND ((to_jsonb(NEW)-ARRAY['status','excerpt','redacted_at']) IS DISTINCT FROM
     (to_jsonb(OLD)-ARRAY['status','excerpt','redacted_at']) OR NEW.status='staged' OR (OLD.status='retired' AND NEW.status<>'retired') OR
     (NEW.excerpt IS DISTINCT FROM OLD.excerpt AND NOT (NEW.status='retired' AND NEW.excerpt IS NULL AND NEW.redacted_at IS NOT NULL))) THEN
    RAISE EXCEPTION 'Active chunks are immutable except retirement/redaction' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER chunk_immutable BEFORE UPDATE OR DELETE ON source_chunks FOR EACH ROW EXECUTE FUNCTION protect_chunk();

CREATE FUNCTION validate_rubric_structure() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target UUID; v rubric_versions; count_dimensions INTEGER; total NUMERIC;
BEGIN
  IF TG_TABLE_NAME='rubric_versions' THEN target:=COALESCE(NEW.id,OLD.id);
  ELSE target:=COALESCE(NEW.rubric_version_id,OLD.rubric_version_id); END IF;
  SELECT * INTO v FROM rubric_versions WHERE id=target;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF NOT EXISTS (SELECT 1 FROM question_versions WHERE id=v.question_version_id AND status IN ('published','retired')) THEN
    RAISE EXCEPTION 'Rubric must pin a published question version' USING ERRCODE='23514';
  END IF;
  SELECT count(*),sum(weight) FILTER (WHERE aggregation_kind='technical' AND applicable)
    INTO count_dimensions,total FROM rubric_dimensions WHERE rubric_version_id=target;
  IF count_dimensions<>6 OR total IS DISTINCT FROM 100::NUMERIC THEN
    RAISE EXCEPTION 'Rubric requires six dimensions and technical weights summing to 100' USING ERRCODE='23514';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM expected_concepts WHERE rubric_version_id=target) THEN
    RAISE EXCEPTION 'Rubric requires expected concepts' USING ERRCODE='23514';
  END IF;
  IF EXISTS (SELECT 1 FROM expected_concepts c WHERE c.rubric_version_id=target AND
    (c.review_status <> CASE WHEN v.kind='known' THEN 'reviewed' ELSE 'provisional' END OR
      NOT EXISTS (SELECT 1 FROM concept_references r WHERE r.concept_id=c.id))) THEN
    RAISE EXCEPTION 'Concepts require matching review status and technical references' USING ERRCODE='23514';
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER rubric_structure AFTER INSERT OR UPDATE ON rubric_versions DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_rubric_structure();
CREATE CONSTRAINT TRIGGER dimension_structure AFTER INSERT OR UPDATE OR DELETE ON rubric_dimensions DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_rubric_structure();
CREATE CONSTRAINT TRIGGER concept_structure AFTER INSERT OR UPDATE OR DELETE ON expected_concepts DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_rubric_structure();

CREATE FUNCTION protect_rubric_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Rubric versions are historical; retire them instead' USING ERRCODE='23514'; END IF;
  IF (to_jsonb(NEW)-'status') IS DISTINCT FROM (to_jsonb(OLD)-'status') OR
     (OLD.status='retired' AND NEW.status<>'retired') THEN
    RAISE EXCEPTION 'Rubric version changes require a new version' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER rubric_version_immutable BEFORE UPDATE OR DELETE ON rubric_versions FOR EACH ROW EXECUTE FUNCTION protect_rubric_version();

-- Child writes are permitted during creation in the same transaction only.
-- Thereafter a new rubric version is required, including provisional versions.
CREATE FUNCTION protect_rubric_child() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target UUID; chunk UUID;
BEGIN
  IF TG_TABLE_NAME='concept_references' THEN
    IF TG_OP='UPDATE' AND NEW.concept_id<>OLD.concept_id THEN RAISE EXCEPTION 'Cannot move a concept reference' USING ERRCODE='23514'; END IF;
    SELECT rubric_version_id INTO target FROM expected_concepts WHERE id=COALESCE(NEW.concept_id,OLD.concept_id);
    IF TG_OP<>'DELETE' THEN
      chunk:=NEW.chunk_id;
      IF NOT EXISTS (SELECT 1 FROM source_chunks c JOIN source_document_versions d ON d.id=c.document_version_id
        WHERE c.id=chunk AND d.quality='technical-reference' AND d.review_status='approved' AND d.permission_status='permitted') THEN
        RAISE EXCEPTION 'Concept reference must be a permitted reviewed technical source' USING ERRCODE='23514';
      END IF;
    END IF;
  ELSE
    IF TG_OP='UPDATE' AND NEW.rubric_version_id<>OLD.rubric_version_id THEN RAISE EXCEPTION 'Cannot move rubric children' USING ERRCODE='23514'; END IF;
    target:=COALESCE(NEW.rubric_version_id,OLD.rubric_version_id);
  END IF;
  IF EXISTS (SELECT 1 FROM rubric_versions WHERE id=target AND creation_transaction <> pg_current_xact_id()) THEN
    RAISE EXCEPTION 'Committed rubric children are immutable' USING ERRCODE='23514';
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER dimensions_immutable BEFORE INSERT OR UPDATE OR DELETE ON rubric_dimensions FOR EACH ROW EXECUTE FUNCTION protect_rubric_child();
CREATE TRIGGER concepts_immutable BEFORE INSERT OR UPDATE OR DELETE ON expected_concepts FOR EACH ROW EXECUTE FUNCTION protect_rubric_child();
CREATE TRIGGER concept_refs_immutable BEFORE INSERT OR UPDATE OR DELETE ON concept_references FOR EACH ROW EXECUTE FUNCTION protect_rubric_child();

CREATE FUNCTION validate_plan_parent() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.parent_item_id IS NOT NULL THEN
    PERFORM 1 FROM plan_items WHERE id=NEW.parent_item_id AND plan_id=NEW.plan_id FOR UPDATE;
    IF EXISTS (SELECT 1 FROM plan_items WHERE id=NEW.parent_item_id AND parent_item_id IS NOT NULL) THEN
      RAISE EXCEPTION 'Recursive follow-ups are forbidden' USING ERRCODE='23514';
    END IF;
  END IF;
  IF EXISTS (SELECT 1 FROM plan_items WHERE parent_item_id=NEW.id) AND NEW.parent_item_id IS NOT NULL THEN
    RAISE EXCEPTION 'An original with probes cannot become a probe' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER plan_parent_check BEFORE INSERT OR UPDATE ON plan_items FOR EACH ROW EXECUTE FUNCTION validate_plan_parent();

CREATE FUNCTION validate_evaluation() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE rubric_kind TEXT; prior_revision INTEGER;
BEGIN
  IF TG_OP='UPDATE' AND OLD.status<>'pending' AND NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'Terminal evaluations are immutable; create a reevaluation revision' USING ERRCODE='23514';
  END IF;
  SELECT kind INTO rubric_kind FROM rubric_versions WHERE id=NEW.rubric_version_id;
  IF rubric_kind='provisional' AND NEW.evaluator_confidence='high' THEN
    RAISE EXCEPTION 'Provisional evaluations cannot claim high confidence' USING ERRCODE='23514';
  END IF;
  IF NEW.supersedes_id IS NOT NULL THEN
    SELECT revision INTO prior_revision FROM evaluations WHERE id=NEW.supersedes_id;
    IF NEW.revision <= prior_revision THEN RAISE EXCEPTION 'Reevaluation revision must increase' USING ERRCODE='23514'; END IF;
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_each(NEW.dimensions) d WHERE
    d.key NOT IN ('correctness','concept-coverage','reasoning','practical-application','trade-off-awareness','communication-clarity') OR
    jsonb_typeof(d.value)<>'number') THEN RAISE EXCEPTION 'Invalid evaluation dimension' USING ERRCODE='23514'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_each(NEW.dimensions) d WHERE (d.value::text)::NUMERIC NOT BETWEEN 0 AND 4) THEN
    RAISE EXCEPTION 'Evaluation dimension must be bounded 0..4' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER evaluation_bounds BEFORE INSERT OR UPDATE ON evaluations FOR EACH ROW EXECUTE FUNCTION validate_evaluation();
