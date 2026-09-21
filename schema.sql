PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'player' CHECK(role IN ('player','moderator','admin')),
  banned INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS levels (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  author_id INTEGER,
  mode TEXT NOT NULL CHECK(mode IN ('dash','platformer')),
  data_json TEXT NOT NULL,
  verified INTEGER NOT NULL DEFAULT 0,
  verifier_version TEXT,
  verifier_proof TEXT,
  published INTEGER NOT NULL DEFAULT 0,
  featured INTEGER NOT NULL DEFAULT 0,
  is_main INTEGER NOT NULL DEFAULT 0,
  main_order INTEGER NOT NULL DEFAULT 9999,
  plays INTEGER NOT NULL DEFAULT 0,
  likes INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY(author_id) REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_levels_published ON levels(published, is_main, main_order, updated_at);
CREATE INDEX IF NOT EXISTS idx_levels_author ON levels(author_id);

CREATE TABLE IF NOT EXISTS scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  level_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  percent REAL NOT NULL DEFAULT 0,
  completion INTEGER NOT NULL DEFAULT 0,
  attempts INTEGER NOT NULL DEFAULT 1,
  run_ms INTEGER NOT NULL DEFAULT 0,
  replay_json TEXT,
  verified INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY(level_id) REFERENCES levels(id) ON DELETE CASCADE,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_scores_leaderboard ON scores(level_id, verified, completion, percent DESC, run_ms ASC, created_at ASC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_user_level_score ON scores(level_id, user_id);

CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  level_id INTEGER NOT NULL,
  reporter_id INTEGER NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','resolved','dismissed')),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY(level_id) REFERENCES levels(id) ON DELETE CASCADE,
  FOREIGN KEY(reporter_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status, created_at DESC);

CREATE TABLE IF NOT EXISTS mod_actions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_id INTEGER NOT NULL,
  target_level_id INTEGER,
  target_user_id INTEGER,
  action TEXT NOT NULL,
  details_json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY(actor_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(target_level_id) REFERENCES levels(id) ON DELETE SET NULL,
  FOREIGN KEY(target_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE VIEW IF NOT EXISTS leaderboard AS
SELECT
  s.level_id,
  l.title AS level_title,
  s.user_id,
  u.username,
  s.percent,
  s.completion,
  s.attempts,
  s.run_ms,
  s.created_at
FROM scores s
JOIN levels l ON l.id = s.level_id
JOIN users u ON u.id = s.user_id
WHERE s.verified = 1;
