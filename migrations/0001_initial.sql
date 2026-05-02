-- migrations/0001_initial.sql

CREATE TABLE feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  submission_id TEXT NOT NULL,
  vote TEXT NOT NULL CHECK (vote IN ('up', 'down')),
  search_used INTEGER NOT NULL CHECK (search_used IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE surveys (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  submission_id TEXT NOT NULL,
  has_public_writing INTEGER,
  posts_per_month INTEGER,
  ran_with_search INTEGER,           -- bitmask: 1=without, 2=with, 3=both
  search_was_needed INTEGER,         -- only meaningful if ran_with_search = 3
  freeform_comment TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE daily_budget (
  date TEXT PRIMARY KEY,             -- 'YYYY-MM-DD' UTC
  request_count INTEGER NOT NULL DEFAULT 0,
  estimated_cost_cents INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_feedback_submission ON feedback(submission_id);
CREATE INDEX idx_surveys_submission ON surveys(submission_id);
