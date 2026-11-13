import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { applyMigration, fetchSnapshot, inspectSnapshot, migrationSql, SNAPSHOT_QUERY } from '../scripts/database-preflight.mjs';
import { nameKey } from '../src/api/name-key.mjs';

const schema = readFileSync(new URL('../database/schema.sql', import.meta.url), 'utf8');
const legacySchema = schema.split('-- BEGIN USER INTEGRITY')[0]
  .replace('  name_key TEXT,\n', '')
  .replace('  last_login_at TEXT,\n  session_version INTEGER NOT NULL DEFAULT 0', '  last_login_at TEXT');

function setup(withSession = true) {
  const db = new DatabaseSync(':memory:');
  db.exec(legacySchema);
  if (withSession) db.exec('ALTER TABLE users ADD COLUMN session_version INTEGER NOT NULL DEFAULT 0');
  db.exec("INSERT INTO centers (id, name) VALUES ('1', 'One'), ('2', 'Two')");
  return db;
}

function snapshot(db) { return JSON.parse(db.prepare(SNAPSHOT_QUERY).get().snapshot); }
function columns(db) { return db.prepare('PRAGMA table_info(users)').all().map((row) => row.name); }
function insert(db, id, name, email, centers) {
  db.prepare('INSERT INTO users (id, name, email, associated_centers) VALUES (?, ?, ?, ?)').run(id, name, email, JSON.stringify(centers));
}

test('preflight reports conflicts and does not change existing records', () => {
  const db = setup();
  insert(db, 'a', 'Straße', null, [1]);
  insert(db, 'b', 'STRASSE', 'B@EXAMPLE.ORG', [1]);
  insert(db, 'c', 'Pair &', null, [2]);
  const data = snapshot(db);
  const errors = inspectSnapshot(data);
  assert(errors.some((e) => e.includes('email is not normalized')));
  assert(errors.some((e) => e.includes('name conflicts')));
  assert(errors.some((e) => e.includes('invalid pair')));
  assert.throws(() => migrationSql(data, schema), /Preflight conflicts/);
  assert.deepEqual(snapshot(db), data);
  db.close();
});

test('migration backfills keys without changing users and refuses a stale snapshot', () => {
  const db = setup();
  insert(db, 'a', 'Straße', null, [1]);
  insert(db, 'b', 'B', 'b@example.org', [2]);
  const data = snapshot(db);
  const migration = migrationSql(data, schema, columns(db));
  db.prepare('UPDATE users SET name = ? WHERE id = ?').run('Changed', 'b');
  assert.throws(() => db.exec(migration), /CHECK constraint failed/);
  db.exec('ROLLBACK');
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM pragma_table_info('users') WHERE name = 'name_key'").get().n, 0);
  db.prepare('UPDATE users SET name = ? WHERE id = ?').run('B', 'b');
  db.exec(migration);
  assert.deepEqual(snapshot(db), data);
  assert.equal(db.prepare("SELECT name_key FROM users WHERE id = 'a'").get().name_key, nameKey('STRASSE'));
  db.close();
});

test('triggers enforce folded names, roles, and memberships on inserts and edits', () => {
  const db = setup();
  insert(db, 'a', 'Straße', null, [1]);
  db.exec(migrationSql(snapshot(db), schema, columns(db)));
  const add = db.prepare('INSERT INTO users (id, name, name_key, email, associated_centers) VALUES (?, ?, ?, ?, ?)');
  assert.throws(() => add.run('b', 'STRASSE', nameKey('STRASSE'), 'b@example.org', '[1]'), /SAI_NAME_CONFLICT/);
  add.run('b', 'STRASSE', nameKey('STRASSE'), 'b@example.org', '[2]');
  assert.throws(() => db.prepare("UPDATE users SET associated_centers = '[1]' WHERE id = 'b'").run(), /SAI_NAME_CONFLICT/);
  assert.throws(() => db.prepare("UPDATE users SET editor_for = '[2]', email = NULL WHERE id = 'b'").run(), /SAI_EMAIL_REQUIRED/);
  assert.throws(() => db.prepare("DELETE FROM centers WHERE id = '1'").run(), /SAI_CENTER_IN_USE/);
  assert.equal(nameKey('ΟΣ'), nameKey('ος'));
  assert.equal(nameKey('Ä'), nameKey('ä'));
  db.close();
});

test('remote preflight is read-only and migration batches abort and roll back on failure', async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  const data = { users: [], centers: [] };
  globalThis.fetch = async (url, options) => {
    assert.equal(url, 'https://db.example.org/v2/pipeline');
    const request = JSON.parse(options.body).requests[0];
    requests.push(request);
    if (request.type === 'execute') {
      if (request.stmt.sql === 'PRAGMA table_info(users)') {
        return Response.json({ results: [{ type: 'ok', response: { result: { cols: [{ name: 'name' }], rows: [[{ type: 'text', value: 'id' }], [{ type: 'text', value: 'session_version' }]] } } }] });
      }
      return Response.json({ results: [{ type: 'ok', response: { result: { rows: [[{ type: 'text', value: JSON.stringify(data) }]] } } }] });
    }
    return Response.json({ results: [{ type: 'ok', response: { result: { step_results: [], step_errors: [{ message: 'failed' }] } } }] });
  };
  try {
    const env = { TURSO_DATABASE_URL: 'libsql://db.example.org', TURSO_AUTH_TOKEN: 'test' };
    assert.deepEqual(await fetchSnapshot(env), data);
    assert.equal(requests[0].stmt.sql, SNAPSHOT_QUERY);
    await assert.rejects(applyMigration(data, schema, env), /outcome is uncertain/);
    const steps = requests[2].batch.steps;
    assert.match(steps[0].stmt.sql, /^BEGIN IMMEDIATE/);
    assert.equal(steps.at(-1).stmt.sql, 'ROLLBACK');
    assert.equal(steps.at(-1).condition.type, 'not');
    for (let i = 1; i < steps.length - 1; i++) assert.deepEqual(steps[i].condition, { type: 'ok', step: i - 1 });
  } finally { globalThis.fetch = originalFetch; }
});

test('conditional migration batch commits valid snapshots and rolls back stale ones', async () => {
  const db = setup();
  insert(db, 'a', 'User', null, [1]);
  const data = snapshot(db);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, options) => {
    const request = JSON.parse(options.body).requests[0];
    if (request.type === 'execute') {
      return Response.json({ results: [{ type: 'ok', response: { result: {
        cols: [{ name: 'name' }], rows: columns(db).map((name) => [{ type: 'text', value: name }]),
      } } }] });
    }
    const steps = request.batch.steps;
    const stepResults = [], stepErrors = [];
    for (const step of steps) {
      const cond = step.condition;
      const permitted = !cond || (cond.type === 'ok' ? !!stepResults[cond.step] : !stepResults[cond.cond.step]);
      if (!permitted) { stepResults.push(null); stepErrors.push(null); continue; }
      try { db.prepare(step.stmt.sql).run(); stepResults.push({}); stepErrors.push(null); }
      catch (error) { stepResults.push(null); stepErrors.push({ message: error.message }); }
    }
    return Response.json({ results: [{ type: 'ok', response: { result: { step_results: stepResults, step_errors: stepErrors } } }] });
  };
  try {
    const env = { TURSO_DATABASE_URL: 'libsql://db.example.org', TURSO_AUTH_TOKEN: 'test' };
    db.prepare("UPDATE users SET name = 'Changed' WHERE id = 'a'").run();
    await assert.rejects(applyMigration(data, schema, env), /rolled back/);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM pragma_table_info('users') WHERE name = 'name_key'").get().n, 0);
    db.prepare("UPDATE users SET name = 'User' WHERE id = 'a'").run();
    await applyMigration(data, schema, env);
    assert.equal(db.prepare("SELECT name_key FROM users WHERE id = 'a'").get().name_key, nameKey('User'));
  } finally { globalThis.fetch = originalFetch; db.close(); }
});

test('one schema initializes fresh databases and legacy upgrades preserve session versions', () => {
  const fresh = new DatabaseSync(':memory:');
  fresh.exec(schema);
  fresh.exec(schema);
  assert(columns(fresh).includes('name_key'));
  assert(columns(fresh).includes('session_version'));
  assert.throws(() => migrationSql(snapshot(fresh), schema, columns(fresh)), /already has name_key/);
  fresh.close();

  for (const withSession of [false, true]) {
    const db = setup(withSession);
    insert(db, 'legacy', 'Legacy', null, [1]);
    if (withSession) db.exec("UPDATE users SET session_version = 7 WHERE id = 'legacy'");
    db.exec(migrationSql(snapshot(db), schema, columns(db)));
    const row = db.prepare("SELECT name_key, session_version FROM users WHERE id = 'legacy'").get();
    assert.equal(row.name_key, nameKey('Legacy'));
    assert.equal(row.session_version, withSession ? 7 : 0);
    assert.ok(db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'index' AND name = 'users_email_unique'").get());
    db.close();
  }
});
