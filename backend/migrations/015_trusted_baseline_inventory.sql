-- Keep the exact, previously reviewed starter corpus distinct from the
-- evidence-grounded dynamic editorial workflow. This does not change the
-- publication/scoring gates for dynamic questions.
ALTER TABLE ingestion_review_events DROP CONSTRAINT ingestion_review_events_action_check;
ALTER TABLE ingestion_review_events ADD CONSTRAINT ingestion_review_events_action_check CHECK(action IN (
  'source-approved','received','normalized','review-required','approved','rejected','published','extracted','withdrawn','expired',
  'duplicate','edited-approved','re-extraction-requested','family-linked','scoring-approved','scoring-rejected','superseded',
  'ai-review-proposed','seed-question-approved','manual-question-added'
));

ALTER VIEW content_question_readiness RENAME TO content_question_readiness_base;
CREATE VIEW content_question_readiness AS
SELECT current_readiness.*,
  CASE
    WHEN current_readiness.question_status='published' AND EXISTS (
      SELECT 1
      FROM ingestion_candidates candidate
      JOIN ingestion_records record ON record.id=candidate.record_id
      JOIN sources source ON source.id=record.source_id
      WHERE candidate.question_version_id=current_readiness.question_version_id
        AND candidate.state='published' AND record.state='published'
        AND record.input_hash='b85d0e09bb94eaf6751a0ae3a86ffb1f76169ee4faf6e314b60f579cee69e995'
        AND source.source_type='authored'
        AND source.stable_key IN ('techvera-junior-se-v1','techvera-junior-se-seed-v1')
        AND source.state='enabled' AND source.withdrawn_at IS NULL
        AND source.permission_status='permitted' AND source.review_status='approved'
        AND source.permission_evidence_hash IS NOT NULL
    ) THEN 'TRUSTED_BASELINE'
    WHEN current_readiness.publication_class='reviewed/scoring-ready' THEN 'DYNAMIC_REVIEWED'
    WHEN current_readiness.publication_class='fresh/provisional' THEN 'DYNAMIC_PROVISIONAL'
    ELSE NULL
  END AS inventory_class
FROM content_question_readiness_base current_readiness;
