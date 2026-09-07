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
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  category_id TEXT NOT NULL REFERENCES categories(id),
  day_key TEXT,
  label TEXT NOT NULL,
  detail TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS completions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id TEXT NOT NULL REFERENCES tasks(id),
  date TEXT NOT NULL,
  completed_at TEXT NOT NULL,
  UNIQUE(task_id, date)
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tasks_category ON tasks(category_id);
CREATE INDEX IF NOT EXISTS idx_completions_task ON completions(task_id);
CREATE INDEX IF NOT EXISTS idx_completions_date ON completions(date);
