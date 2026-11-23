CREATE TABLE IF NOT EXISTS knowledge_sources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_url TEXT NOT NULL UNIQUE,
  source_type TEXT NOT NULL DEFAULT 'web',
  title TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL,
  language TEXT NOT NULL DEFAULT '',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_knowledge_sources_type_updated
  ON knowledge_sources(source_type, updated_at DESC);
