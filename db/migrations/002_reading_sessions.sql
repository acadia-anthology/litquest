-- Purely additive -- no existing-data migration needed.
--
-- Run locally first: wrangler d1 execute litquest-db --local --file=db/migrations/002_reading_sessions.sql
-- Then, after verifying: wrangler d1 execute litquest-db --remote --file=db/migrations/002_reading_sessions.sql

CREATE TABLE IF NOT EXISTS reading_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id INTEGER NOT NULL REFERENCES players(id),
  book_id INTEGER NOT NULL REFERENCES books(id),
  session_date TEXT NOT NULL,
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  ended_at TEXT,
  minutes INTEGER
);

CREATE TABLE IF NOT EXISTS streak_bonuses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id INTEGER NOT NULL REFERENCES players(id),
  days INTEGER NOT NULL,
  points_earned INTEGER NOT NULL DEFAULT 25,
  bonus_date TEXT NOT NULL,
  awarded_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(player_id, days)
);
