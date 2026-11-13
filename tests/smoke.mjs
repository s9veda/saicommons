import { execFileSync } from 'node:child_process';
import { createHmac } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
import { nameKey } from '../src/api/name-key.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outdir = path.join(root, '.wrangler', 'smoke-build');
execFileSync('npx', ['wrangler', 'deploy', '--config', 'src/api/wrangler.jsonc', '--dry-run', '--outdir', outdir], { cwd: root, stdio: 'pipe' });
const worker = (await import(`${pathToFileURL(path.join(outdir, 'index.js')).href}?t=${Date.now()}`)).default;

// In-memory SQLite stands in for Turso's HTTP pipeline endpoint.
const db = new DatabaseSync(':memory:');
db.exec(readFileSync(path.join(root, 'database', 'schema.sql'), 'utf8'));
const wire = (v) => (v === null ? { type: 'null' } : typeof v === 'number' || typeof v === 'bigint' ? { type: 'integer', value: String(v) } : { type: 'text', value: v });
let beforeStatement = null;
function run(stmt) {
  beforeStatement?.(stmt.sql);
  const args = (stmt.args ?? []).map((a) => (a.type === 'null' ? null : a.type === 'integer' ? Number(a.value) : a.value));
  const prepared = db.prepare(stmt.sql);
  const returnsRows = /^\s*(SELECT|BEGIN|COMMIT|ROLLBACK)/i.test(stmt.sql) ? /^\s*SELECT/i.test(stmt.sql) : /RETURNING/i.test(stmt.sql);
  let rows = [], changes = 0;
  if (returnsRows) rows = prepared.all(...args);
  else changes = Number(prepared.run(...args).changes);
  if (/RETURNING/i.test(stmt.sql)) changes = rows.length;
  const cols = rows[0] ? Object.keys(rows[0]).map((name) => ({ name })) : [];
  return { cols, rows: rows.map((r) => Object.values(r).map(wire)), affected_row_count: changes };
}
const holds = (cond, results, errors) => !cond
  || (cond.type === 'ok' ? Boolean(results[cond.step]) : cond.type === 'not' ? !holds(cond.cond, results, errors) : false);
const realFetch = globalThis.fetch;
const emails = [];
let failBrevo = false;
globalThis.fetch = async (url, init) => {
  const target = String(url);
  if (target === 'https://db.example.turso.io/v2/pipeline') {
    assert.equal(init.headers.authorization, 'Bearer turso-token');
    const results = [];
    for (const request of JSON.parse(init.body).requests) {
      if (request.type === 'execute') {
        try { results.push({ type: 'ok', response: { type: 'execute', result: run(request.stmt) } }); }
        catch (error) { results.push({ type: 'error', error: { message: error.message } }); }
      } else if (request.type === 'batch') {
        const stepResults = [], stepErrors = [];
        for (const step of request.batch.steps) {
          if (!holds(step.condition, stepResults, stepErrors)) { stepResults.push(null); stepErrors.push(null); continue; }
          try { stepResults.push(run(step.stmt)); stepErrors.push(null); } catch (error) { stepResults.push(null); stepErrors.push({ message: error.message }); }
        }
        results.push({ type: 'ok', response: { type: 'batch', result: { step_results: stepResults, step_errors: stepErrors } } });
      } else results.push({ type: 'ok', response: { type: 'close' } });
    }
    return Response.json({ results });
  }
  if (target === 'https://api.brevo.com/v3/smtp/email') {
    if (failBrevo) return new Response('{}', { status: 500 });
    assert.equal(init.headers['api-key'], 'brevo-key');
    emails.push(JSON.parse(init.body));
    return Response.json({ messageId: 'x' });
  }
  return realFetch(url, init);
};

const env = {
  SESSION_SECRET: 'test-secret', ADMIN_API_KEY: 'admin-key', ALLOWED_ORIGINS: 'https://app.example.org',
  API_KEYS: 'web=front-key, bhajanstudio-ios=ios-key, malformed, =nokey',
  TURSO_DATABASE_URL: 'libsql://db.example.turso.io', TURSO_AUTH_TOKEN: 'turso-token', BREVO_API_KEY: 'brevo-key',
};
let ip = 0;
const call = (pathname, { method = 'POST', body, headers = {}, key = 'front-key', fresh = true, adminKey, bearer, e = env } = {}) => worker.fetch(new Request(`https://auth.test${pathname}`, {
  method,
  headers: {
    'content-type': 'application/json', 'cf-connecting-ip': fresh ? `10.0.0.${++ip}` : '10.9.9.9',
    ...(key ? { 'x-api-key': key } : {}), ...(adminKey ? { 'x-admin-key': adminKey } : {}), ...(bearer ? { authorization: `Bearer ${bearer}` } : {}), ...headers,
  },
  body: body === undefined ? undefined : JSON.stringify(body),
}), e);
const admin = (pathname, opts = {}) => call(pathname, { key: null, adminKey: 'admin-key', ...opts });
const lastCode = () => /is ([0-9]{6})\./.exec(emails.at(-1).textContent)[1];
const expire = () => db.exec(`UPDATE otp_request_log SET created_at = '2000-01-01T00:00:00.000Z'`);
const signIn = async (email, key = 'front-key') => {
  expire();
  await call('/v1/login', { body: { email }, key });
  const response = await call('/v1/verify-otp', { body: { email, otp_code: lastCode() }, key });
  assert.equal(response.status, 200);
  return response.json();
};

// API key and origin enforcement
assert.equal((await call('/v1/login', { body: { email: 'a@b.org' }, key: null })).status, 401);
assert.equal((await call('/v1/login', { body: { email: 'a@b.org' }, key: 'nope' })).status, 401);
assert.equal((await call('/v1/login', { body: { email: 'a@b.org' }, key: 'nokey' })).status, 401);
assert.equal((await call('/v1/login', { body: { email: 'a@b.org' }, key: 'malformed' })).status, 401);
assert.equal((await call('/v1/login', { body: { email: 'a@b.org' }, headers: { origin: 'https://evil.example' } })).status, 403);
const preflight = await call('/v1/login', { method: 'OPTIONS', key: null, headers: { origin: 'https://app.example.org' } });
assert.equal(preflight.status, 204);
assert.equal(preflight.headers.get('access-control-allow-origin'), 'https://app.example.org');
assert.equal((await call('/v1/nope')).status, 404);
assert.equal((await call('/v1/login', { method: 'GET' })).status, 405);

// Centers (admin key): create, validate, duplicate, update
assert.equal((await call('/v1/centers', { method: 'POST', body: { name: 'X' } })).status, 401, 'client key alone is not admin');
assert.equal((await call('/v1/centers', { method: 'POST', body: { name: 'X' }, key: null, adminKey: 'wrong' })).status, 401);
assert.equal((await admin('/v1/centers', { body: { name: '  ' } })).status, 400);
assert.equal((await admin('/v1/centers', { body: { name: 'X', badge_text_color: 'red' } })).status, 400);
const c1 = (await (await admin('/v1/centers', { body: { name: 'Fremont', badge_text_color: '#1e40af' } })).json()).center;
assert.equal(c1.name, 'Fremont');
assert.equal(c1.created_by, 'admin-key');
const dup = await admin('/v1/centers', { body: { name: 'FREMONT' } });
assert.equal(dup.status, 409, 'names are unique case-insensitively');
const c2 = (await (await admin('/v1/centers', { body: { name: 'San Jose' } })).json()).center;
assert.equal(c2.badge_text_color, '#000000');
db.prepare("INSERT INTO users (id, email, name, name_key, registered_via, associated_centers, editor_for, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
  .run('legacy', 'legacy@example.org', 'Legacy', nameKey('Legacy'), 'import', JSON.stringify([c1.id]), JSON.stringify([c1.id]), 'n', 'n');
const legacy = await signIn('legacy@example.org');
assert.deepEqual(legacy.user.associated_centers, [c1.id]);
assert.deepEqual(legacy.user.editor_for, [c1.id]);
db.prepare('UPDATE users SET is_admin = 1, associated_centers = NULL, editor_for = NULL WHERE id = ?').run('legacy');
const nullableLegacy = (await (await call('/v1/session', { method: 'GET', bearer: legacy.token })).json()).user;
assert.deepEqual(nullableLegacy.associated_centers, []);
assert.deepEqual(nullableLegacy.editor_for, []);
db.prepare('UPDATE users SET is_admin = 0, associated_centers = ?, editor_for = ? WHERE id = ?').run(JSON.stringify([c1.id]), '[]', 'legacy');
assert.equal((await admin('/v1/centers', { body: { name: 'Bad editor', editor_ids: ['nope'] } })).status, 400);
assert.equal(db.prepare("SELECT COUNT(*) n FROM centers WHERE name = 'Bad editor'").get().n, 0);

// Public list (client key) and lookup
const listed = await (await call('/v1/centers', { method: 'GET' })).json();
assert.deepEqual(listed.centers.map((c) => c.name), ['Fremont', 'San Jose']);
assert.equal((await call('/v1/centers', { method: 'GET', key: null })).status, 401);
assert.equal((await (await call(`/v1/centers/${c1.id}`, { method: 'GET' })).json()).center.name, 'Fremont');
assert.equal((await call('/v1/centers/999', { method: 'GET' })).status, 404);
assert.equal((await call('/v1/centers/abc', { method: 'GET' })).status, 400);

// Register validation
const emailsBefore = emails.length;
assert.equal((await call('/v1/register', { body: { email: 'bad', name: 'A' } })).status, 400);
assert.equal((await call('/v1/register', { body: { email: 'a@b.org' } })).status, 400);
assert.equal((await call('/v1/register', { body: { email: 'a@b.org', name: 'A', gender: 'x' } })).status, 400);
assert.equal((await call('/v1/register', { body: { email: 'a@b.org', name: 'A', associated_centers: [1, 'two'] } })).status, 400);
assert.equal((await call('/v1/register', { body: { email: 'a@b.org', name: 'A', associated_centers: [999] } })).status, 400, 'unknown center');
assert.equal(emails.length, emailsBefore);

// Register -> verify
const reg = await call('/v1/register', { body: { email: ' Sai@Example.org ', name: 'Sai', associated_centers: [c1.id] } });
assert.equal(reg.status, 200);
assert.equal(emails.length, emailsBefore + 1);
assert.deepEqual(emails.at(-1).to, [{ email: 'sai@example.org' }]);
assert.equal(db.prepare("SELECT COUNT(*) n FROM users WHERE email = 'sai@example.org'").get().n, 0, 'user is created only after verification');
const code = lastCode();
assert.doesNotMatch(JSON.stringify(db.prepare('SELECT * FROM otp_codes').all()), new RegExp(code));
assert.equal((await call('/v1/verify-otp', { body: { email: 'sai@example.org', otp_code: code === '123456' ? '654321' : '123456' } })).status, 400);
const verified = await call('/v1/verify-otp', { body: { email: 'sai@example.org', otp_code: code } });
assert.equal(verified.status, 200);
const { user, token } = await verified.json();
assert.deepEqual({ ...user, id: undefined }, { id: undefined, email: 'sai@example.org', name: 'Sai', gender: null, associated_centers: [c1.id], is_admin: false, editor_for: [], role: 'viewer' });
assert.equal((await call('/v1/verify-otp', { body: { email: 'sai@example.org', otp_code: code } })).status, 400, 'code is single use');

// Session, and that a non-admin token cannot manage centers
assert.equal((await (await call('/v1/session', { method: 'GET', bearer: token })).json()).user.id, user.id);
assert.equal((await call('/v1/session', { method: 'GET', bearer: `${token}x` })).status, 401);
assert.equal((await call('/v1/session', { method: 'GET' })).status, 401);
assert.equal((await call('/v1/centers', { body: { name: 'Nope' }, bearer: token })).status, 401, 'non-admin token is rejected');

// Per-client keys bind tokens
const ios = await signIn('sai@example.org', 'ios-key');
assert.equal((await call('/v1/session', { method: 'GET', key: 'ios-key', bearer: ios.token })).status, 200);
assert.equal((await call('/v1/session', { method: 'GET', key: 'front-key', bearer: ios.token })).status, 401, 'token is bound to its client');
await call('/v1/register', { body: { email: 'ios@example.org', name: 'Ios', associated_centers: [c1.id] }, key: 'ios-key', fresh: true });
await call('/v1/verify-otp', { body: { email: 'ios@example.org', otp_code: lastCode() }, key: 'ios-key' });
assert.equal(db.prepare("SELECT registered_via FROM users WHERE email = 'ios@example.org'").get().registered_via, 'bhajanstudio-ios');
assert.equal(db.prepare("SELECT client FROM otp_request_log WHERE email = 'ios@example.org'").get().client, 'bhajanstudio-ios');

// Login: unknown and known emails get identical responses; only known gets mail
expire();
const before = emails.length;
const unknown = await call('/v1/login', { body: { email: 'nobody@example.org' } });
assert.equal(unknown.status, 200);
assert.equal(emails.length, before);
expire();
const known = await call('/v1/login', { body: { email: 'sai@example.org' } });
assert.deepEqual(await known.json(), await unknown.json());
assert.equal(emails.length, before + 1);

// Registering an existing email never overwrites the stored profile or centers
expire();
await call('/v1/register', { body: { email: 'sai@example.org', name: 'Impostor', associated_centers: [c1.id] } });
assert.equal((await call('/v1/verify-otp', { body: { email: 'sai@example.org', otp_code: lastCode() } })).status, 200);
assert.equal(db.prepare("SELECT name FROM users WHERE email = 'sai@example.org'").get().name, 'Sai');
assert.deepEqual(JSON.parse(db.prepare('SELECT associated_centers FROM users WHERE id = ?').get(user.id).associated_centers), [c1.id]);

// Admin user import with centers and roles
assert.equal((await admin('/v1/admin/users', { method: 'GET', adminKey: undefined, key: null })).status, 401);
assert.equal((await call('/v1/admin/users', { method: 'GET' })).status, 401, 'client keys are not admin keys');
assert.equal((await admin('/v1/admin/users/import', { body: { users: [{ email: 'bad', name: 'X' }] } })).status, 400);
assert.equal((await admin('/v1/admin/users/import', { body: { users: [] } })).status, 400);
assert.equal((await admin('/v1/admin/users/import', { body: { users: [{ email: 'x@example.org', name: 'X', editor_for: [999] }] } })).status, 400, 'unknown center');
const imp = await admin('/v1/admin/users/import', { body: { users: [
  { email: 'Boss@Example.org', name: 'Boss', is_admin: true, associated_centers: [c1.id] },
  { email: 'ed@example.org', name: 'Ed', gender: 'Other', editor_for: [c1.id, c2.id] },
  { email: 'sai@example.org', name: 'Sai Renamed', associated_centers: [c1.id] },
] } });
assert.deepEqual(await imp.json(), { ok: true, imported: 3 });
const users = Object.fromEntries((await (await admin('/v1/admin/users', { method: 'GET' })).json()).users.map((u) => [u.email, u]));
assert.equal(users['boss@example.org'].role, 'admin');
assert.equal(users['ed@example.org'].role, 'editor');
assert.deepEqual(users['ed@example.org'].associated_centers, [c1.id, c2.id], 'editors are associated with their centers');
assert.deepEqual(users['ed@example.org'].editor_for, [c1.id, c2.id]);
assert.equal(users['sai@example.org'].name, 'Sai Renamed');
assert.deepEqual(users['sai@example.org'].associated_centers, [c1.id], 'import replaces center links');
assert.equal(users['sai@example.org'].id, user.id, 'import keeps the existing user id');
assert.equal((await admin('/v1/admin/users/import', { body: { users: [{ email: 'ok@example.org', name: 'Ok' }, { email: 'bad', name: 'X' }] } })).status, 400);
assert.equal(db.prepare("SELECT COUNT(*) n FROM users WHERE email = 'ok@example.org'").get().n, 0);

// Admin token (OTP login as an admin user) manages centers; created_by records the admin
const boss = await signIn('boss@example.org');
assert.equal(boss.user.role, 'admin');
const viaToken = await call('/v1/centers', { body: { name: 'Oakland', editor_ids: [users['ed@example.org'].id] }, bearer: boss.token });
assert.equal(viaToken.status, 201);
const c3 = (await viaToken.json()).center;
assert.equal(c3.created_by, 'boss@example.org');
assert.deepEqual(c3.editor_ids, [users['ed@example.org'].id]);
assert.equal((await call('/v1/centers', { body: { name: 'Oakland2' }, bearer: boss.token, key: 'ios-key' })).status, 401, 'token is bound to its client key');

// Update: rename, recolor, replace editors (removed editors stay associated)
const upd = await call(`/v1/centers/${c3.id}`, { method: 'PUT', bearer: boss.token, body: { name: 'Oakland East', badge_text_color: '#00ff00', editor_ids: [boss.user.id] } });
assert.equal(upd.status, 200);
const updated = (await upd.json()).center;
assert.deepEqual({ name: updated.name, color: updated.badge_text_color, editors: updated.editor_ids, by: updated.updated_by }, { name: 'Oakland East', color: '#00ff00', editors: [boss.user.id], by: 'boss@example.org' });
const edAfterUpdate = db.prepare('SELECT associated_centers, editor_for FROM users WHERE id = ?').get(users['ed@example.org'].id);
assert.ok(JSON.parse(edAfterUpdate.associated_centers).includes(c3.id));
assert.ok(!JSON.parse(edAfterUpdate.editor_for).includes(c3.id));
assert.equal((await call(`/v1/centers/${c3.id}`, { method: 'PUT', bearer: boss.token, body: { name: 'fremont' } })).status, 409);
assert.equal((await call('/v1/centers/999', { method: 'PUT', bearer: boss.token, body: { name: 'Z' } })).status, 404);
assert.equal((await call('/v1/session', { method: 'GET', bearer: boss.token })).status, 200);
const me = (await (await call('/v1/session', { method: 'GET', bearer: boss.token })).json()).user;
assert.deepEqual(me.editor_for, [c3.id], 'editor changes show up in the session');

// Delete: blocked while users are associated, allowed once empty
const blocked = await call(`/v1/centers/${c1.id}`, { method: 'DELETE', bearer: boss.token });
assert.equal(blocked.status, 409);
assert.ok((await blocked.json()).dependencies.items.length > 0);
await admin('/v1/admin/users/import', { body: { users: [{ email: 'boss@example.org', name: 'Boss', is_admin: true }] } });
assert.equal((await call(`/v1/centers/${c3.id}`, { method: 'DELETE', bearer: boss.token })).status, 409, 'ed still associated as viewer');
db.prepare(`UPDATE users SET associated_centers = (SELECT json_group_array(value) FROM json_each(associated_centers) WHERE value != ?)`).run(c3.id);
assert.equal((await call(`/v1/centers/${c3.id}`, { method: 'DELETE', adminKey: 'admin-key', key: null })).status, 200);
assert.equal((await call(`/v1/centers/${c3.id}`, { method: 'GET' })).status, 404);

// Atomicity: a failing statement rolls the whole transaction back
const countCenters = () => db.prepare('SELECT COUNT(*) n FROM centers').get().n;
const centersBefore = countCenters();
db.exec(`CREATE TRIGGER fail_link BEFORE UPDATE ON users WHEN NEW.id = 'poison' BEGIN SELECT RAISE(ABORT, 'poisoned'); END;`);
db.prepare(`INSERT INTO users (id, email, name, name_key, registered_via, associated_centers, created_at, updated_at) VALUES ('poison', 'poison@example.org', 'P', 'p', 'x', ?, 'n', 'n')`).run(JSON.stringify([c1.id]));
assert.equal((await admin('/v1/centers', { body: { name: 'Rolled back', editor_ids: ['poison'] } })).status, 500);
assert.equal(countCenters(), centersBefore, 'center insert was rolled back');
assert.equal(db.prepare("SELECT COUNT(*) n FROM centers WHERE name = 'Rolled back'").get().n, 0);
db.exec(`DROP TRIGGER fail_link; DELETE FROM users WHERE id = 'poison'`);

// Delete a user
const del = await admin('/v1/admin/users/delete', { body: { email: 'ed@example.org' } });
assert.deepEqual(await del.json(), { ok: true, deleted: 1 });
assert.equal(db.prepare('SELECT COUNT(*) n FROM users WHERE id = ?').get(users['ed@example.org'].id).n, 0);
assert.equal((await admin('/v1/admin/users', { method: 'GET', e: { ...env, ADMIN_API_KEY: undefined }, adminKey: 'x' })).status, 401, 'admin key path is disabled without ADMIN_API_KEY');

// Lockout after five wrong attempts, even if the correct code follows
expire();
await call('/v1/login', { body: { email: 'sai@example.org' } });
const good = lastCode();
const bad = good === '111111' ? '222222' : '111111';
for (let i = 0; i < 5; i++) assert.equal((await call('/v1/verify-otp', { body: { email: 'sai@example.org', otp_code: bad } })).status, 400);
assert.equal((await call('/v1/verify-otp', { body: { email: 'sai@example.org', otp_code: good } })).status, 400);

// Throttling: one per minute per email, five per hour; per-IP cap
expire();
assert.equal((await call('/v1/login', { body: { email: 'sai@example.org' } })).status, 200);
assert.equal((await call('/v1/login', { body: { email: 'sai@example.org' } })).status, 429);
expire();
for (let i = 0; i < 20; i++) assert.equal((await call('/v1/login', { body: { email: `u${i}@example.org` }, fresh: false })).status, 200);
assert.equal((await call('/v1/login', { body: { email: 'u99@example.org' }, fresh: false })).status, 429);

// Brevo failure on register surfaces as 503 and leaves no usable code
expire();
failBrevo = true;
assert.equal((await call('/v1/register', { body: { email: 'fail@example.org', name: 'F', associated_centers: [c1.id] } })).status, 503);
assert.equal(db.prepare("SELECT COUNT(*) n FROM otp_codes WHERE email = 'fail@example.org'").get().n, 0);
failBrevo = false;

// Admin user CRUD and lock-out safeguards
assert.equal((await admin('/v1/admin/users', { body: { email: 'not-an-email', name: 'Invalid' } })).status, 400);
assert.equal((await admin('/v1/admin/users', { body: { email: 123, name: 'Invalid' } })).status, 400);
const noEmail = await admin('/v1/admin/users', { body: { name: 'No Email', associated_centers: [c1.id] } });
assert.equal(noEmail.status, 201);
const noEmailUser = (await noEmail.json()).user;
assert.equal(noEmailUser.email, null);
assert.equal((await admin('/v1/centers', { body: { name: 'No email editor', editor_ids: [noEmailUser.id] } })).status, 400);
const created = await admin('/v1/admin/users', { body: { email: 'New@Example.org', name: 'New', gender: 'girl', associated_centers: [c1.id], editor_for: [c2.id] } });
assert.equal(created.status, 201);
const nu = (await created.json()).user;
assert.deepEqual({ ...nu, id: undefined }, { id: undefined, email: 'new@example.org', name: 'New', gender: 'Girl', associated_centers: [c1.id, c2.id], is_admin: false, editor_for: [c2.id], role: 'editor' });
assert.equal(db.prepare('SELECT registered_via FROM users WHERE id = ?').get(nu.id).registered_via, 'admin');
assert.equal((await admin('/v1/admin/users', { body: { email: 'new@example.org', name: 'Dup', associated_centers: [c1.id] } })).status, 409);
assert.equal((await admin('/v1/admin/users', { body: { email: 'z@example.org', name: 'Z', associated_centers: [999] } })).status, 400);
const edited = await admin(`/v1/admin/users/${nu.id}`, { method: 'PUT', body: { name: 'New Name', gender: 'Girl', associated_centers: [c1.id], editor_for: [] } });
assert.equal(edited.status, 200);
assert.deepEqual((await edited.json()).user, { ...nu, name: 'New Name', associated_centers: [c1.id], editor_for: [], role: 'viewer' });
assert.equal((await admin('/v1/admin/users/nope', { method: 'PUT', body: { name: 'X' } })).status, 404);
assert.equal((await admin(`/v1/admin/users/${nu.id}`, { method: 'PUT', body: { name: '' } })).status, 400);

// The only admin cannot be demoted or deleted; admins cannot demote or delete themselves
const bossId = boss.user.id;
assert.equal((await admin('/v1/admin/users/import', { body: { users: [
  { email: boss.user.email, name: 'Boss', is_admin: false, associated_centers: [c1.id] },
] } })).status, 409, 'import cannot demote an administrator');
assert.equal((await admin(`/v1/admin/users/${bossId}`, { method: 'PUT', body: { name: 'Boss', is_admin: false, associated_centers: [c1.id] } })).status, 409, 'last admin');
assert.equal((await admin(`/v1/admin/users/${bossId}`, { method: 'DELETE' })).status, 409, 'last admin');
await admin(`/v1/admin/users/${nu.id}`, { method: 'PUT', body: { name: 'New Name', is_admin: true } });
assert.equal((await call(`/v1/admin/users/${bossId}`, { method: 'PUT', bearer: boss.token, body: { name: 'Boss', is_admin: false, associated_centers: [c1.id] } })).status, 409, 'self-demotion');
assert.equal((await call(`/v1/admin/users/${bossId}`, { method: 'DELETE', bearer: boss.token })).status, 409, 'self-delete');
assert.equal((await call(`/v1/admin/users/${nu.id}`, { method: 'PUT', bearer: boss.token, body: { name: 'New Name', is_admin: false, associated_centers: [c1.id] } })).status, 200, 'another admin may be demoted');
assert.equal((await call(`/v1/admin/users/${nu.id}`, { method: 'DELETE', bearer: boss.token })).status, 200);
assert.equal(db.prepare('SELECT COUNT(*) n FROM users WHERE id = ?').get(nu.id).n, 0);
assert.equal((await admin('/v1/admin/users/delete', { body: { email: 'nobody@example.org' } })).status, 200);

// Editors can view overlapping memberships, but can change only exclusively scoped users.
const manager = (await (await admin('/v1/admin/users', { body: {
  email: 'editor@example.org', name: 'Editor', associated_centers: [c1.id], editor_for: [c1.id],
} })).json()).user;
const scoped = (await (await admin('/v1/admin/users', { body: {
  name: 'Scoped', associated_centers: [c1.id],
} })).json()).user;
const shared = (await (await admin('/v1/admin/users', { body: {
  name: 'Shared', associated_centers: [c1.id, c2.id],
} })).json()).user;
const outsider = (await (await admin('/v1/admin/users', { body: {
  name: 'Outside', associated_centers: [c2.id],
} })).json()).user;
const editorSession = await signIn(manager.email);
const managedUsers = await (await call('/v1/admin/users', { method: 'GET', bearer: editorSession.token })).json();
assert(managedUsers.users.some((u) => u.id === scoped.id));
assert(managedUsers.users.some((u) => u.id === shared.id));
assert(!managedUsers.users.some((u) => u.id === outsider.id));
const editAsEditor = (id, body) => call(`/v1/admin/users/${id}`, { method: 'PUT', bearer: editorSession.token, body });
assert.equal((await editAsEditor(scoped.id, { name: 'Scoped Updated', associated_centers: [c1.id] })).status, 200);
assert.equal((await editAsEditor(shared.id, { name: 'Shared', associated_centers: [c1.id] })).status, 403);
assert.equal((await editAsEditor(scoped.id, { name: 'Scoped Updated', associated_centers: [c2.id] })).status, 403);
assert.equal((await editAsEditor(scoped.id, { name: 'Scoped Updated', is_admin: true, email: 'scoped@example.org' })).status, 403);
assert.equal((await call(`/v1/admin/users/${shared.id}`, { method: 'DELETE', bearer: editorSession.token })).status, 403);
assert.equal((await call('/v1/admin/users', { bearer: editorSession.token, body: {
  name: 'Not scoped', associated_centers: [c2.id],
} })).status, 403);
assert.equal((await call('/v1/centers', { bearer: editorSession.token, body: { name: 'No editor access' } })).status, 401);
assert.equal((await call('/v1/admin/users', { method: 'GET', bearer: token })).status, 401);

// Promotions of name-only users invalidate their existing sessions even when revocation is declined.
const nameSessionResponse = await call('/v1/register-name', { body: { name: 'Promoted', associated_centers: [c1.id] } });
assert.equal(nameSessionResponse.status, 201);
const nameSession = await nameSessionResponse.json();
assert.equal((await editAsEditor(nameSession.user.id, {
  name: 'Promoted', email: 'promoted@example.org', associated_centers: [c1.id], editor_for: [c1.id], revoke_sessions: false,
})).status, 200);
assert.equal((await call('/v1/session', { method: 'GET', bearer: nameSession.token })).status, 401);
const delayed = await (await call('/v1/register-name', { body: { name: 'Delayed Promotion', associated_centers: [c1.id] } })).json();
assert.equal((await admin(`/v1/admin/users/${delayed.user.id}`, { method: 'PUT', body: {
  name: 'Delayed Promotion', email: 'delayed@example.org', associated_centers: [c1.id], revoke_sessions: false,
} })).status, 200);
assert.equal((await admin(`/v1/admin/users/${delayed.user.id}`, { method: 'PUT', body: {
  name: 'Delayed Promotion', email: 'delayed@example.org', associated_centers: [c1.id], editor_for: [c1.id], revoke_sessions: false,
} })).status, 200);
assert.equal((await call('/v1/admin/users', { method: 'GET', bearer: delayed.token })).status, 401);
assert.equal((await call('/v1/session', { method: 'GET', bearer: delayed.token })).status, 401);
const iat = Math.floor(Date.now() / 1000);
const legacyParts = [
  Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url'),
  Buffer.from(JSON.stringify({ sub: noEmailUser.id, client: 'web', iat, exp: iat + 3600 })).toString('base64url'),
];
const legacyToken = `${legacyParts.join('.')}.${createHmac('sha256', env.SESSION_SECRET).update(legacyParts.join('.')).digest('base64url')}`;
assert.equal((await call('/v1/session', { method: 'GET', bearer: legacyToken })).status, 200);
assert.equal((await admin(`/v1/admin/users/${noEmailUser.id}`, { method: 'PUT', body: {
  name: 'No Email', associated_centers: [c1.id], revoke_sessions: true,
} })).status, 200);
assert.equal((await call('/v1/session', { method: 'GET', bearer: legacyToken })).status, 401);
const emailSessionUser = (await (await admin('/v1/admin/users', { body: {
  name: 'Email Session', email: 'email-session@example.org', associated_centers: [c1.id],
} })).json()).user;
const emailSession = await signIn(emailSessionUser.email);
assert.equal((await admin(`/v1/admin/users/${emailSessionUser.id}`, { method: 'PUT', body: {
  name: 'Email Session', email: 'email-new@example.org', associated_centers: [c1.id], revoke_sessions: false,
} })).status, 200);
assert.equal((await call('/v1/session', { method: 'GET', bearer: emailSession.token })).status, 200);
assert.equal((await admin(`/v1/admin/users/${emailSessionUser.id}`, { method: 'PUT', body: {
  name: 'Email Session', email: 'email-newer@example.org', associated_centers: [c1.id], revoke_sessions: true,
} })).status, 200);
assert.equal((await call('/v1/session', { method: 'GET', bearer: emailSession.token })).status, 401);
assert.equal((await call('/v1/register-name', { body: { name: 'Pair & Person', associated_centers: [c1.id] } })).status, 400);
assert.equal((await call('/v1/register-name', { body: { name: 'Role', associated_centers: [c1.id], editor_for: [c1.id] } })).status, 400);
assert.equal((await admin('/v1/admin/users', { body: { name: 'Pair & Person', associated_centers: [c1.id], email: 'pair@example.org' } })).status, 400);
assert.equal((await admin('/v1/admin/users', { body: { name: 'Pair & Person', associated_centers: [c1.id] } })).status, 201);

// Name conflicts are case-folded and enforced for every write, including OTP and imports.
const folded = await call('/v1/register-name', { body: { name: 'Straße', associated_centers: [c1.id] } });
assert.equal(folded.status, 201);
assert.equal((await call('/v1/register-name', { body: { name: 'STRASSE', associated_centers: [c1.id] } })).status, 409);
assert.equal((await admin('/v1/admin/users', { body: { name: 'STRASSE', email: 'folded@example.org', associated_centers: [c1.id] } })).status, 409);
assert.equal((await admin('/v1/admin/users', { body: { name: 'STRASSE', email: 'folded@example.org', associated_centers: [c2.id] } })).status, 201);
assert.equal((await admin('/v1/admin/users', { body: { name: 'Same Name', email: 'same1@example.org', associated_centers: [c1.id] } })).status, 201);
assert.equal((await admin('/v1/admin/users', { body: { name: 'same name', email: 'same2@example.org', associated_centers: [c1.id] } })).status, 201);
assert.equal((await admin('/v1/admin/users', { body: { name: 'SAME NAME', associated_centers: [c1.id] } })).status, 409);
assert.equal((await admin(`/v1/admin/users/${scoped.id}`, { method: 'PUT', body: {
  name: 'Scoped Updated', email: 'same1@example.org', associated_centers: [c1.id],
} })).status, 409);
assert.equal((await admin('/v1/admin/users/import', { body: { users: [
  { name: 'Import Atomic', email: 'import-atomic@example.org', associated_centers: [c1.id] },
  { name: 'STRASSE', email: 'import-folded@example.org', associated_centers: [c1.id] },
] } })).status, 409);
assert.equal(db.prepare("SELECT COUNT(*) AS n FROM users WHERE email = 'import-atomic@example.org'").get().n, 0);
expire();
assert.equal((await call('/v1/register', { body: { name: 'STRASSE', email: 'otp-folded@example.org', associated_centers: [c1.id] } })).status, 200);
assert.equal((await call('/v1/verify-otp', { body: { email: 'otp-folded@example.org', otp_code: lastCode() } })).status, 409);
const temporaryCenter = (await (await admin('/v1/centers', { body: { name: 'Temporary OTP Center' } })).json()).center;
expire();
assert.equal((await call('/v1/register', { body: {
  name: 'OTP Center Race', email: 'otp-center-race@example.org', associated_centers: [temporaryCenter.id],
} })).status, 200);
const temporaryCode = lastCode();
assert.equal((await admin(`/v1/centers/${temporaryCenter.id}`, { method: 'DELETE' })).status, 200);
assert.equal((await call('/v1/verify-otp', { body: { email: 'otp-center-race@example.org', otp_code: temporaryCode } })).status, 409);
assert.equal(db.prepare("SELECT COUNT(*) AS n FROM users WHERE email = 'otp-center-race@example.org'").get().n, 0);
const simultaneous = await Promise.all(['One', 'Two'].map((suffix) => admin('/v1/admin/users', { body: {
  name: 'Concurrent', associated_centers: [c1.id], ...(suffix === 'Two' ? { email: 'concurrent@example.org' } : {}),
} })));
assert.deepEqual(simultaneous.map((response) => response.status).sort(), [201, 409]);

// Revocation between authentication and a write is checked inside the write.
const raceAdmin = (await (await admin('/v1/admin/users', { body: {
  name: 'Race Admin', email: 'race-admin@example.org', is_admin: true, associated_centers: [c1.id],
} })).json()).user;
const raceSession = await signIn(raceAdmin.email);
beforeStatement = (sql) => {
  if (sql === 'BEGIN') {
    beforeStatement = null;
    db.prepare('UPDATE users SET is_admin = 0 WHERE id = ?').run(raceAdmin.id);
  }
};
assert.equal((await call('/v1/centers', { bearer: raceSession.token, body: { name: 'Race denied' } })).status, 403);
assert.equal(db.prepare("SELECT COUNT(*) AS n FROM centers WHERE name = 'Race denied'").get().n, 0);
beforeStatement = (sql) => {
  if (/INSERT INTO users/.test(sql)) {
    beforeStatement = null;
    db.prepare("UPDATE users SET editor_for = '[]' WHERE id = ?").run(manager.id);
  }
};
assert.equal((await call('/v1/admin/users', { bearer: editorSession.token, body: {
  name: 'Revoked Editor Creation', associated_centers: [c1.id],
} })).status, 403);
assert.equal(db.prepare("SELECT COUNT(*) AS n FROM users WHERE name = 'Revoked Editor Creation'").get().n, 0);

// Browsers: only allow-listed origins reach the API
assert.equal((await call('/v1/centers', { method: 'GET', headers: { origin: 'https://app.example.org' } })).status, 200);
assert.equal((await call('/v1/centers', { method: 'GET', headers: { origin: 'https://auth.test' } })).status, 403);

console.log('smoke ok');
