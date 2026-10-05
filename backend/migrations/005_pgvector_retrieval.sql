-- Forward-only, selected CPU MiniLM space: masked mean + L2, 384 dimensions.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_available_extensions WHERE name='vector') THEN
    RAISE EXCEPTION 'TechVera requires pgvector installed on the PostgreSQL server' USING ERRCODE='55000';
  END IF;
END $$;
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE embedding_generations (
  id TEXT PRIMARY KEY CHECK (id ~ '^corpus-[0-9a-f]{64}$'),
  model_id TEXT NOT NULL,
  model_revision TEXT NOT NULL,
  dimension INTEGER NOT NULL CHECK (dimension=384),
  normalization TEXT NOT NULL CHECK (normalization='l2'),
  embedding_version TEXT NOT NULL,
  entity_count INTEGER NOT NULL CHECK (entity_count BETWEEN 0 AND 10000),
  status TEXT NOT NULL DEFAULT 'staged' CHECK (status IN ('staged','active','retired')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  activated_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX uq_active_embedding_generation ON embedding_generations(status) WHERE status='active';
CREATE TABLE embedding_vectors (
  metadata_id UUID PRIMARY KEY REFERENCES embedding_metadata(id),
  duplicate_group TEXT NOT NULL CHECK (length(duplicate_group) BETWEEN 1 AND 200),
  value vector(384) NOT NULL CHECK (vector_norm(value) BETWEEN 0.999 AND 1.001)
);
CREATE UNIQUE INDEX uq_active_question_embedding ON embedding_metadata
  (question_version_id,purpose,model_id,model_revision,corpus_generation) WHERE status='active' AND question_version_id IS NOT NULL;
CREATE UNIQUE INDEX uq_active_chunk_embedding ON embedding_metadata
  (chunk_id,purpose,model_id,model_revision,corpus_generation) WHERE status='active' AND chunk_id IS NOT NULL;
CREATE INDEX idx_embedding_generation_status ON embedding_metadata(corpus_generation,status,purpose);

-- One authoritative eligibility chain reused by jobs and every new retrieval.
-- An actual enabled human reviewer and non-fixture adapter are required.
CREATE VIEW retrieval_available_chunks AS
SELECT c.*,d.id AS document_id,d.external_key,v.title AS document_title,v.quality,
  v.occurred_at,v.published_at,v.fetched_at,v.review_status,v.content_hash AS document_hash,
  s.id AS source_id,s.title AS source_title,s.source_type,s.license_id,s.attribution,s.policy_revision,
  s.stable_key,er.company_label,er.occurred_on,er.role AS experience_role,
  r.duplicates AS document_duplicates,r.duplicate_decision
FROM source_chunks c
JOIN source_document_versions v ON v.id=c.document_version_id
JOIN source_documents d ON d.id=v.document_id
JOIN sources s ON s.id=d.source_id
JOIN ingestion_adapters a ON a.source_id=s.id AND a.contract->>'fixture'='false'
JOIN ingestion_records r ON r.document_version_id=v.id AND r.source_id=s.id AND r.state='published'
JOIN ingestion_reviewers rv ON rv.id=v.reviewed_by AND rv.kind='human' AND rv.enabled
JOIN ingestion_reviewers rs ON rs.id=s.reviewed_by AND rs.kind='human' AND rs.enabled
LEFT JOIN interview_experience_records er ON er.document_version_id=v.id
  AND er.submitter_type<>'fixture' AND length(er.consent_evidence)>0 AND length(er.permission_revision)>0
WHERE c.status='active' AND c.excerpt IS NOT NULL AND v.status='published'
  AND v.permission_status='permitted' AND v.review_status='approved'
  AND v.pii_status IN ('clear','redacted') AND v.confidentiality_status='clear'
  AND s.state='enabled' AND s.permission_status='permitted' AND s.review_status='approved'
  AND (s.source_type<>'voluntary-experience' OR er.document_version_id IS NOT NULL);

CREATE VIEW retrieval_entities AS
SELECT q.id AS entity_id,'question'::text AS entity_type,'question-selection'::text AS purpose,
  q.question_text AS text,q.content_hash,q.question_id,f.family_key,q.taxonomy_version,
  q.primary_competency,q.category,q.difficulty,q.origin,q.generation_metadata->'roles' AS roles,
  ic.id AS candidate_id,ic.duplicate_links,
  jsonb_agg(DISTINCT jsonb_build_object('sourceId',c.source_id,'sourceTitle',c.source_title,
    'sourceType',c.source_type,'licenseId',c.license_id,'attribution',c.attribution,
    'documentId',c.document_id,'documentVersionId',c.document_version_id,'chunkId',c.id,
    'documentTitle',c.document_title,'externalKey',c.external_key,'quality',c.quality,
    'reviewStatus',c.review_status,'occurredAt',c.occurred_at,'occurredOn',c.occurred_on,
    'publishedAt',c.published_at,'fetchedAt',c.fetched_at,'policyRevision',c.policy_revision,
    'company',c.company_label,'experienceRole',c.experience_role,
    'documentDuplicates',c.document_duplicates,'duplicateDecision',c.duplicate_decision)) AS provenance
FROM question_versions q JOIN interview_questions f ON f.id=q.question_id AND f.status='active'
JOIN ingestion_candidates ic ON ic.question_version_id=q.id AND ic.state='published'
JOIN ingestion_reviewers rq ON rq.id=q.reviewed_by AND rq.kind='human' AND rq.enabled
JOIN competencies competency ON competency.taxonomy_version=q.taxonomy_version AND competency.id=q.primary_competency AND competency.status='active'
JOIN competencies root ON root.taxonomy_version=competency.taxonomy_version AND root.id=competency.parent_id AND root.status='active'
JOIN question_provenance p ON p.question_version_id=q.id
JOIN retrieval_available_chunks c ON c.document_version_id=p.document_version_id AND c.id=p.chunk_id
WHERE q.status='published' AND q.evidence_status='available' AND q.reviewed_at IS NOT NULL
GROUP BY q.id,f.family_key,ic.id
UNION ALL
SELECT c.id,'chunk','technical-grounding',c.excerpt,c.content_hash,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'[]'::jsonb,
  jsonb_build_array(jsonb_build_object('sourceId',c.source_id,'sourceTitle',c.source_title,
    'sourceType',c.source_type,'licenseId',c.license_id,'attribution',c.attribution,
    'documentId',c.document_id,'documentVersionId',c.document_version_id,'chunkId',c.id,
    'documentTitle',c.document_title,'externalKey',c.external_key,'quality',c.quality,
    'reviewStatus',c.review_status,'occurredAt',c.occurred_at,'occurredOn',c.occurred_on,
    'publishedAt',c.published_at,'fetchedAt',c.fetched_at,'policyRevision',c.policy_revision,
    'company',NULL,'experienceRole',NULL,'documentDuplicates',c.document_duplicates,
    'duplicateDecision',c.duplicate_decision))
FROM retrieval_available_chunks c WHERE c.quality='technical-reference' AND c.source_type<>'voluntary-experience';

CREATE FUNCTION validate_embedding_vector() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM embedding_metadata m JOIN embedding_generations g ON g.id=m.corpus_generation
    JOIN retrieval_entities e ON e.entity_id=coalesce(m.question_version_id,m.chunk_id) AND e.purpose=m.purpose AND e.content_hash=m.content_hash
    WHERE m.id=NEW.metadata_id AND m.dimension=384 AND m.normalization='l2'
      AND m.model_id=g.model_id AND m.model_revision=g.model_revision AND m.embedding_version=g.embedding_version
      AND ((m.question_version_id IS NOT NULL AND m.purpose='question-selection')
        OR (m.chunk_id IS NOT NULL AND m.purpose='technical-grounding'))) THEN
    RAISE EXCEPTION 'Vector metadata/generation mismatch' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER embedding_vector_guard BEFORE INSERT OR UPDATE ON embedding_vectors FOR EACH ROW EXECUTE FUNCTION validate_embedding_vector();

CREATE FUNCTION protect_vector_metadata() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS(SELECT 1 FROM embedding_vectors WHERE metadata_id=OLD.id) AND
    (ROW(NEW.id,NEW.question_version_id,NEW.chunk_id,NEW.purpose,NEW.model_id,NEW.model_revision,NEW.dimension,
      NEW.normalization,NEW.embedding_version,NEW.content_hash,NEW.corpus_generation,NEW.created_at)
     IS DISTINCT FROM ROW(OLD.id,OLD.question_version_id,OLD.chunk_id,OLD.purpose,OLD.model_id,OLD.model_revision,OLD.dimension,
      OLD.normalization,OLD.embedding_version,OLD.content_hash,OLD.corpus_generation,OLD.created_at)
     OR (OLD.status='retired' AND NEW.status<>'retired')) THEN
    RAISE EXCEPTION 'Stored vector identity is immutable; create a new version/generation' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER vector_metadata_identity BEFORE UPDATE ON embedding_metadata FOR EACH ROW EXECUTE FUNCTION protect_vector_metadata();

CREATE FUNCTION validate_active_embedding_space() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM embedding_metadata m JOIN embedding_vectors ev ON ev.metadata_id=m.id
    LEFT JOIN embedding_generations g ON g.id=m.corpus_generation AND g.status='active'
    WHERE m.status='active' AND (g.id IS NULL OR m.model_id<>g.model_id OR m.model_revision<>g.model_revision
      OR m.dimension<>g.dimension OR m.normalization<>g.normalization OR m.embedding_version<>g.embedding_version)) THEN
    RAISE EXCEPTION 'Active embedding space mismatch' USING ERRCODE='23514';
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER active_embedding_space AFTER INSERT OR UPDATE ON embedding_metadata
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_active_embedding_space();
CREATE CONSTRAINT TRIGGER active_generation_space AFTER INSERT OR UPDATE ON embedding_generations
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_active_embedding_space();

CREATE FUNCTION retire_unavailable_embeddings() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('ingestion:editorial:v1',0));
  UPDATE embedding_metadata m SET status='retired' WHERE m.status IN ('staged','active')
    AND EXISTS(SELECT 1 FROM embedding_vectors ev WHERE ev.metadata_id=m.id)
    AND NOT EXISTS(SELECT 1 FROM retrieval_entities e WHERE e.entity_id=coalesce(m.question_version_id,m.chunk_id) AND e.purpose=m.purpose);
  RETURN NULL;
END $$;
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['sources','source_documents','source_document_versions','source_chunks','interview_questions','question_versions',
    'ingestion_records','ingestion_candidates','ingestion_adapters','ingestion_reviewers','competencies','interview_experience_records'] LOOP
    EXECUTE format('CREATE TRIGGER retire_embeddings_after_update AFTER UPDATE OR DELETE ON %I FOR EACH STATEMENT EXECUTE FUNCTION retire_unavailable_embeddings()',t);
  END LOOP;
END $$;

ALTER TABLE retrieval_evidence DROP CONSTRAINT retrieval_evidence_outcome_check;
ALTER TABLE retrieval_evidence ADD CONSTRAINT retrieval_evidence_outcome_check CHECK
  (outcome IN ('hits','no-evidence','unavailable','success','no_match','invalid_filters','model_mismatch','corpus_unavailable'));
ALTER TABLE retrieval_results ADD COLUMN provenance_snapshot knowledge_json NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(provenance_snapshot)='array');
CREATE FUNCTION validate_retrieval_lineage_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE p jsonb;
BEGIN
  FOR p IN SELECT * FROM jsonb_array_elements(NEW.provenance_snapshot) LOOP
    IF NOT EXISTS (SELECT 1 FROM source_chunks c JOIN source_document_versions v ON v.id=c.document_version_id
      JOIN source_documents d ON d.id=v.document_id JOIN sources s ON s.id=d.source_id
      WHERE c.id=(p->>'chunkId')::uuid AND v.id=(p->>'documentVersionId')::uuid AND d.id=(p->>'documentId')::uuid
        AND s.id=(p->>'sourceId')::uuid AND s.title=p->>'sourceTitle' AND s.source_type=p->>'sourceType'
        AND (s.license_id IS NOT DISTINCT FROM p->>'licenseId') AND (s.attribution IS NOT DISTINCT FROM p->>'attribution')
        AND ((NEW.chunk_id IS NOT NULL AND NEW.chunk_id=c.id) OR EXISTS(SELECT 1 FROM question_provenance qp
          WHERE qp.question_version_id=NEW.question_version_id AND qp.chunk_id=c.id AND qp.document_version_id=v.id))) THEN
      RAISE EXCEPTION 'Retrieval citation does not match stored lineage' USING ERRCODE='23514';
    END IF;
  END LOOP;
  RETURN NEW;
END $$;
CREATE TRIGGER retrieval_lineage_snapshot BEFORE INSERT ON retrieval_results FOR EACH ROW EXECUTE FUNCTION validate_retrieval_lineage_snapshot();
