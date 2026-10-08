-- Phase 9: explicit application roles and append-only role-change audit.
-- Initial ownership is assigned separately by an operator-only CLI command.
ALTER TABLE users ADD COLUMN app_role TEXT NOT NULL DEFAULT 'user';
ALTER TABLE users ADD CONSTRAINT users_app_role_check
  CHECK (app_role IN ('owner','admin','reviewer','user'));

-- Keep already-linked human reviewers functional after migration. This does not
-- promote an unlinked account or select an initial owner.
UPDATE users u SET app_role='reviewer'
FROM ingestion_reviewers r
WHERE r.user_id=u.id AND r.kind='human' AND r.enabled AND u.app_role='user';

CREATE UNIQUE INDEX users_single_owner_idx ON users(app_role) WHERE app_role='owner';
CREATE INDEX users_app_role_created_idx ON users(app_role,created_at,id);

CREATE TABLE user_role_audit (
  id UUID PRIMARY KEY,
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  target_user_id UUID NOT NULL,
  target_email TEXT NOT NULL CHECK (length(target_email) BETWEEN 3 AND 320),
  action TEXT NOT NULL CHECK (action IN ('initial_owner_bootstrap','role_changed','access_removed','ownership_transferred')),
  previous_role TEXT CHECK (previous_role IS NULL OR previous_role IN ('owner','admin','reviewer','user')),
  new_role TEXT NOT NULL CHECK (new_role IN ('owner','admin','reviewer','user')),
  reason TEXT NOT NULL CHECK (length(reason) BETWEEN 1 AND 500),
  metadata knowledge_json NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata)='object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX user_role_audit_target_created_idx ON user_role_audit(target_user_id,created_at DESC);
CREATE INDEX user_role_audit_actor_created_idx ON user_role_audit(actor_user_id,created_at DESC);

CREATE FUNCTION deny_user_role_audit_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'User role audit is append-only' USING ERRCODE='23514'; END $$;
CREATE TRIGGER user_role_audit_immutable
  BEFORE UPDATE OR DELETE ON user_role_audit FOR EACH ROW EXECUTE FUNCTION deny_user_role_audit_mutation();
