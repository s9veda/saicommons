import { query, transaction } from './turso';
import {
  HttpError, bearerClaims, equalHex, hmacHex, identifyClient, issueToken, json, normalizeEmail, readJson, sha256,
  type Ctx, type Env,
} from './common';
import { USER_SELECT, assertCentersExist, parseProfile, publicUser, type Profile, type UserRow } from './users';
import { adminCreate, adminDelete, adminDeleteById, adminImport, adminList, adminUpdate } from './admin';
import { createCenter, deleteCenter, getCenter, listCenters, updateCenter } from './centers';
import { parseCenterList } from './users';

const OTP_TTL_MS = 10 * 60_000;
const OTP_MAX_ATTEMPTS = 5;
const GENERIC_OTP = { ok: true, message: 'If the request is valid, a code has been sent to the email address.' };

function randomOtp(): string {
  const limit = Math.floor(0x1_0000_0000 / 900_000) * 900_000;
  const value = new Uint32Array(1);
  do crypto.getRandomValues(value); while (value[0] >= limit);
  return String(100_000 + value[0] % 900_000);
}
function allowedOrigins(env: Env): string[] {
  return (env.ALLOWED_ORIGINS ?? '').split(',').map((o) => o.trim()).filter(Boolean);
}

async function sendOtpEmail(env: Env, email: string, code: string): Promise<boolean> {
  if (!env.BREVO_API_KEY) {
    console.log(`[saicommons dev] OTP for ${email}: ${code}`);
    return true;
  }
  const brand = env.BREVO_SENDER_NAME || 'Sai Commons';
  try {
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { accept: 'application/json', 'api-key': env.BREVO_API_KEY, 'content-type': 'application/json' },
      body: JSON.stringify({
        sender: { name: brand, email: env.BREVO_SENDER_EMAIL || 'noreply@example.org' },
        to: [{ email }],
        subject: `${brand} verification code`,
        textContent: `Your verification code is ${code}. It expires in 10 minutes. Do not share this code.`,
        htmlContent: `<p>Your verification code is:</p><p style="font-size:28px;font-weight:bold;letter-spacing:6px">${code}</p><p>It expires in 10 minutes. Do not share this code.</p>`,
      }),
    });
    if (!response.ok) console.error('Brevo email request failed with status', response.status);
    return response.ok;
  } catch {
    console.error('Brevo email request failed');
    return false;
  }
}

/** Throttles per email (1/minute, 5/hour) and per client IP (20/hour) with a single atomic insert. */
async function reserveOtpSlot(env: Env, request: Request, email: string, client: string): Promise<void> {
  const now = Date.now();
  const iso = new Date(now).toISOString();
  const minuteCutoff = new Date(now - 60_000).toISOString();
  const hourCutoff = new Date(now - 3_600_000).toISOString();
  const ip = request.headers.get('cf-connecting-ip') ?? 'unknown';
  const ipHash = (await sha256(`${env.SESSION_SECRET}:${ip}`)).slice(0, 32);
  await query(env, 'DELETE FROM otp_request_log WHERE created_at < ?', [new Date(now - 86_400_000).toISOString()]);
  await query(env, 'DELETE FROM otp_codes WHERE expires_at < ?', [iso]);
  const result = await query(env, `INSERT INTO otp_request_log (id, email, ip_hash, client, created_at)
    SELECT ?, ?, ?, ?, ?
    WHERE (SELECT COUNT(*) FROM otp_request_log WHERE email = ? AND created_at > ?) = 0
      AND (SELECT COUNT(*) FROM otp_request_log WHERE email = ? AND created_at > ?) < 5
      AND (SELECT COUNT(*) FROM otp_request_log WHERE ip_hash = ? AND created_at > ?) < 20`,
  [crypto.randomUUID(), email, ipHash, client, iso, email, minuteCutoff, email, hourCutoff, ipHash, hourCutoff]);
  if (result.changes === 0) throw new HttpError(429, 'Too many requests. Try again later.', { 'retry-after': '60' });
}

async function issueOtp(env: Env, email: string, purpose: 'register' | 'login', profile: Profile | null): Promise<boolean> {
  const code = randomOtp();
  const now = Date.now();
  await query(env, `INSERT INTO otp_codes (email, code_hash, purpose, profile, attempts, expires_at, created_at)
    VALUES (?, ?, ?, ?, 0, ?, ?)
    ON CONFLICT(email) DO UPDATE SET code_hash = excluded.code_hash, purpose = excluded.purpose,
      profile = excluded.profile, attempts = 0, expires_at = excluded.expires_at, created_at = excluded.created_at`,
  [email, await hmacHex(env.SESSION_SECRET!, `${email}:${code}`), purpose, profile ? JSON.stringify(profile) : null,
    new Date(now + OTP_TTL_MS).toISOString(), new Date(now).toISOString()]);
  const sent = await sendOtpEmail(env, email, code);
  if (!sent) await query(env, 'DELETE FROM otp_codes WHERE email = ?', [email]);
  return sent;
}

async function register({ request, env, client }: Ctx): Promise<Response> {
  const payload = await readJson(request);
  const email = normalizeEmail(payload.email);
  if (!email) throw new HttpError(400, 'A valid email is required');
  const profile = parseProfile(payload);
  await assertCentersExist(env, profile.associated_centers);
  await reserveOtpSlot(env, request, email, client);
  // Existing accounts get the same response and an OTP, but their stored profile is never overwritten.
  if (!(await issueOtp(env, email, 'register', profile))) throw new HttpError(503, 'Unable to send the verification code');
  return json(200, GENERIC_OTP);
}

async function registerName({ request, env, client }: Ctx): Promise<Response> {
  const payload = await readJson(request);
  // Email is explicitly NOT required for this endpoint
  const profile = parseProfile(payload);
  // Allow empty associated_centers if not provided, but validate if provided
  if (profile.associated_centers.length > 0) {
    await assertCentersExist(env, profile.associated_centers);
  }
  const editorFor = parseCenterList(payload.editor_for, 'editor_for');
  if (editorFor.length > 0) {
    await assertCentersExist(env, editorFor);
  }
  const associated = [...new Set([...profile.associated_centers, ...editorFor])];
  
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await transaction(env, [
    {
      sql: `INSERT INTO users (id, email, name, gender, is_admin, registered_via, associated_centers, editor_for, created_at, updated_at)
        VALUES (?, NULL, ?, ?, 0, 'name-registration', ?, ?, ?, ?)`,
      args: [id, profile.name, profile.gender, JSON.stringify(associated), JSON.stringify(editorFor), now, now],
    },
  ]);
  const token = await issueToken(env, id, client);
  const { rows } = await query(env, `${USER_SELECT} WHERE u.id = ?`, [id]);
  return json(201, { user: publicUser(rows[0] as unknown as UserRow), token });
}

async function login({ request, env, client }: Ctx): Promise<Response> {
  const email = normalizeEmail((await readJson(request)).email);
  if (!email) throw new HttpError(400, 'A valid email is required');
  await reserveOtpSlot(env, request, email, client);
  const { rows } = await query(env, 'SELECT id FROM users WHERE email = ?', [email]);
  if (rows.length > 0) await issueOtp(env, email, 'login', null);
  return json(200, GENERIC_OTP);
}

async function verifyOtp({ request, env, client }: Ctx): Promise<Response> {
  const payload = await readJson(request);
  const email = normalizeEmail(payload.email);
  const code = typeof payload.otp_code === 'string' ? payload.otp_code.trim() : '';
  if (!email || !/^\d{6}$/.test(code)) throw new HttpError(400, 'email and a 6-digit otp_code are required');
  const invalid = new HttpError(400, 'Invalid or expired code');

  // Counting the attempt before comparing keeps concurrent guesses within the attempt limit.
  const { rows } = await query(env, `UPDATE otp_codes SET attempts = attempts + 1
    WHERE email = ? AND expires_at > ? AND attempts < ?
    RETURNING code_hash, profile, attempts`, [email, new Date().toISOString(), OTP_MAX_ATTEMPTS]);
  const otp = rows[0];
  if (!otp) throw invalid;
  const expected = await hmacHex(env.SESSION_SECRET!, `${email}:${code}`);
  if (!equalHex(expected, String(otp.code_hash))) {
    if (Number(otp.attempts) >= OTP_MAX_ATTEMPTS) await query(env, 'DELETE FROM otp_codes WHERE email = ?', [email]);
    throw invalid;
  }
  const consumed = await query(env, 'DELETE FROM otp_codes WHERE email = ? AND code_hash = ?', [email, expected]);
  if (consumed.changes === 0) throw invalid;

  const now = new Date().toISOString();
  if (otp.profile) {
    const exists = await query(env, 'SELECT id FROM users WHERE email = ?', [email]);
    if (exists.rows.length === 0) {
      const profile = JSON.parse(String(otp.profile)) as Profile;
      const id = crypto.randomUUID();
      await transaction(env, [
        {
          sql: `INSERT INTO users (id, email, name, gender, registered_via, associated_centers, editor_for, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, (SELECT json_group_array(id) FROM
              (SELECT CAST(id AS INTEGER) AS id FROM centers WHERE CAST(id AS INTEGER) IN (${profile.associated_centers.map(() => '?').join(',') || 'NULL'}))), '[]', ?, ?)`,
          args: [id, email, profile.name, profile.gender, client, ...profile.associated_centers, now, now],
        },
      ]);
    }
  }
  const updated = await query(env, 'UPDATE users SET last_login_at = ? WHERE email = ? RETURNING id', [now, email]);
  if (updated.rows.length === 0) throw invalid;
  const userId = String(updated.rows[0].id);
  const { rows: users } = await query(env, `${USER_SELECT} WHERE u.id = ?`, [userId]);
  return json(200, { user: publicUser(users[0] as unknown as UserRow), token: await issueToken(env, userId, client) });
}

async function currentUser(request: Request, env: Env, client: string): Promise<UserRow | null> {
  const claims = await bearerClaims(request, env);
  if (!claims || claims.client !== client) return null;
  const { rows } = await query(env, `${USER_SELECT} WHERE u.id = ?`, [claims.sub]);
  return (rows[0] as unknown as UserRow | undefined) ?? null;
}

async function session({ request, env, client }: Ctx): Promise<Response> {
  const user = await currentUser(request, env, client);
  if (!user) throw new HttpError(401, 'Unauthorized');
  return json(200, { user: publicUser(user) });
}

type Auth = 'client' | 'admin';
interface Route { method: string; pattern: RegExp; auth: Auth; handler: (ctx: Ctx) => Promise<Response> }
const ROUTES: Route[] = [
  { method: 'POST', pattern: /^\/v1\/register$/, auth: 'client', handler: register },
  { method: 'POST', pattern: /^\/v1\/register-name$/, auth: 'client', handler: registerName },
  { method: 'POST', pattern: /^\/v1\/login$/, auth: 'client', handler: login },
  { method: 'POST', pattern: /^\/v1\/verify-otp$/, auth: 'client', handler: verifyOtp },
  { method: 'GET', pattern: /^\/v1\/session$/, auth: 'client', handler: session },
  { method: 'GET', pattern: /^\/v1\/centers$/, auth: 'client', handler: listCenters },
  { method: 'GET', pattern: /^\/v1\/centers\/([^/]+)$/, auth: 'client', handler: getCenter },
  { method: 'POST', pattern: /^\/v1\/centers$/, auth: 'admin', handler: createCenter },
  { method: 'PUT', pattern: /^\/v1\/centers\/([^/]+)$/, auth: 'admin', handler: updateCenter },
  { method: 'DELETE', pattern: /^\/v1\/centers\/([^/]+)$/, auth: 'admin', handler: deleteCenter },
  { method: 'GET', pattern: /^\/v1\/admin\/users$/, auth: 'admin', handler: adminList },
  { method: 'POST', pattern: /^\/v1\/admin\/users$/, auth: 'admin', handler: adminCreate },
  { method: 'PUT', pattern: /^\/v1\/admin\/users\/([^/]+)$/, auth: 'admin', handler: adminUpdate },
  { method: 'DELETE', pattern: /^\/v1\/admin\/users\/([^/]+)$/, auth: 'admin', handler: adminDeleteById },
  { method: 'POST', pattern: /^\/v1\/admin\/users\/import$/, auth: 'admin', handler: adminImport },
  { method: 'POST', pattern: /^\/v1\/admin\/users\/delete$/, auth: 'admin', handler: adminDelete },
];

/**
 * Admin calls use either the server-to-server X-Admin-Key, or a client key plus the bearer token of an admin user.
 * Returns the acting identity (used for created_by/updated_by), or null.
 */
async function authenticateAdmin(request: Request, env: Env): Promise<string | null> {
  const adminKey = request.headers.get('x-admin-key');
  if (adminKey !== null) {
    return env.ADMIN_API_KEY && equalHex(await sha256(adminKey), await sha256(env.ADMIN_API_KEY)) ? 'admin-key' : null;
  }
  const client = await identifyClient(request, env);
  const user = client && await currentUser(request, env, client);
  return user && Number(user.is_admin) === 1 ? user.email : null;
}

async function handle(request: Request, env: Env, cors: Record<string, string>): Promise<Response> {
  const url = new URL(request.url);
  const matches = ROUTES.map((route) => ({ route, match: route.pattern.exec(url.pathname) })).filter((m) => m.match);
  if (matches.length === 0) return json(404, { error: 'Not found' }, cors);
  const found = matches.find((m) => m.route.method === request.method);
  if (!found) return json(405, { error: 'Method not allowed', }, { ...cors, allow: matches.map((m) => m.route.method).join(', ') });
  if (!env.SESSION_SECRET || !env.TURSO_DATABASE_URL || !env.TURSO_AUTH_TOKEN) return json(500, { error: 'Service unavailable' }, cors);
  const { route, match } = found;
  try {
    let client = 'admin';
    let actor = 'admin-key';
    if (route.auth === 'admin') {
      const admin = await authenticateAdmin(request, env);
      if (!admin) return json(401, { error: 'Admin authorization required' }, cors);
      actor = admin;
      client = (await identifyClient(request, env)) ?? 'admin';
    } else {
      const identified = await identifyClient(request, env);
      if (!identified) return json(401, { error: 'Invalid or missing API key' }, cors);
      client = identified;
    }
    const response = await route.handler({ request, env, client, params: match!.slice(1), actor });
    for (const [name, value] of Object.entries(cors)) response.headers.set(name, value);
    return response;
  } catch (error) {
    if (error instanceof HttpError) return json(error.status, { error: error.message }, { ...cors, ...error.headers });
    console.error('Unhandled error', error instanceof Error ? error.message : 'unknown');
    return json(500, { error: 'Internal error' }, cors);
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get('origin');
    let cors: Record<string, string> = {};
    if (origin) {
      if (!allowedOrigins(env).includes(origin)) return json(403, { error: 'Origin not allowed' });
      cors = { 'access-control-allow-origin': origin, vary: 'Origin' };
    }
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          ...cors,
          'access-control-allow-methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'access-control-allow-headers': 'content-type, x-api-key, x-admin-key, authorization',
          'access-control-max-age': '600',
        },
      });
    }
    return handle(request, env, cors);
  },
};
