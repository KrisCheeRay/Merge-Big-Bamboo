CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  mode TEXT NOT NULL CHECK (mode IN ('classic', 'endless')),
  player_id TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS sessions_created_at ON sessions (created_at);

CREATE TABLE IF NOT EXISTS scores (
  mode TEXT NOT NULL CHECK (mode IN ('classic', 'endless')),
  player_id TEXT NOT NULL,
  nickname TEXT NOT NULL,
  score INTEGER NOT NULL CHECK (score >= 0),
  submitted_at INTEGER NOT NULL,
  PRIMARY KEY (mode, player_id)
);

CREATE INDEX IF NOT EXISTS scores_ranking
  ON scores (mode, score DESC, submitted_at ASC, player_id ASC);
