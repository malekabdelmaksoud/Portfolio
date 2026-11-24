-- Estimated AI token telemetry for admin reporting. Does not represent Cloudflare account billing.
CREATE TABLE IF NOT EXISTS ai_usage (
  id TEXT PRIMARY KEY,
  user_email TEXT NOT NULL,
  model TEXT NOT NULL,
  mode TEXT NOT NULL,
  input_tokens_est INTEGER NOT NULL DEFAULT 0 CHECK(input_tokens_est >= 0),
  output_tokens_est INTEGER NOT NULL DEFAULT 0 CHECK(output_tokens_est >= 0),
  total_tokens_est INTEGER NOT NULL DEFAULT 0 CHECK(total_tokens_est >= 0),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_ai_usage_created ON ai_usage(created_at);
CREATE INDEX IF NOT EXISTS idx_ai_usage_user_created ON ai_usage(user_email,created_at);
