-- Phase 9.5: append-only, exact-content-hash-bound AI editorial proposals.
ALTER TABLE ingestion_review_events DROP CONSTRAINT ingestion_review_events_action_check;
ALTER TABLE ingestion_review_events ADD CONSTRAINT ingestion_review_events_action_check CHECK(action IN (
  'source-approved','received','normalized','review-required','approved','rejected','published','extracted','withdrawn','expired',
  'duplicate','edited-approved','re-extraction-requested','family-linked','scoring-approved','scoring-rejected','superseded','ai-review-proposed'
));

CREATE TABLE candidate_ai_review_packets (
  id UUID PRIMARY KEY,
  candidate_id UUID NOT NULL REFERENCES ingestion_candidates(id) ON DELETE RESTRICT,
  content_hash knowledge_hash NOT NULL,
  packet_hash knowledge_hash NOT NULL,
  version INTEGER NOT NULL CHECK(version > 0),
  contract_version TEXT NOT NULL CHECK(contract_version='editorial-review-v1'),
  packet knowledge_json NOT NULL CHECK(jsonb_typeof(packet)='object' AND octet_length(packet::text)<=16000),
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(candidate_id,content_hash,version)
);
CREATE INDEX candidate_ai_review_latest ON candidate_ai_review_packets(candidate_id,content_hash,version DESC);

CREATE FUNCTION seal_candidate_ai_review_packet() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'AI review proposals are append-only' USING ERRCODE='23514';
END $$;
CREATE TRIGGER candidate_ai_review_packet_sealed BEFORE UPDATE OR DELETE ON candidate_ai_review_packets
  FOR EACH ROW EXECUTE FUNCTION seal_candidate_ai_review_packet();
