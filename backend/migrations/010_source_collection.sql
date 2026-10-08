-- Phase 8.5B: auditable source collection state over the existing durable queue.
ALTER TABLE sources ADD COLUMN collection_interval_minutes INTEGER NOT NULL DEFAULT 1440
  CHECK(collection_interval_minutes BETWEEN 60 AND 10080);
ALTER TABLE sources ADD COLUMN collection_cursor knowledge_json NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(collection_cursor)='object');
ALTER TABLE sources ADD COLUMN source_health TEXT NOT NULL DEFAULT 'disabled'
  CHECK(source_health IN ('healthy','degraded','disabled','withdrawn'));
ALTER TABLE sources ADD COLUMN last_collection_at TIMESTAMPTZ;
ALTER TABLE sources ADD COLUMN last_failure_category TEXT
  CHECK(last_failure_category IS NULL OR last_failure_category IN ('rate_limited','permission_expired','network_failure','invalid_payload','authentication_required','terms_review_required','source_format_changed'));
ALTER TABLE sources ADD COLUMN permission_reviewed_hash knowledge_hash;
ALTER TABLE sources ADD COLUMN attribution_required BOOLEAN NOT NULL DEFAULT false;
CREATE TABLE source_collection_runs (
  id UUID PRIMARY KEY,
  source_id UUID NOT NULL REFERENCES sources(id) ON DELETE RESTRICT,
  operation_id UUID REFERENCES durable_operations(id) ON DELETE SET NULL,
  requested_by UUID REFERENCES users(id) ON DELETE SET NULL,
  trigger TEXT NOT NULL CHECK(trigger IN ('scheduled','manual','retry')),
  status TEXT NOT NULL CHECK(status IN ('queued','running','succeeded','retryable_failed','terminal_failed','cancelled')),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  discovered_count INTEGER NOT NULL DEFAULT 0 CHECK(discovered_count BETWEEN 0 AND 1000),
  imported_count INTEGER NOT NULL DEFAULT 0 CHECK(imported_count BETWEEN 0 AND 1000),
  duplicate_count INTEGER NOT NULL DEFAULT 0 CHECK(duplicate_count BETWEEN 0 AND 1000),
  quarantined_count INTEGER NOT NULL DEFAULT 0 CHECK(quarantined_count BETWEEN 0 AND 1000),
  rejected_count INTEGER NOT NULL DEFAULT 0 CHECK(rejected_count BETWEEN 0 AND 1000),
  safe_error_category TEXT CHECK(safe_error_category IS NULL OR safe_error_category IN
    ('rate_limited','permission_expired','network_failure','invalid_payload','authentication_required','terms_review_required','source_format_changed','source_disabled','source_withdrawn')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX source_collection_runs_source_time ON source_collection_runs(source_id,created_at DESC);
CREATE UNIQUE INDEX source_collection_operation_unique ON source_collection_runs(operation_id) WHERE operation_id IS NOT NULL;
CREATE UNIQUE INDEX source_collection_one_active ON source_collection_runs(source_id) WHERE status IN ('queued','running');
CREATE UNIQUE INDEX source_collection_one_durable_active ON durable_operations(source_id,operation_type)
  WHERE runtime_version='aptlyra-content-v1' AND operation_type='source_collection' AND status IN ('queued','running','retryable_failed');
CREATE INDEX source_due_enabled ON sources(next_due_at) WHERE state='enabled' AND withdrawn_at IS NULL;
