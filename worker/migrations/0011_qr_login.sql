CREATE TABLE IF NOT EXISTS qr_login_challenges (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','consumed')),
  approved_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_qr_login_expires
  ON qr_login_challenges(expires_at);
