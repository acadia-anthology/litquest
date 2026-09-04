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

-- Two shared quest tracks (Side Quest = short cycle, Main Quest = long cycle).
-- Kid profiles only. Progress is points earned within the current cycle, which
-- rolls forward automatically from anchor_date every period_months.
CREATE TABLE IF NOT EXISTS quests (
  quest_type TEXT PRIMARY KEY, -- 'side' | 'main'
  period_months INTEGER NOT NULL,
  anchor_date TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS quest_rewards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  quest_type TEXT NOT NULL, -- 'side' | 'main'
  threshold INTEGER NOT NULL, -- points needed within the current cycle
  emoji TEXT NOT NULL,
  reward_text TEXT NOT NULL,
  UNIQUE(quest_type, threshold)
);

-- One row per (player, quest, cycle, reward) the very first time it's crossed —
-- drives the kid's one-time celebration popup and the parent's "mark delivered"
-- notice. A new cycle has a different cycle_start, so the same reward can be
-- earned again next cycle.
CREATE TABLE IF NOT EXISTS quest_reward_claims (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id INTEGER NOT NULL REFERENCES players(id),
  quest_type TEXT NOT NULL,
  cycle_start TEXT NOT NULL,
  reward_id INTEGER NOT NULL REFERENCES quest_rewards(id),
  reached_at TEXT NOT NULL DEFAULT (datetime('now')),
  delivered_at TEXT,
  seen_at TEXT, -- when the kid's celebration popup was actually shown
  UNIQUE(player_id, quest_type, cycle_start, reward_id)
);
