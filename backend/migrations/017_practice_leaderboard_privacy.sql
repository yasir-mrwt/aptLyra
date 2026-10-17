-- Explicit consent is separate from the legacy default-on XP leaderboard.
CREATE TABLE practice_leaderboard_preferences (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  opted_in BOOLEAN NOT NULL DEFAULT false,
  display_name TEXT NOT NULL CHECK (char_length(display_name) BETWEEN 2 AND 32),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
