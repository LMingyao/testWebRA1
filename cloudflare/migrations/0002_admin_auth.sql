CREATE TABLE admin_sessions (
  token_hash TEXT PRIMARY KEY,
  credential_version TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE TABLE admin_login_limits (
  bucket TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX admin_login_expiry ON admin_login_limits(expires_at);
