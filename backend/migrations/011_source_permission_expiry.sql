-- Phase 8.5B hardens exact-hash source permission with an optional, explicit expiry.
ALTER TABLE sources ADD COLUMN permission_expires_at TIMESTAMPTZ;

CREATE OR REPLACE VIEW content_question_readiness AS
SELECT qv.id AS question_version_id,qv.question_id,qv.status AS question_status,
  CASE
    WHEN EXISTS(SELECT 1 FROM ingestion_candidates c JOIN ingestion_records r ON r.id=c.record_id
      JOIN sources origin ON origin.id=r.source_id
      WHERE c.question_version_id=qv.id)
      AND NOT EXISTS(SELECT 1 FROM ingestion_candidates c JOIN ingestion_records r ON r.id=c.record_id
        JOIN sources origin ON origin.id=r.source_id
        WHERE c.question_version_id=qv.id AND c.state IN ('approved','published') AND r.state='published'
          AND origin.state='enabled' AND origin.withdrawn_at IS NULL AND origin.permission_status='permitted'
          AND origin.review_status='approved' AND (origin.source_type NOT IN ('official_api','rss_atom')
            OR origin.permission_reviewed_hash=origin.permission_evidence_hash)
          AND (origin.permission_expires_at IS NULL OR origin.permission_expires_at>now())) THEN 'unavailable'
    WHEN qv.status='published' AND EXISTS(SELECT 1 FROM rubric_versions rv
      JOIN rubric_review_approvals ra ON ra.rubric_version_id=rv.id AND ra.content_hash=rv.content_hash
      WHERE rv.question_version_id=qv.id AND rv.kind='known' AND rv.status='reviewed')
      AND EXISTS(SELECT 1 FROM question_technical_references tr JOIN source_chunks c ON c.id=tr.chunk_id
        JOIN source_document_versions dv ON dv.id=c.document_version_id JOIN source_documents d ON d.id=dv.document_id
        JOIN sources s ON s.id=d.source_id WHERE tr.question_version_id=qv.id AND tr.state='approved' AND c.status='active'
          AND dv.status='published' AND dv.content_hash=tr.source_version_hash AND s.permission_evidence_hash=tr.permission_hash AND dv.quality='technical-reference' AND dv.permission_status='permitted'
          AND dv.review_status='approved' AND s.state='enabled' AND s.permission_status='permitted'
          AND s.review_status='approved' AND s.withdrawn_at IS NULL AND (s.permission_expires_at IS NULL OR s.permission_expires_at>now()))
      AND NOT EXISTS(SELECT 1 FROM rubric_versions rv JOIN expected_concepts ec ON ec.rubric_version_id=rv.id
        JOIN concept_references cr ON cr.concept_id=ec.id WHERE rv.question_version_id=qv.id AND rv.kind='known'
        AND NOT EXISTS(SELECT 1 FROM question_technical_references tr JOIN source_chunks c ON c.id=tr.chunk_id
          JOIN source_document_versions dv ON dv.id=c.document_version_id JOIN source_documents d ON d.id=dv.document_id
          JOIN sources s ON s.id=d.source_id WHERE tr.question_version_id=qv.id AND tr.chunk_id=cr.chunk_id AND tr.state='approved'
            AND c.status='active' AND dv.status='published' AND dv.permission_status='permitted' AND dv.review_status='approved'
            AND s.state='enabled' AND s.permission_status='permitted' AND s.review_status='approved' AND s.withdrawn_at IS NULL
            AND (s.permission_expires_at IS NULL OR s.permission_expires_at>now())))
      AND EXISTS(SELECT 1 FROM embedding_metadata em JOIN embedding_vectors ev ON ev.metadata_id=em.id
        WHERE em.question_version_id=qv.id AND em.purpose='question-selection' AND em.status='active')
      THEN 'reviewed/scoring-ready'
    WHEN qv.status='published' AND EXISTS(SELECT 1 FROM embedding_metadata em JOIN embedding_vectors ev ON ev.metadata_id=em.id
      WHERE em.question_version_id=qv.id AND em.purpose='question-selection' AND em.status='active') THEN 'fresh/provisional'
    WHEN qv.status='published' THEN 'approved-not-retrieval-ready'
    ELSE 'unpublished' END AS publication_class
FROM question_versions qv;
