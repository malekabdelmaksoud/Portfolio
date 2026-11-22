-- Explicit, revocable, read-only snapshots of conversations shared by their owner.
CREATE TABLE IF NOT EXISTS shared_conversations (
  token TEXT PRIMARY KEY,
  chat_id TEXT NOT NULL,
  user_email TEXT NOT NULL,
  title TEXT NOT NULL,
  prompt TEXT NOT NULL DEFAULT '',
  messages_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  revoked_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_shared_conversations_owner ON shared_conversations(user_email, chat_id, revoked_at);
