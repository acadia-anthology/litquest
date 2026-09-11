-- Evolves an existing (pre-family-profiles) database in place. Safe to run
-- once against a live DB that already has players/books/etc. data -- does
-- not touch reader_type or scoring, only adds the household/parent layer.
--
-- Run locally first: wrangler d1 execute litquest-db --local --file=db/migrations/001_family_profiles.sql
-- Then, after verifying: wrangler d1 execute litquest-db --remote --file=db/migrations/001_family_profiles.sql

CREATE TABLE IF NOT EXISTS households (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS parents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  household_id INTEGER NOT NULL REFERENCES households(id),
  name TEXT NOT NULL,
  avatar TEXT NOT NULL DEFAULT '🧑',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO households (name) VALUES ('My Family');

ALTER TABLE players ADD COLUMN household_id INTEGER REFERENCES households(id);
ALTER TABLE players ADD COLUMN parent_id INTEGER REFERENCES parents(id);

UPDATE players SET household_id = (SELECT id FROM households LIMIT 1);

-- Existing reader_type='adult' players (e.g. Madd, Tim) get a matching
-- `parents` identity, so they gain admin rights via Parent Mode while
-- keeping their existing reading profile (points, books, quiz history)
-- exactly as-is -- reader_type is untouched, it still drives scoring.
INSERT INTO parents (household_id, name, avatar)
  SELECT household_id, name, avatar FROM players WHERE reader_type = 'adult';

UPDATE players
  SET parent_id = (
    SELECT p.id FROM parents p
    WHERE p.household_id = players.household_id AND p.name = players.name
  )
  WHERE reader_type = 'adult';
