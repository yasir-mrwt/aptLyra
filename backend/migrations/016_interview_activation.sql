-- Confirmation pins questions; activation starts usable time after the client is ready.
-- Existing sessions preserve their original timing. No historical record is rewritten.
ALTER TABLE sessions ADD COLUMN activation_required boolean NOT NULL DEFAULT false;
ALTER TABLE sessions ADD COLUMN activated_at timestamptz;
