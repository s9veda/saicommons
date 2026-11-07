-- Apply with: turso db shell <db-name> < migrations/0001_init.sql
-- Center memberships and editor permissions are stored as JSON arrays on users.

CREATE TABLE IF NOT EXISTS centers (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE,
  badge_text_color TEXT NOT NULL DEFAULT '#000000' CHECK (badge_text_color GLOB '#[0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f]'),
  created_by TEXT,
  updated_by TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT,
  name TEXT NOT NULL,
  gender TEXT CHECK (gender IS NULL OR gender IN ('Male', 'Female', 'Boy', 'Girl', 'Other')),
  is_admin INTEGER NOT NULL DEFAULT 0 CHECK (is_admin IN (0, 1)),
  registered_via TEXT NOT NULL DEFAULT 'legacy',
  associated_centers TEXT DEFAULT '[]' CHECK (associated_centers IS NULL OR json_valid(associated_centers)),
  editor_for TEXT DEFAULT '[]' CHECK (editor_for IS NULL OR json_valid(editor_for)),
  created_by TEXT,
  updated_by TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_login_at TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique ON users(email) WHERE email IS NOT NULL;

-- At most one active OTP per email; a new request replaces the previous one.
-- `profile` holds the pending registration details until the code is verified.
CREATE TABLE IF NOT EXISTS otp_codes (
  email TEXT PRIMARY KEY,
  code_hash TEXT NOT NULL,
  purpose TEXT NOT NULL CHECK (purpose IN ('register', 'login')),
  profile TEXT CHECK (profile IS NULL OR json_valid(profile)),
  attempts INTEGER NOT NULL DEFAULT 0,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS otp_codes_expiry ON otp_codes(expires_at);

-- Kept separately from otp_codes so replacing an OTP does not reset throttling.
CREATE TABLE IF NOT EXISTS otp_request_log (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  ip_hash TEXT NOT NULL,
  client TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS otp_request_log_email ON otp_request_log(email, created_at);
CREATE INDEX IF NOT EXISTS otp_request_log_ip ON otp_request_log(ip_hash, created_at);
