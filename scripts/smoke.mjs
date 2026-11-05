import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outdir = path.join(root, '.wrangler', 'smoke-build');
execFileSync('npx', ['wrangler', 'deploy', '--dry-run', '--outdir', outdir], { cwd: root, stdio: 'pipe' });
const worker = (await import(`${pathToFileURL(path.join(outdir, 'index.js')).href}?t=${Date.now()}`)).default;

const db = { accounts: [], memberships: [], otp_codes: [], otp_request_log: [] };
class Statement {
  constructor(sql, args = []) { this.sql = sql.replace(/\s+/g, ' ').trim(); this.args = args; }
  bind(...args) { return new Statement(this.sql, args); }
  async first() {
    const { sql, args } = this;
    if (sql.includes('FROM accounts a JOIN memberships m')) {
      const [id, app] = args;
      const m = db.memberships.find((row) => row.account_id === id && row.app === app);
      const a = db.accounts.find((row) => row.id === id);
      return m && a ? { id: a.id, email: a.email, name: a.name, role: m.role, data: m.data } : null;
    }
    if (sql.startsWith('SELECT id FROM accounts WHERE email = ?')) return db.accounts.find((row) => row.email === args[0]) ?? null;
    if (sql.startsWith('SELECT id, email, name FROM accounts WHERE email = ?')) return db.accounts.find((row) => row.email === args[0]) ?? null;
    if (sql.startsWith('SELECT account_id FROM memberships WHERE account_id = ? AND app = ?')) return db.memberships.find((row) => row.account_id === args[0] && row.app === args[1]) ?? null;
    if (sql.startsWith('SELECT id, code_hash, attempts FROM otp_codes')) {
      return db.otp_codes.filter((row) => row.email === args[0] && row.app === args[1] && row.expires_at > args[2]).sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ?? null;
    }
    if (sql.startsWith('SELECT id FROM accounts WHERE email = ?')) return db.accounts.find((row) => row.email === args[0]) ?? null;
    throw new Error(`Unsupported first query: ${sql}`);
  }
  async all() {
    const { sql, args } = this;
    if (sql.startsWith('SELECT created_at FROM otp_request_log')) {
      return { results: db.otp_request_log.filter((row) => row.email === args[0] && row.app === args[1] && row.created_at >= args[2]).map(({ created_at }) => ({ created_at })) };
    }
    if (sql.startsWith('SELECT a.id, a.email, a.name, m.role, m.data, m.created_at')) {
      const app = args[0];
      return { results: db.memberships.filter((m) => m.app === app).map((m) => ({ ...db.accounts.find((a) => a.id === m.account_id), role: m.role, data: m.data, created_at: m.created_at })) };
    }
    throw new Error(`Unsupported all query: ${sql}`);
  }
  async run() {
    const { sql, args } = this;
    if (sql.startsWith('DELETE FROM otp_codes WHERE email = ? AND app = ?')) {
      db.otp_codes = db.otp_codes.filter((r) => r.email !== args[0] || r.app !== args[1]);
    } else if (sql.startsWith('DELETE FROM otp_codes WHERE id = ?')) {
      db.otp_codes = db.otp_codes.filter((r) => r.id !== args[0]);
    } else if (sql.startsWith('UPDATE otp_codes SET attempts = ? WHERE id = ?')) {
      const row = db.otp_codes.find((r) => r.id === args[1]);
      if (row) row.attempts = args[0];
    } else if (sql.startsWith('INSERT INTO otp_codes')) {
      const [id, email, app, code_hash, expires_at, created_at] = args;
      db.otp_codes.push({ id, email, app, code_hash, expires_at, attempts: 0, created_at });
    } else if (sql.startsWith('DELETE FROM otp_request_log WHERE created_at < ?')) {
      db.otp_request_log = db.otp_request_log.filter((row) => row.created_at >= args[0]);
    } else if (sql.startsWith('INSERT INTO otp_request_log')) {
      const [id, email, app, created_at, , , minuteCutoff, , , hourCutoff] = args;
      const requests = db.otp_request_log.filter((row) => row.email === email && row.app === app);
      const blockedByMinute = requests.some((row) => row.created_at > minuteCutoff);
      const count = requests.filter((row) => row.created_at >= hourCutoff).length;
      if (!blockedByMinute && count < 5) {
        db.otp_request_log.push({ id, email, app, created_at });
        return { success: true, results: [], meta: { changes: 1 } };
      }
      return { success: true, results: [], meta: { changes: 0 } };
    } else if (sql.startsWith('INSERT INTO accounts')) {
      const [id, email, name, created_at, updated_at] = args;
      const account = db.accounts.find((r) => r.email === email);
      if (account) {
        if (sql.includes('SET name = excluded.name')) account.name = name;
        account.updated_at = updated_at;
      } else db.accounts.push({ id, email, name, created_at, updated_at });
    } else if (sql.startsWith('INSERT INTO memberships')) {
      let [account_id, app, role, data, created_at] = args;
      if (sql.includes('SELECT id FROM accounts WHERE email = ?')) {
        const email = account_id;
        account_id = db.accounts.find((r) => r.email === email)?.id;
      }
      const existing = db.memberships.find((r) => r.account_id === account_id && r.app === app);
      if (existing) {
        if (sql.includes('DO UPDATE SET role')) { existing.role = role; existing.data = data; }
      } else if (account_id) db.memberships.push({ account_id, app, role, data, created_at });
    } else if (sql.startsWith('DELETE FROM memberships')) {
      const [app, email] = args;
      const id = db.accounts.find((r) => r.email === email)?.id;
      db.memberships = db.memberships.filter((r) => r.app !== app || r.account_id !== id);
    } else throw new Error(`Unsupported run query: ${sql}`);
    return { success: true, results: [], meta: { changes: 1 } };
  }
}
const database = {
  prepare(sql) { return new Statement(sql); },
  async batch(statements) { const result = []; for (const statement of statements) result.push(await statement.run()); return result; },
};

const sent = [];
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(typeof input === 'string' ? input : input.url);
  assert.equal(url.hostname, 'api.brevo.com', `unexpected fetch: ${url}`);
  sent.push(JSON.parse(init.body));
  return new Response('{"messageId":"smoke"}', { status: 201, headers: { 'content-type': 'application/json' } });
};
const realLog = console.log;
console.log = () => {};
console.error = () => {};
const env = { DB: database, SESSION_SECRET: 'smoke-session-secret', ADMIN_API_KEY: 'smoke-admin-key', BREVO_API_KEY: 'stub-key' };
const call = async (currentEnv, method, route, body, headers = {}) => {
  const response = await worker.fetch(new Request(`https://auth.test${route}`, {
    method, headers: { 'content-type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  }), currentEnv, {});
  const text = await response.text();
  return { status: response.status, headers: response.headers, body: text ? JSON.parse(text) : null };
};
const codeFromLatest = () => {
  const match = /code is (\d{6})/.exec(sent.at(-1)?.textContent ?? '');
  assert.ok(match, 'Brevo request should contain OTP');
  return match[1];
};
const results = [];
async function test(name, fn) { await fn(); results.push(name); realLog(`ok - ${name}`); }

await test('CORS preflight with exact allowlist', async () => {
  const r = await call({ ...env, ALLOWED_ORIGINS: 'https://app.example.org' }, 'OPTIONS', '/v1/otp/request', undefined, { Origin: 'https://app.example.org' });
  assert.equal(r.status, 204);
  assert.equal(r.headers.get('access-control-allow-origin'), 'https://app.example.org');
  assert.match(r.headers.get('access-control-allow-headers'), /Authorization/);
});
await test('open-app signup verifies and persists only OTP digest', async () => {
  const before = sent.length;
  const requested = await call(env, 'POST', '/v1/otp/request', { app: 'mantrajapam', email: ' New@Example.org ', name: 'New User', purpose: 'signup' });
  assert.equal(requested.status, 200);
  assert.equal(requested.body.ok, true);
  const code = codeFromLatest();
  assert.equal(sent.length, before + 1);
  assert.equal(db.otp_codes[0].email, 'new@example.org');
  assert.notEqual(db.otp_codes[0].code_hash, code);
  assert.equal(db.otp_codes[0].code_hash.length, 64);
  const missingName = await call(env, 'POST', '/v1/otp/verify', { app: 'mantrajapam', email: 'NEW@example.org', code });
  assert.equal(missingName.status, 400);
  assert.equal(db.otp_codes.length, 1, 'correct OTP remains available when signup name is missing');
  const verified = await call(env, 'POST', '/v1/otp/verify', { app: 'mantrajapam', email: 'NEW@example.org', code, name: 'New User' });
  assert.equal(verified.status, 200);
  assert.equal(verified.body.user.email, 'new@example.org');
  assert.deepEqual(verified.body.user.data, {});
  assert.equal(db.otp_codes.length, 0);
  assert.equal((await call(env, 'GET', '/v1/session', undefined, { Authorization: `Bearer ${verified.body.token}` })).status, 200);
});
await test('closed-app unregistered request is generic and sends no email', async () => {
  const count = sent.length;
  const result = await call(env, 'POST', '/v1/otp/request', { app: 'bhajanstudio', email: 'unknown@example.org', purpose: 'signin' });
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, { ok: true, message: 'If this address is eligible, a sign-in code will be sent.' });
  assert.equal(sent.length, count);
  const openSignin = await call(env, 'POST', '/v1/otp/request', { app: 'mantrajapam', email: 'nobody@example.org', purpose: 'signin' });
  assert.equal(openSignin.status, 200);
  assert.deepEqual(openSignin.body, result.body);
  assert.equal(sent.length, count);
  assert.equal((await call(env, 'POST', '/v1/otp/request', { app: 'bhajanstudio', email: 'unknown@example.org', purpose: 'signin' })).status, 429);
  assert.equal(sent.length, count);
  assert.equal((await call(env, 'POST', '/v1/otp/verify', { app: 'bhajanstudio', email: 'unknown@example.org', code: '123456' })).status, 400);
});
await test('admin import requires key and imported member can sign in', async () => {
  const payload = { app: 'bhajanstudio', members: [{ email: ' Devotee@Example.org ', name: 'Devotee', role: 'editor', data: { is_admin: false, center_ids: [12], editor_for: [12] } }] };
  assert.equal((await call(env, 'POST', '/v1/admin/members/import', payload)).status, 401);
  const imported = await call(env, 'POST', '/v1/admin/members/import', payload, { Authorization: `Bearer ${env.ADMIN_API_KEY}` });
  assert.equal(imported.status, 200);
  const requested = await call(env, 'POST', '/v1/otp/request', { app: 'bhajanstudio', email: 'devotee@example.org', purpose: 'signin' });
  assert.equal(requested.status, 200);
  const result = await call(env, 'POST', '/v1/otp/verify', { app: 'bhajanstudio', email: 'devotee@example.org', code: codeFromLatest() });
  assert.equal(result.status, 200);
  assert.equal(result.body.user.role, 'editor');
  assert.deepEqual(result.body.user.data.center_ids, [12]);
});
await test('fifth wrong code locks and deletes active OTP', async () => {
  await call(env, 'POST', '/v1/admin/members/import', { app: 'bhajanstudio', members: [{ email: 'lock@example.org', name: 'Lock User' }] }, { Authorization: `Bearer ${env.ADMIN_API_KEY}` });
  await call(env, 'POST', '/v1/otp/request', { app: 'bhajanstudio', email: 'lock@example.org', purpose: 'signin' });
  const statuses = [];
  for (let i = 0; i < 5; i++) statuses.push((await call(env, 'POST', '/v1/otp/verify', { app: 'bhajanstudio', email: 'lock@example.org', code: '000000' })).status);
  assert.deepEqual(statuses, [400, 400, 400, 400, 429]);
  assert.equal(db.otp_codes.some((row) => row.email === 'lock@example.org'), false);
});
await test('correct code is accepted after four failed attempts', async () => {
  await call(env, 'POST', '/v1/admin/members/import', { app: 'bhajanstudio', members: [{ email: 'lasttry@example.org', name: 'Last Try' }] }, { Authorization: `Bearer ${env.ADMIN_API_KEY}` });
  await call(env, 'POST', '/v1/otp/request', { app: 'bhajanstudio', email: 'lasttry@example.org', purpose: 'signin' });
  const code = codeFromLatest();
  for (let i = 0; i < 4; i++) assert.equal((await call(env, 'POST', '/v1/otp/verify', { app: 'bhajanstudio', email: 'lasttry@example.org', code: '000000' })).status, 400);
  assert.equal((await call(env, 'POST', '/v1/otp/verify', { app: 'bhajanstudio', email: 'lasttry@example.org', code })).status, 200);
});
await test('request throttles at 60 seconds and five per hour', async () => {
  await call(env, 'POST', '/v1/admin/members/import', { app: 'bhajanstudio', members: [{ email: 'limit@example.org', name: 'Limit User' }] }, { Authorization: `Bearer ${env.ADMIN_API_KEY}` });
  const body = { app: 'bhajanstudio', email: 'limit@example.org', purpose: 'signin' };
  assert.equal((await call(env, 'POST', '/v1/otp/request', body)).status, 200);
  assert.equal((await call(env, 'POST', '/v1/otp/request', body)).status, 429);
  const now = Date.now();
  db.otp_request_log = db.otp_request_log.filter((row) => row.email !== body.email);
  for (let i = 0; i < 5; i++) db.otp_request_log.push({ id: `seed-${i}`, email: body.email, app: body.app, created_at: new Date(now - 120_000 - i * 1000).toISOString() });
  assert.equal((await call(env, 'POST', '/v1/otp/request', body)).status, 429);
});
await test('tampered and expired bearer tokens are rejected', async () => {
  const signedIn = await call({ ...env, REVIEW_LOGIN_MANTRAJAPAM_EMAIL: 'review@example.org', REVIEW_LOGIN_MANTRAJAPAM_PASSWORD: 'review-pass' }, 'POST', '/v1/review_login', { app: 'mantrajapam', email: 'review@example.org', password: 'review-pass' });
  const token = signedIn.body.token;
  const [head, body] = token.split('.');
  const tampered = `${head}.${Buffer.from(JSON.stringify({ sub: 'forged', app: 'mantrajapam', iat: 1, exp: 9999999999 })).toString('base64url')}.invalid`;
  assert.equal((await call(env, 'GET', '/v1/session', undefined, { Authorization: `Bearer ${tampered}` })).status, 401);
  const expiredClaims = { sub: signedIn.body.user.id, app: 'mantrajapam', iat: 1, exp: 2 };
  const expiredBody = Buffer.from(JSON.stringify(expiredClaims)).toString('base64url');
  const input = `${head}.${expiredBody}`;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.SESSION_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = Buffer.from(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(input))).toString('base64url');
  assert.equal((await call(env, 'GET', '/v1/session', undefined, { Authorization: `Bearer ${input}.${sig}` })).status, 401);
});
await test('review login configuration on/off and credential flow', async () => {
  assert.deepEqual((await call(env, 'GET', '/v1/review_login/config?app=bhajanstudio')).body, { enabled: false });
  assert.equal((await call(env, 'POST', '/v1/review_login', { app: 'bhajanstudio', email: 'a@b.org', password: 'x' })).status, 404);
  const configured = { ...env, REVIEW_LOGIN_BHAJANSTUDIO_EMAIL: 'review-bhajan@example.org', REVIEW_LOGIN_BHAJANSTUDIO_PASSWORD: 'review-pass' };
  assert.deepEqual((await call(configured, 'GET', '/v1/review_login/config?app=bhajanstudio')).body, { enabled: true });
  const result = await call(configured, 'POST', '/v1/review_login', { app: 'bhajanstudio', email: 'review-bhajan@example.org', password: 'review-pass' });
  assert.equal(result.status, 200);
  assert.equal(result.body.user.app, 'bhajanstudio');
});
await test('unknown app is rejected', async () => {
  assert.equal((await call(env, 'POST', '/v1/otp/request', { app: 'other', email: 'a@example.org', purpose: 'signin' })).status, 400);
});

console.log = realLog;
realLog(`\n${results.length} smoke tests passed.`);
