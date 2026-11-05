import { APPS, isAppName, reviewEnvNames, type AppName } from './apps';

interface D1Result<T = unknown> { results?: T[]; success?: boolean; meta?: { changes?: number } }
interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(colName?: string): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  run<T = unknown>(): Promise<D1Result<T>>;
}
interface D1Database { prepare(query: string): D1PreparedStatement; batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]> }
interface Env {
  DB: D1Database; SESSION_SECRET?: string; ADMIN_API_KEY?: string; BREVO_API_KEY?: string;
  BREVO_SENDER_EMAIL?: string; BREVO_SENDER_NAME?: string; ALLOWED_ORIGINS?: string;
  [key: string]: unknown;
}
interface Account { id: string; email: string; name: string }
interface Claims { sub: string; app: AppName; exp: number; iat: number }

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const OTP_TTL_MS = 10 * 60_000;
const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;
const GENERIC_OTP = { ok: true, message: 'If this address is eligible, a sign-in code will be sent.' };

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
}
function normalizeEmail(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const email = value.trim().toLowerCase();
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}
function nowIso(): string { return new Date().toISOString(); }
function b64url(bytes: Uint8Array): string {
  let value = '';
  for (const byte of bytes) value += String.fromCharCode(byte);
  return btoa(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
function unb64url(value: string): Uint8Array<ArrayBuffer> {
  if (!/^[\w-]+$/.test(value)) throw new Error('Invalid base64url');
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
async function sha256(value: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value)));
  return [...digest].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
async function safeEqual(a: string, b: string): Promise<boolean> {
  const [left, right] = await Promise.all([sha256(a), sha256(b)]);
  let diff = 0;
  for (let i = 0; i < left.length; i++) diff |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return diff === 0;
}
function randomOtp(): string {
  const limit = Math.floor(0x1_0000_0000 / 900_000) * 900_000;
  const value = new Uint32Array(1);
  do crypto.getRandomValues(value); while (value[0] >= limit);
  return String(100_000 + value[0] % 900_000);
}
async function issueToken(env: Env, accountId: string, app: AppName): Promise<string> {
  if (!env.SESSION_SECRET) throw new Error('Missing session configuration');
  const iat = Math.floor(Date.now() / 1000);
  const head = b64url(encoder.encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const body = b64url(encoder.encode(JSON.stringify({ sub: accountId, app, iat, exp: iat + SESSION_TTL_SECONDS })));
  const input = `${head}.${body}`;
  const key = await crypto.subtle.importKey('raw', encoder.encode(env.SESSION_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return `${input}.${b64url(new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(input))))}`;
}
async function verifyToken(env: Env, token: string): Promise<Claims | null> {
  if (!env.SESSION_SECRET) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const [head, body, signature] = parts;
    const header = JSON.parse(decoder.decode(unb64url(head))) as { alg?: string; typ?: string };
    if (header.alg !== 'HS256' || header.typ !== 'JWT') return null;
    const key = await crypto.subtle.importKey('raw', encoder.encode(env.SESSION_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
    if (!(await crypto.subtle.verify('HMAC', key, unb64url(signature), encoder.encode(`${head}.${body}`)))) return null;
    const claims = JSON.parse(decoder.decode(unb64url(body))) as Partial<Claims>;
    const now = Math.floor(Date.now() / 1000);
    if (typeof claims.sub !== 'string' || typeof claims.exp !== 'number' || typeof claims.iat !== 'number' || !isAppName(claims.app)) return null;
    if (claims.exp <= now || claims.iat > now + 60) return null;
    return claims as Claims;
  } catch { return null; }
}
function parseData(value: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch { return {}; }
}
async function userFor(env: Env, accountId: string, app: AppName): Promise<Record<string, unknown> | null> {
  const row = await env.DB.prepare(`SELECT a.id, a.email, a.name, m.role, m.data
    FROM accounts a JOIN memberships m ON m.account_id = a.id
    WHERE a.id = ? AND m.app = ?`).bind(accountId, app).first<{
      id: string; email: string; name: string; role: string; data: string;
    }>();
  if (!row) return null;
  return { id: row.id, email: row.email, name: row.name, app, role: row.role, data: parseData(row.data) };
}
async function emailOtp(env: Env, email: string, app: AppName, code: string): Promise<boolean> {
  if (!env.BREVO_API_KEY) {
    console.log(`[sssapi dev] OTP for ${email} (${app}): ${code}`);
    return true;
  }
  const brand = APPS[app].displayName;
  try {
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { accept: 'application/json', 'api-key': env.BREVO_API_KEY, 'content-type': 'application/json' },
      body: JSON.stringify({
        sender: { name: env.BREVO_SENDER_NAME || brand, email: env.BREVO_SENDER_EMAIL || 'noreply@example.org' },
        to: [{ email }], subject: `${brand} sign-in code`,
        textContent: `Your ${brand} sign-in code is ${code}. It expires in 10 minutes. Do not share this code.`,
        htmlContent: `<p>Your ${brand} sign-in code is:</p><p style="font-size:28px;font-weight:bold;letter-spacing:6px">${code}</p><p>It expires in 10 minutes. Do not share this code.</p>`,
      }),
    });
    if (!response.ok) console.error('Brevo email request failed with status', response.status);
    return response.ok;
  } catch {
    console.error('Brevo email request failed');
    return false;
  }
}
async function requestOtp(request: Request, env: Env): Promise<Response> {
  if (!env.SESSION_SECRET) return json(500, { error: 'Authentication unavailable' });
  const payload = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!payload || !isAppName(payload.app)) return json(400, { error: 'Invalid app' });
  const app = payload.app;
  const email = normalizeEmail(payload.email);
  if (!email) return json(400, { error: 'Invalid email address' });
  if (payload.purpose !== 'signin' && payload.purpose !== 'signup') return json(400, { error: 'Invalid purpose' });
  const purpose = payload.purpose;
  const name = typeof payload.name === 'string' ? payload.name.trim() : '';
  const policy = APPS[app];
  if (purpose === 'signup' && (!policy.selfSignup || (policy.requireName && !name))) return json(400, { error: 'Signup is unavailable or required details are missing' });
  const account = await env.DB.prepare('SELECT id FROM accounts WHERE email = ?').bind(email).first<{ id: string }>();
  const membership = account && await env.DB.prepare('SELECT account_id FROM memberships WHERE account_id = ? AND app = ?').bind(account.id, app).first();
  const eligible = purpose === 'signin' ? Boolean(membership) : policy.selfSignup && !membership;

  const now = Date.now();
  const createdAt = nowIso();
  const throttle = await env.DB.prepare(`INSERT INTO otp_request_log (id, email, app, created_at)
    SELECT ?, ?, ?, ?
    WHERE NOT EXISTS (SELECT 1 FROM otp_request_log WHERE email = ? AND app = ? AND created_at > ?)
      AND (SELECT COUNT(*) FROM otp_request_log WHERE email = ? AND app = ? AND created_at >= ?) < 5`)
    .bind(crypto.randomUUID(), email, app, createdAt, email, app, new Date(now - 60_000).toISOString(), email, app, new Date(now - 60 * 60_000).toISOString()).run();
  if (throttle.meta?.changes !== 1) return json(429, { error: 'Too many code requests. Try again later.' });
  if (!eligible) {
    await env.DB.prepare('DELETE FROM otp_request_log WHERE created_at < ?').bind(new Date(now - 60 * 60_000).toISOString()).run();
    return json(200, GENERIC_OTP);
  }
  const code = randomOtp();
  await env.DB.batch([
    env.DB.prepare('DELETE FROM otp_codes WHERE email = ? AND app = ?').bind(email, app),
    env.DB.prepare(`INSERT INTO otp_codes (id, email, app, code_hash, expires_at, attempts, created_at)
      VALUES (?, ?, ?, ?, ?, 0, ?)`).bind(crypto.randomUUID(), email, app, await sha256(`${email}:${app}:${code}`), new Date(now + OTP_TTL_MS).toISOString(), createdAt),
    env.DB.prepare('DELETE FROM otp_request_log WHERE created_at < ?').bind(new Date(now - 60 * 60_000).toISOString()),
  ]);
  if (!(await emailOtp(env, email, app, code))) return json(503, { error: 'Unable to send sign-in code' });
  return json(200, GENERIC_OTP);
}
async function verifyOtp(request: Request, env: Env): Promise<Response> {
  if (!env.SESSION_SECRET) return json(500, { error: 'Authentication unavailable' });
  const payload = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!payload || !isAppName(payload.app)) return json(400, { error: 'Invalid app' });
  const app = payload.app;
  const email = normalizeEmail(payload.email);
  const code = typeof payload.code === 'string' || typeof payload.code === 'number' ? String(payload.code).trim() : '';
  if (!email || !/^\d{6}$/.test(code)) return json(400, { error: 'Invalid or expired code' });
  const row = await env.DB.prepare(`SELECT id, code_hash, attempts FROM otp_codes WHERE email = ? AND app = ? AND expires_at > ? ORDER BY created_at DESC LIMIT 1`)
    .bind(email, app, nowIso()).first<{ id: string; code_hash: string; attempts: number }>();
  if (!row) return json(400, { error: 'Invalid or expired code' });
  if (row.attempts >= 5) {
    await env.DB.prepare('DELETE FROM otp_codes WHERE id = ?').bind(row.id).run();
    return json(429, { error: 'Too many failed attempts. Request a new code.' });
  }
  const valid = await safeEqual(await sha256(`${email}:${app}:${code}`), row.code_hash);
  if (!valid) {
    const next = row.attempts + 1;
    if (next >= 5) {
      await env.DB.prepare('DELETE FROM otp_codes WHERE id = ?').bind(row.id).run();
      return json(429, { error: 'Too many failed attempts. Request a new code.' });
    }
    await env.DB.prepare('UPDATE otp_codes SET attempts = ? WHERE id = ?').bind(next, row.id).run();
    return json(400, { error: 'Invalid or expired code' });
  }
  let account = await env.DB.prepare('SELECT id, email, name FROM accounts WHERE email = ?').bind(email).first<Account>();
  let createMembership = false;
  let signupName = '';
  if (app === 'bhajanstudio') {
    const member = account && await env.DB.prepare('SELECT account_id FROM memberships WHERE account_id = ? AND app = ?').bind(account.id, app).first();
    if (!member) {
      await env.DB.prepare('DELETE FROM otp_codes WHERE id = ?').bind(row.id).run();
      return json(400, { error: 'Invalid or expired code' });
    }
  } else {
    const membership = account && await env.DB.prepare('SELECT account_id FROM memberships WHERE account_id = ? AND app = ?').bind(account.id, app).first();
    if (!membership) {
      signupName = typeof payload.name === 'string' ? payload.name.trim() : '';
      if (!signupName) return json(400, { error: 'Name required' });
      createMembership = true;
    }
  }
  if (!account && !createMembership) return json(400, { error: 'Invalid or expired code' });
  if (createMembership) {
    const id = account?.id ?? crypto.randomUUID();
    const at = nowIso();
    await env.DB.batch([
      env.DB.prepare('DELETE FROM otp_codes WHERE id = ?').bind(row.id),
      env.DB.prepare(`INSERT INTO accounts (id, email, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(email) DO UPDATE SET name = excluded.name, updated_at = excluded.updated_at`).bind(id, email, signupName, at, at),
      env.DB.prepare(`INSERT INTO memberships (account_id, app, role, data, created_at) VALUES (?, ?, 'viewer', '{}', ?)
        ON CONFLICT(account_id, app) DO NOTHING`).bind(id, app, at),
    ]);
    account = await env.DB.prepare('SELECT id, email, name FROM accounts WHERE email = ?').bind(email).first<Account>();
  } else {
    await env.DB.prepare('DELETE FROM otp_codes WHERE id = ?').bind(row.id).run();
  }
  if (!account) return json(500, { error: 'Authentication unavailable' });
  const user = await userFor(env, account.id, app);
  if (!user) return json(400, { error: 'Invalid or expired code' });
  return json(200, { user, token: await issueToken(env, account.id, app) });
}
function bearer(request: Request): string | null {
  return /^Bearer\s+(.+)$/i.exec(request.headers.get('authorization') ?? '')?.[1] ?? null;
}
async function session(request: Request, env: Env): Promise<Response> {
  const token = bearer(request);
  if (!token) return json(401, { error: 'Unauthorized' });
  const claims = await verifyToken(env, token);
  if (!claims) return json(401, { error: 'Unauthorized' });
  const user = await userFor(env, claims.sub, claims.app);
  return user ? json(200, { user }) : json(401, { error: 'Unauthorized' });
}
function reviewCredentials(env: Env, app: AppName): { email: string; password: string } | null {
  const names = reviewEnvNames(app);
  const email = env[names.email];
  const password = env[names.password];
  return typeof email === 'string' && email.trim() && typeof password === 'string' && password
    ? { email: email.trim().toLowerCase(), password } : null;
}
async function reviewConfig(request: Request, env: Env): Promise<Response> {
  const app = new URL(request.url).searchParams.get('app');
  if (!isAppName(app)) return json(400, { error: 'Invalid app' });
  return json(200, { enabled: Boolean(reviewCredentials(env, app)) });
}
async function reviewLogin(request: Request, env: Env): Promise<Response> {
  if (!env.SESSION_SECRET) return json(500, { error: 'Authentication unavailable' });
  const payload = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!payload || !isAppName(payload.app)) return json(400, { error: 'Invalid app' });
  const credentials = reviewCredentials(env, payload.app);
  if (!credentials) return json(404, { error: 'Review sign-in unavailable' });
  const email = normalizeEmail(payload.email);
  const password = typeof payload.password === 'string' ? payload.password : '';
  if (!email || !(await safeEqual(email, credentials.email)) || !(await safeEqual(password, credentials.password))) return json(401, { error: 'Invalid credentials' });
  const at = nowIso();
  await env.DB.prepare(`INSERT INTO accounts (id, email, name, created_at, updated_at) VALUES (?, ?, 'App Review', ?, ?)
    ON CONFLICT(email) DO UPDATE SET updated_at = excluded.updated_at`).bind(crypto.randomUUID(), credentials.email, at, at).run();
  const account = await env.DB.prepare('SELECT id FROM accounts WHERE email = ?').bind(credentials.email).first<{ id: string }>();
  if (!account) return json(500, { error: 'Review sign-in failed' });
  await env.DB.prepare(`INSERT INTO memberships (account_id, app, role, data, created_at) VALUES (?, ?, 'viewer', '{}', ?)
    ON CONFLICT(account_id, app) DO NOTHING`).bind(account.id, payload.app, at).run();
  const user = await userFor(env, account.id, payload.app);
  if (!user) return json(500, { error: 'Review sign-in failed' });
  return json(200, { user, token: await issueToken(env, account.id, payload.app) });
}
async function adminAuthorized(request: Request, env: Env): Promise<boolean> {
  const token = bearer(request);
  return Boolean(token && env.ADMIN_API_KEY && await safeEqual(token, env.ADMIN_API_KEY));
}
async function adminImport(request: Request, env: Env): Promise<Response> {
  if (!(await adminAuthorized(request, env))) return json(401, { error: 'Unauthorized' });
  const payload = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!payload || !isAppName(payload.app) || !Array.isArray(payload.members) || payload.members.length > 1000) return json(400, { error: 'Invalid import request' });
  const statements: D1PreparedStatement[] = [];
  for (const item of payload.members) {
    if (!item || typeof item !== 'object') return json(400, { error: 'Invalid member' });
    const member = item as Record<string, unknown>;
    const email = normalizeEmail(member.email);
    const name = typeof member.name === 'string' ? member.name.trim() : '';
    const role = typeof member.role === 'string' && member.role.trim() ? member.role.trim() : 'viewer';
    const data = member.data === undefined ? {} : member.data;
    if (!email || !name || !data || typeof data !== 'object' || Array.isArray(data)) return json(400, { error: 'Invalid member' });
    const at = nowIso();
    statements.push(env.DB.prepare(`INSERT INTO accounts (id, email, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(email) DO UPDATE SET name = excluded.name, updated_at = excluded.updated_at`).bind(crypto.randomUUID(), email, name, at, at));
    statements.push(env.DB.prepare(`INSERT INTO memberships (account_id, app, role, data, created_at)
      VALUES ((SELECT id FROM accounts WHERE email = ?), ?, ?, ?, ?)
      ON CONFLICT(account_id, app) DO UPDATE SET role = excluded.role, data = excluded.data`).bind(email, payload.app, role, JSON.stringify(data), at));
  }
  if (statements.length) await env.DB.batch(statements);
  return json(200, { ok: true, imported: payload.members.length });
}
async function adminMembers(request: Request, env: Env): Promise<Response> {
  if (!(await adminAuthorized(request, env))) return json(401, { error: 'Unauthorized' });
  const app = new URL(request.url).searchParams.get('app');
  if (!isAppName(app)) return json(400, { error: 'Invalid app' });
  const result = await env.DB.prepare(`SELECT a.id, a.email, a.name, m.role, m.data, m.created_at
    FROM accounts a JOIN memberships m ON m.account_id = a.id WHERE m.app = ? ORDER BY a.email`).bind(app).all<{
      id: string; email: string; name: string; role: string; data: string; created_at: string;
    }>();
  return json(200, { members: (result.results ?? []).map((r) => ({ id: r.id, email: r.email, name: r.name, role: r.role, data: parseData(r.data), created_at: r.created_at })) });
}
async function adminDelete(request: Request, env: Env): Promise<Response> {
  if (!(await adminAuthorized(request, env))) return json(401, { error: 'Unauthorized' });
  const payload = await request.json().catch(() => null) as Record<string, unknown> | null;
  const email = normalizeEmail(payload?.email);
  if (!payload || !isAppName(payload.app) || !email) return json(400, { error: 'Invalid request' });
  await env.DB.prepare('DELETE FROM memberships WHERE app = ? AND account_id = (SELECT id FROM accounts WHERE email = ?)').bind(payload.app, email).run();
  return json(200, { ok: true });
}
function corsHeaders(request: Request, env: Env): Headers {
  const headers = new Headers({ vary: 'Origin', 'access-control-allow-methods': 'GET, POST, DELETE, OPTIONS', 'access-control-allow-headers': 'Authorization, Content-Type' });
  const origin = request.headers.get('origin');
  const allowed = (env.ALLOWED_ORIGINS ?? '').split(',').map((item) => item.trim()).filter(Boolean);
  if (origin && allowed.includes(origin)) headers.set('access-control-allow-origin', origin);
  return headers;
}
async function route(request: Request, env: Env): Promise<Response> {
  const path = new URL(request.url).pathname.replace(/\/+$/, '') || '/';
  if (request.method === 'OPTIONS') return new Response(null, { status: 204 });
  if (path === '/v1/otp/request' && request.method === 'POST') return requestOtp(request, env);
  if (path === '/v1/otp/verify' && request.method === 'POST') return verifyOtp(request, env);
  if (path === '/v1/session' && request.method === 'GET') return session(request, env);
  if (path === '/v1/logout' && request.method === 'POST') return json(200, { ok: true });
  if (path === '/v1/review_login/config' && request.method === 'GET') return reviewConfig(request, env);
  if (path === '/v1/review_login' && request.method === 'POST') return reviewLogin(request, env);
  if (path === '/v1/admin/members/import' && request.method === 'POST') return adminImport(request, env);
  if (path === '/v1/admin/members' && request.method === 'GET') return adminMembers(request, env);
  if (path === '/v1/admin/members' && request.method === 'DELETE') return adminDelete(request, env);
  return json(404, { error: 'Not found' });
}
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const cors = corsHeaders(request, env);
    let response: Response;
    try { response = await route(request, env); }
    catch (error) {
      console.error('Request failed', error instanceof Error ? error.message : 'unknown error');
      response = json(500, { error: 'Internal server error' });
    }
    const headers = new Headers(response.headers);
    cors.forEach((value, key) => headers.set(key, value));
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  },
};
