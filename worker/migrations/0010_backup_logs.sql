-- Migration 0010: Backup and Disaster Recovery logs
-- Additive only: preserves all existing tables and data.

CREATE TABLE IF NOT EXISTS backup_logs (
  id TEXT PRIMARY KEY,
  backup_key TEXT NOT NULL,
  status TEXT NOT NULL, -- 'stored', 'not_stored', 'failed', 'verified'
  size_bytes INTEGER NOT NULL DEFAULT 0,
  sha256_plain TEXT,
  sha256_cipher TEXT,
  tables_summary TEXT, -- JSON summary of row counts
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_backup_logs_created ON backup_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_backup_logs_status ON backup_logs(status);
