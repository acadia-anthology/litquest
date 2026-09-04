CREATE TABLE IF NOT EXISTS players (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  avatar TEXT NOT NULL DEFAULT '🧑',
  reader_type TEXT NOT NULL DEFAULT 'kid', -- kid | adult
  total_points INTEGER NOT NULL DEFAULT 0,
  books_completed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS books (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id INTEGER NOT NULL REFERENCES players(id),
  title TEXT NOT NULL,
  author TEXT,
  level TEXT,
  lit_score INTEGER,
  book_type TEXT, -- Elementary | Middle Grade | YA | Adult
  complexity TEXT, -- Light | Standard | Complex (adult scoring only)
  pages INTEGER,
  word_count INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'reading', -- reading | quiz_ready | completed
  added_at TEXT NOT NULL DEFAULT (datetime('now')),
  finished_at TEXT
);

CREATE TABLE IF NOT EXISTS quizzes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  book_id INTEGER NOT NULL REFERENCES books(id),
  questions_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS quiz_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  quiz_id INTEGER NOT NULL REFERENCES quizzes(id),
  book_id INTEGER NOT NULL REFERENCES books(id),
  player_id INTEGER NOT NULL REFERENCES players(id),
  score INTEGER NOT NULL,
  total INTEGER NOT NULL,
  points_earned INTEGER NOT NULL,
  answers_json TEXT, -- chosen choice index per question, for reviewing missed questions
  completed_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Two quest tracks per kid (Side Quest / Main Quest, just a grouping label —
-- no cycles: points never reset, so thresholds are against all-time total_points).
-- 'once' rewards fire a single time at an exact point value; 'repeat' rewards
-- fire again every time total_points crosses another multiple of threshold.
CREATE TABLE IF NOT EXISTS quest_rewards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id INTEGER NOT NULL REFERENCES players(id),
  quest_type TEXT NOT NULL, -- 'side' | 'main'
  reward_type TEXT NOT NULL DEFAULT 'once', -- 'once' | 'repeat'
  threshold INTEGER NOT NULL, -- 'once': the exact point value; 'repeat': the interval size
  emoji TEXT NOT NULL,
  reward_text TEXT NOT NULL,
  UNIQUE(player_id, quest_type, reward_type, threshold)
);

-- One row per (player, reward, milestone) the first time it's crossed — drives
-- the kid's one-time celebration popup and the parent's "mark delivered" notice.
-- milestone_points is the threshold itself for 'once' rewards, or the specific
-- multiple crossed (e.g. 500, 1000, 1500...) for 'repeat' rewards, so a repeat
-- reward naturally gets a new claimable row each time it fires again.
CREATE TABLE IF NOT EXISTS quest_reward_claims (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id INTEGER NOT NULL REFERENCES players(id),
  reward_id INTEGER NOT NULL REFERENCES quest_rewards(id),
  milestone_points INTEGER NOT NULL,
  reached_at TEXT NOT NULL DEFAULT (datetime('now')),
  delivered_at TEXT,
  seen_at TEXT, -- when the kid's celebration popup was actually shown
  UNIQUE(player_id, reward_id, milestone_points)
);
