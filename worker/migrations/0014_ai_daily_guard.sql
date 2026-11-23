-- Global daily inference circuit breaker. UTC day key resets automatically each day.
CREATE TABLE IF NOT EXISTS ai_daily_guard (
  utc_day TEXT PRIMARY KEY,
  requests INTEGER NOT NULL DEFAULT 0 CHECK (requests >= 0)
);
