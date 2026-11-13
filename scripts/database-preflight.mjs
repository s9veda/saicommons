import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { nameKey } from '../src/api/name-key.mjs';

export const SNAPSHOT_QUERY = `SELECT json_object(
  'users', json((SELECT json_group_array(json_object(
    'id', id, 'name', name, 'email', email, 'is_admin', is_admin,
    'associated_centers', associated_centers, 'editor_for', editor_for
  )) FROM users)),
  'centers', json((SELECT json_group_array(id) FROM centers))
) AS snapshot`;

function ids(value) {
  const parsed = value === null ? [] : JSON.parse(value);
  if (!Array.isArray(parsed) || !parsed.every((id) => Number.isSafeInteger(id) && id > 0) || new Set(parsed).size !== parsed.length) {
    throw new Error('invalid center list');
  }
  return parsed;
}

export function inspectSnapshot(snapshot) {
  if (!snapshot || !Array.isArray(snapshot.users) || !Array.isArray(snapshot.centers)) throw new Error('Expected an object with users and centers arrays');
  const centers = new Set(snapshot.centers.map((id) => Number(id)));
  if (centers.size !== snapshot.centers.length || [...centers].some((id) => !Number.isSafeInteger(id) || id <= 0)) throw new Error('Invalid center IDs');
  const errors = [];
  const emails = new Map();
  const names = new Map();
  const seenIds = new Set();
  for (const user of snapshot.users) {
    if (!user || typeof user.id !== 'string' || seenIds.has(user.id)) throw new Error('Invalid or duplicate user ID');
    seenIds.add(user.id);
    const report = (message) => errors.push(`User ${user.id}: ${message}`);
    if (typeof user.name !== 'string' || !user.name.trim() || user.name.length > 200) { report('invalid name'); continue; }
    if (user.name !== user.name.trim()) report('name has surrounding whitespace');
    if (user.is_admin !== 0 && user.is_admin !== 1) report('invalid administrator flag');
    if (user.email !== null) {
      if (typeof user.email !== 'string' || user.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(user.email)) report('invalid email');
      else {
        const normalized = user.email.trim().toLowerCase();
        if (normalized !== user.email) report('email is not normalized');
        if (emails.has(normalized)) report(`email conflicts with user ${emails.get(normalized)}`);
        else emails.set(normalized, user.id);
      }
    }
    let member, editor;
    try { member = ids(user.associated_centers); editor = ids(user.editor_for); }
    catch { report('invalid center or editor list'); continue; }
    if (member.some((id) => !centers.has(id))) report('references an unknown center');
    if (editor.some((id) => !member.includes(id))) report('editor centers must also be memberships');
    if (!user.is_admin && member.length === 0) report('non-admin requires at least one center');
    if ((user.is_admin || editor.length > 0) && !user.email) report('administrator or editor requires email');
    if (user.name.includes('&')) {
      const parts = user.name.split('&');
      if (parts.length !== 2 || parts.some((part) => !part.trim()) || user.email || user.is_admin || editor.length) report('invalid pair');
    }
    const key = nameKey(user.name);
    for (const center of member) {
      const bucket = JSON.stringify([center, key]);
      const others = names.get(bucket) ?? [];
      for (const other of others) if (user.email === null || other.email === null) report(`name conflicts with user ${other.id} in center ${center}`);
      others.push(user);
      names.set(bucket, others);
    }
  }
  return errors;
}

function literal(value) {
  if (value === null) return 'NULL';
  if (typeof value === 'number' && Number.isSafeInteger(value)) return String(value);
  if (typeof value !== 'string' || value.includes('\0')) throw new Error('Unsupported snapshot value');
  return `'${value.replaceAll("'", "''")}'`;
}

export function migrationStatements(snapshot, schema, columns) {
  const errors = inspectSnapshot(snapshot);
  if (errors.length) throw new Error('Preflight conflicts must be corrected before migration');
  if (!Array.isArray(columns) || !columns.includes('id')) throw new Error('Cannot inspect the existing users schema');
  if (columns.includes('name_key')) throw new Error('The users table already has name_key; inspect its schema before attempting an upgrade');
  const start = '-- BEGIN USER INTEGRITY';
  const end = '-- END USER INTEGRITY';
  const startIndex = schema.indexOf(start);
  const endIndex = schema.indexOf(end);
  if (startIndex < 0 || endIndex <= startIndex) throw new Error('User integrity schema markers are missing');
  const integrity = schema.slice(startIndex + start.length, endIndex);
  const statements = [
    'BEGIN IMMEDIATE;',
    'CREATE TEMP TABLE migration_user_keys (id TEXT PRIMARY KEY, name TEXT, email TEXT, is_admin INTEGER, associated_centers TEXT, editor_for TEXT, name_key TEXT NOT NULL);',
  ];
  for (const u of snapshot.users) statements.push(`INSERT INTO migration_user_keys VALUES (${[u.id, u.name, u.email, u.is_admin, u.associated_centers, u.editor_for, nameKey(u.name)].map(literal).join(', ')});`);
  statements.push('CREATE TEMP TABLE migration_centers (id TEXT PRIMARY KEY);');
  for (const id of snapshot.centers) statements.push(`INSERT INTO migration_centers VALUES (${literal(String(id))});`);
  statements.push('CREATE TEMP TABLE migration_assertion (ok INTEGER NOT NULL CHECK (ok = 1));');
  statements.push(`INSERT INTO migration_assertion SELECT CASE WHEN
  (SELECT COUNT(*) FROM users) = (SELECT COUNT(*) FROM migration_user_keys)
  AND NOT EXISTS (SELECT 1 FROM users u LEFT JOIN migration_user_keys s ON u.id = s.id
    WHERE s.id IS NULL OR NOT (u.name IS s.name AND u.email IS s.email AND u.is_admin IS s.is_admin
      AND u.associated_centers IS s.associated_centers AND u.editor_for IS s.editor_for))
  AND (SELECT COUNT(*) FROM centers) = (SELECT COUNT(*) FROM migration_centers)
  AND NOT EXISTS (SELECT 1 FROM centers c LEFT JOIN migration_centers s ON c.id = s.id WHERE s.id IS NULL)
THEN 1 ELSE 0 END;`);
  if (!columns.includes('session_version')) statements.push('ALTER TABLE users ADD COLUMN session_version INTEGER NOT NULL DEFAULT 0;');
  statements.push('ALTER TABLE users ADD COLUMN name_key TEXT;');
  statements.push('UPDATE users SET name_key = (SELECT name_key FROM migration_user_keys WHERE id = users.id);');
  const [setup, ...triggers] = integrity.split(/(?=CREATE TRIGGER )/);
  const setupStatements = setup.split(/;\s*(?:\n|$)/).map((part) => part.trim()).filter(Boolean);
  statements.push(...setupStatements, ...triggers.map((trigger) => trigger.trim()), 'DROP TABLE migration_user_keys;', 'DROP TABLE migration_centers;', 'DROP TABLE migration_assertion;', 'COMMIT;');
  return statements;
}

export function migrationSql(snapshot, schema, columns) {
  return `${migrationStatements(snapshot, schema, columns).map((statement) => `${statement.replace(/;\s*$/, '')};`).join('\n')}\n`;
}

function connection(env) {
  if (!env.TURSO_DATABASE_URL || !env.TURSO_AUTH_TOKEN) throw new Error('TURSO_DATABASE_URL and TURSO_AUTH_TOKEN are required');
  const base = env.TURSO_DATABASE_URL.replace(/^libsql:\/\//, 'https://').replace(/\/+$/, '');
  const url = new URL(base);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new Error('Expected an HTTPS or libsql database URL');
  return { base, token: env.TURSO_AUTH_TOKEN };
}

async function requestDatabase(env, requests) {
  const { base, token } = connection(env);
  const response = await fetch(`${base}/v2/pipeline`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ requests: [...requests, { type: 'close' }] }),
  });
  if (!response.ok) throw new Error(`Database request failed with status ${response.status}`);
  return response.json();
}

export async function fetchSnapshot(env) {
  const body = await requestDatabase(env, [{ type: 'execute', stmt: { sql: SNAPSHOT_QUERY } }]);
  const result = body.results?.[0];
  const cell = result?.response?.result?.rows?.[0]?.[0];
  if (result?.type !== 'ok' || cell?.type !== 'text' || typeof cell.value !== 'string') throw new Error('Could not read the database snapshot');
  return JSON.parse(cell.value);
}

export async function fetchUserColumns(env) {
  const body = await requestDatabase(env, [{ type: 'execute', stmt: { sql: 'PRAGMA table_info(users)' } }]);
  const result = body.results?.[0];
  const table = result?.response?.result;
  const nameIndex = table?.cols?.findIndex((column) => column.name === 'name');
  if (result?.type !== 'ok' || !Array.isArray(table?.rows) || nameIndex == null || nameIndex < 0) throw new Error('Could not inspect the users schema');
  const columns = table.rows.map((row) => row[nameIndex]?.value);
  if (!columns.every((name) => typeof name === 'string')) throw new Error('Invalid users schema response');
  return columns;
}

export async function applyMigration(snapshot, schema, env) {
  const columns = await fetchUserColumns(env);
  const statements = migrationStatements(snapshot, schema, columns);
  const steps = statements.map((sql, index) => ({
    ...(index ? { condition: { type: 'ok', step: index - 1 } } : {}),
    stmt: { sql },
  }));
  const commit = steps.length - 1;
  steps.push({ condition: { type: 'not', cond: { type: 'ok', step: commit } }, stmt: { sql: 'ROLLBACK' } });
  const body = await requestDatabase(env, [{ type: 'batch', batch: { steps } }]);
  const result = body.results?.[0];
  if (result?.type !== 'ok' || !result.response?.result?.step_results?.[commit] || result.response.result.step_errors?.[commit]) {
    const rolledBack = result?.response?.result?.step_results?.[commit + 1];
    throw new Error(rolledBack
      ? 'Migration failed and was rolled back; refresh the snapshot and review database errors'
      : 'Migration outcome is uncertain; inspect the database before retrying');
  }
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 1 || args.length > 2 || (args[1] && args[1] !== '--apply')) {
    throw new Error('Usage: node scripts/database-preflight.mjs snapshot.json|--live [--apply]');
  }
  const snapshot = args[0] === '--live' ? await fetchSnapshot(process.env) : JSON.parse(readFileSync(args[0], 'utf8'));
  const errors = inspectSnapshot(snapshot);
  if (errors.length) {
    for (const error of errors) console.error(error);
    process.exitCode = 1;
    return;
  }
  if (args[1] === '--apply') {
    const schema = readFileSync(fileURLToPath(new URL('../database/schema.sql', import.meta.url)), 'utf8');
    await applyMigration(snapshot, schema, process.env);
    console.log('Migration applied successfully.');
  } else console.log(`Preflight passed: ${snapshot.users.length} users, ${snapshot.centers.length} centers.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => { console.error(error instanceof Error ? error.message : 'Preflight failed'); process.exitCode = 1; });
}
