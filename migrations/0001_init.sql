PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS memberships (
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  app TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'viewer',
  data TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  PRIMARY KEY (account_id, app),
  CHECK (json_valid(data))
);

CREATE TABLE IF NOT EXISTS otp_codes (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  app TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS otp_codes_email_app_created ON otp_codes(email, app, created_at);
CREATE INDEX IF NOT EXISTS otp_codes_expiry ON otp_codes(expires_at);


CREATE TABLE IF NOT EXISTS otp_request_log (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  app TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS otp_request_log_email_app_created
  ON otp_request_log(email, app, created_at);
