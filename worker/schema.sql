-- MERIDIAN // OPS — schema
-- Programs are the top-level "glow-up tracks" (this week's plan is one program;
-- future hobbies/programs are added as new rows, never new tables).

CREATE TABLE IF NOT EXISTS programs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  theme_concept TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  program_id TEXT NOT NULL REFERENCES programs(id),
  name TEXT NOT NULL,
  label TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'checkbox', -- 'checkbox' | 'sets'
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  category_id TEXT NOT NULL REFERENCES categories(id),
  day_key TEXT,
  label TEXT NOT NULL,
  detail TEXT,
  meta TEXT, -- JSON: {targetText} for 'sets' tasks, {mealType, day, recipe} for meals
  sort_order INTEGER NOT NULL DEFAULT 0
);

-- Simple checkbox completion, used by 'checkbox'-kind categories.
CREATE TABLE IF NOT EXISTS completions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id TEXT NOT NULL REFERENCES tasks(id),
  date TEXT NOT NULL,
  completed_at TEXT NOT NULL,
  UNIQUE(task_id, date)
);

-- Per-set logged performance, used by 'sets'-kind categories (training).
-- A task counts as "done" for a date when it has at least one row here.
CREATE TABLE IF NOT EXISTS set_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id TEXT NOT NULL REFERENCES tasks(id),
  date TEXT NOT NULL,
  set_number INTEGER NOT NULL,
  weight TEXT,
  reps TEXT,
  logged_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tasks_category ON tasks(category_id);
CREATE INDEX IF NOT EXISTS idx_completions_task ON completions(task_id);
CREATE INDEX IF NOT EXISTS idx_completions_date ON completions(date);
CREATE INDEX IF NOT EXISTS idx_set_logs_task_date ON set_logs(task_id, date);
