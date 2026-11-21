-- Automatically refreshed, source-allowlisted public web knowledge.
-- External content remains explicitly marked as untrusted data at prompt time.
CREATE TABLE IF NOT EXISTS web_knowledge (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  url TEXT NOT NULL UNIQUE,
  source_name TEXT NOT NULL,
  source_host TEXT NOT NULL,
  summary TEXT NOT NULL,
  published_at TEXT,
  content_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','disabled')),
  fetched_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_web_knowledge_status_date ON web_knowledge(status,published_at DESC);
CREATE TABLE IF NOT EXISTS web_learning_runs (
  id TEXT PRIMARY KEY,
  fetched INTEGER NOT NULL DEFAULT 0,
  saved INTEGER NOT NULL DEFAULT 0,
  failed_json TEXT NOT NULL DEFAULT '[]',
  finished_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_web_learning_runs_finished ON web_learning_runs(finished_at DESC);
