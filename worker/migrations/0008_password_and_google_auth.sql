-- Native email/password and optional Google identity columns.
ALTER TABLE users ADD COLUMN password_salt TEXT;
ALTER TABLE users ADD COLUMN password_hash TEXT;
ALTER TABLE users ADD COLUMN google_subject TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_subject ON users(google_subject) WHERE google_subject IS NOT NULL;
