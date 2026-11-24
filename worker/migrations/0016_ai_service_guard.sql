-- Global circuit breaker: pause Workers AI after Cloudflare reports the free daily quota is exhausted.
CREATE TABLE IF NOT EXISTS ai_service_guard (
  service TEXT PRIMARY KEY,
  paused_until TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT 'daily_quota_exhausted',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
