-- Migration for existing deployments: adds workout set-logging + recipe
-- metadata support on top of the original v1 schema. Safe to run once;
-- re-running is harmless (ALTERs would error on a second run, but the
-- CREATE/INDEX statements are idempotent).

ALTER TABLE categories ADD COLUMN kind TEXT NOT NULL DEFAULT 'checkbox';
ALTER TABLE tasks ADD COLUMN meta TEXT;

CREATE TABLE IF NOT EXISTS set_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id TEXT NOT NULL REFERENCES tasks(id),
  date TEXT NOT NULL,
  set_number INTEGER NOT NULL,
  weight TEXT,
  reps TEXT,
  logged_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_set_logs_task_date ON set_logs(task_id, date);
