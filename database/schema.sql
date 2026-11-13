-- Initialize a new database: turso db shell <db-name> < database/schema.sql
-- Upgrade existing databases using scripts/database-preflight.mjs instead.
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
  name_key TEXT,
  gender TEXT CHECK (gender IS NULL OR gender IN ('Male', 'Female', 'Boy', 'Girl', 'Other')),
  is_admin INTEGER NOT NULL DEFAULT 0 CHECK (is_admin IN (0, 1)),
  registered_via TEXT NOT NULL DEFAULT 'legacy',
  associated_centers TEXT DEFAULT '[]' CHECK (associated_centers IS NULL OR json_valid(associated_centers)),
  editor_for TEXT DEFAULT '[]' CHECK (editor_for IS NULL OR json_valid(editor_for)),
  created_by TEXT,
  updated_by TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_login_at TEXT,
  session_version INTEGER NOT NULL DEFAULT 0
);

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

-- BEGIN USER INTEGRITY
CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique ON users(email) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS users_name_key ON users(name_key);
CREATE UNIQUE INDEX IF NOT EXISTS users_normalized_email ON users(lower(trim(email))) WHERE email IS NOT NULL;

CREATE TRIGGER IF NOT EXISTS users_integrity_insert BEFORE INSERT ON users BEGIN
  SELECT CASE WHEN NEW.name_key IS NULL OR NEW.name_key = '' THEN RAISE(ABORT, 'SAI_NAME_KEY_REQUIRED') END;
  SELECT CASE WHEN NEW.email IS NOT NULL AND NEW.email != lower(trim(NEW.email)) THEN RAISE(ABORT, 'SAI_INVALID_EMAIL') END;
  SELECT CASE WHEN NEW.is_admin = 0 AND json_array_length(COALESCE(NEW.associated_centers, '[]')) = 0 THEN RAISE(ABORT, 'SAI_CENTER_REQUIRED') END;
  SELECT CASE WHEN (NEW.is_admin = 1 OR json_array_length(COALESCE(NEW.editor_for, '[]')) > 0) AND NEW.email IS NULL THEN RAISE(ABORT, 'SAI_EMAIL_REQUIRED') END;
  SELECT CASE WHEN instr(NEW.name, '&') > 0 AND (NEW.email IS NOT NULL OR NEW.is_admin = 1
    OR json_array_length(COALESCE(NEW.editor_for, '[]')) > 0 OR instr(substr(NEW.name, instr(NEW.name, '&') + 1), '&') > 0
    OR trim(substr(NEW.name, 1, instr(NEW.name, '&') - 1)) = '' OR trim(substr(NEW.name, instr(NEW.name, '&') + 1)) = '')
    THEN RAISE(ABORT, 'SAI_INVALID_PAIR') END;
  SELECT CASE WHEN EXISTS (SELECT 1 FROM json_each(COALESCE(NEW.associated_centers, '[]')) c
    WHERE NOT EXISTS (SELECT 1 FROM centers WHERE CAST(id AS INTEGER) = c.value))
    THEN RAISE(ABORT, 'SAI_UNKNOWN_CENTER') END;
  SELECT CASE WHEN EXISTS (SELECT 1 FROM json_each(COALESCE(NEW.editor_for, '[]')) e
    WHERE NOT EXISTS (SELECT 1 FROM json_each(COALESCE(NEW.associated_centers, '[]')) c WHERE c.value = e.value))
    THEN RAISE(ABORT, 'SAI_EDITOR_CENTER') END;
  SELECT CASE WHEN EXISTS (SELECT 1 FROM users u WHERE u.name_key = NEW.name_key
    AND (NEW.email IS NULL OR u.email IS NULL) AND EXISTS (
      SELECT 1 FROM json_each(COALESCE(NEW.associated_centers, '[]')) a,
        json_each(COALESCE(u.associated_centers, '[]')) b WHERE a.value = b.value))
    THEN RAISE(ABORT, 'SAI_NAME_CONFLICT') END;
END;

CREATE TRIGGER IF NOT EXISTS users_integrity_update BEFORE UPDATE OF name, name_key, email, is_admin, associated_centers, editor_for ON users BEGIN
  SELECT CASE WHEN NEW.name_key IS NULL OR NEW.name_key = '' THEN RAISE(ABORT, 'SAI_NAME_KEY_REQUIRED') END;
  SELECT CASE WHEN NEW.email IS NOT NULL AND NEW.email != lower(trim(NEW.email)) THEN RAISE(ABORT, 'SAI_INVALID_EMAIL') END;
  SELECT CASE WHEN NEW.is_admin = 0 AND json_array_length(COALESCE(NEW.associated_centers, '[]')) = 0 THEN RAISE(ABORT, 'SAI_CENTER_REQUIRED') END;
  SELECT CASE WHEN (NEW.is_admin = 1 OR json_array_length(COALESCE(NEW.editor_for, '[]')) > 0) AND NEW.email IS NULL THEN RAISE(ABORT, 'SAI_EMAIL_REQUIRED') END;
  SELECT CASE WHEN instr(NEW.name, '&') > 0 AND (NEW.email IS NOT NULL OR NEW.is_admin = 1
    OR json_array_length(COALESCE(NEW.editor_for, '[]')) > 0 OR instr(substr(NEW.name, instr(NEW.name, '&') + 1), '&') > 0
    OR trim(substr(NEW.name, 1, instr(NEW.name, '&') - 1)) = '' OR trim(substr(NEW.name, instr(NEW.name, '&') + 1)) = '')
    THEN RAISE(ABORT, 'SAI_INVALID_PAIR') END;
  SELECT CASE WHEN EXISTS (SELECT 1 FROM json_each(COALESCE(NEW.associated_centers, '[]')) c
    WHERE NOT EXISTS (SELECT 1 FROM centers WHERE CAST(id AS INTEGER) = c.value))
    THEN RAISE(ABORT, 'SAI_UNKNOWN_CENTER') END;
  SELECT CASE WHEN EXISTS (SELECT 1 FROM json_each(COALESCE(NEW.editor_for, '[]')) e
    WHERE NOT EXISTS (SELECT 1 FROM json_each(COALESCE(NEW.associated_centers, '[]')) c WHERE c.value = e.value))
    THEN RAISE(ABORT, 'SAI_EDITOR_CENTER') END;
  SELECT CASE WHEN EXISTS (SELECT 1 FROM users u WHERE u.id != NEW.id AND u.name_key = NEW.name_key
    AND (NEW.email IS NULL OR u.email IS NULL) AND EXISTS (
      SELECT 1 FROM json_each(COALESCE(NEW.associated_centers, '[]')) a,
        json_each(COALESCE(u.associated_centers, '[]')) b WHERE a.value = b.value))
    THEN RAISE(ABORT, 'SAI_NAME_CONFLICT') END;
END;

CREATE TRIGGER IF NOT EXISTS centers_in_use BEFORE DELETE ON centers
WHEN EXISTS (SELECT 1 FROM users u, json_each(COALESCE(u.associated_centers, '[]')) c WHERE c.value = CAST(OLD.id AS INTEGER))
BEGIN SELECT RAISE(ABORT, 'SAI_CENTER_IN_USE'); END;
-- END USER INTEGRITY
