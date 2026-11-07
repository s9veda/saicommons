import type { TursoEnv } from './turso';

export interface Env extends TursoEnv {
  SESSION_SECRET?: string;
  ADMIN_API_KEY?: string;
  API_KEYS?: string;
  ALLOWED_ORIGINS?: string;
  BREVO_API_KEY?: string;
  BREVO_SENDER_EMAIL?: string;
  BREVO_SENDER_NAME?: string;
}
export interface Ctx {
  request: Request;
  env: Env;
  client: string;
  /** Capture groups from the route pattern. */
  params: string[];
  /** Who is acting: the admin user's email for admin-token calls, `admin-key` for the server key. */
  actor: string;
}

export const encoder = new TextEncoder();
const decoder = new TextDecoder();
const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;
const MAX_BODY_BYTES = 8 * 1024;
export const CLIENT_ID = /^[a-z0-9][a-z0-9._-]{0,63}$/;

export class HttpError extends Error {
  constructor(readonly status: number, message: string, readonly headers: Record<string, string> = {}) { super(message); }
}

export function json(status: number, body: unknown, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...extra },
  });
}
export function normalizeEmail(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const email = value.trim().toLowerCase();
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}
export async function readJson(request: Request): Promise<Record<string, unknown>> {
  const declared = Number(request.headers.get('content-length') ?? 0);
  if (declared > MAX_BODY_BYTES) throw new HttpError(413, 'Request too large');
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) throw new HttpError(413, 'Request too large');
  try {
    const parsed: unknown = JSON.parse(text);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
  } catch { /* fall through */ }
  throw new HttpError(400, 'Invalid JSON body');
}

function b64url(bytes: Uint8Array): string {
  let value = '';
  for (const byte of bytes) value += String.fromCharCode(byte);
  return btoa(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
function unb64url(value: string): Uint8Array<ArrayBuffer> {
  if (!/^[\w-]+$/.test(value)) throw new Error('Invalid base64url');
  const binary = atob(value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4));
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
function hex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
export async function sha256(value: string): Promise<string> {
  return hex(await crypto.subtle.digest('SHA-256', encoder.encode(value)));
}
async function hmacKey(secret: string, usage: 'sign' | 'verify'): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [usage]);
}
export async function hmacHex(secret: string, value: string): Promise<string> {
  return hex(await crypto.subtle.sign('HMAC', await hmacKey(secret, 'sign'), encoder.encode(value)));
}
export function equalHex(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

function apiKeyEntries(env: Env): Array<{ id: string; key: string }> {
  const entries: Array<{ id: string; key: string }> = [];
  for (const entry of (env.API_KEYS ?? '').split(',')) {
    const separator = entry.indexOf('=');
    const id = entry.slice(0, separator).trim();
    const key = entry.slice(separator + 1).trim();
    if (separator >= 1 && CLIENT_ID.test(id) && key) entries.push({ id, key });
  }
  return entries;
}
/** API_KEYS is a comma-separated list of `client=key` pairs, e.g. `bhajanstudio-ios=sc_...`. Returns the matching client id. */
export async function identifyClient(request: Request, env: Env): Promise<string | null> {
  const provided = request.headers.get('x-api-key');
  if (!provided) return null;
  const providedHash = await sha256(provided);
  let client: string | null = null;
  for (const { id, key } of apiKeyEntries(env)) {
    if (equalHex(providedHash, await sha256(key))) client ??= id;
  }
  return client;
}

export async function issueToken(env: Env, userId: string, client: string): Promise<string> {
  const iat = Math.floor(Date.now() / 1000);
  const head = b64url(encoder.encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const body = b64url(encoder.encode(JSON.stringify({ sub: userId, client, iat, exp: iat + SESSION_TTL_SECONDS })));
  const signature = await crypto.subtle.sign('HMAC', await hmacKey(env.SESSION_SECRET!, 'sign'), encoder.encode(`${head}.${body}`));
  return `${head}.${body}.${b64url(new Uint8Array(signature))}`;
}
export async function verifyToken(env: Env, token: string): Promise<{ sub: string; client: string } | null> {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const [head, body, signature] = parts;
    const header = JSON.parse(decoder.decode(unb64url(head))) as { alg?: string; typ?: string };
    if (header.alg !== 'HS256' || header.typ !== 'JWT') return null;
    const valid = await crypto.subtle.verify('HMAC', await hmacKey(env.SESSION_SECRET!, 'verify'), unb64url(signature), encoder.encode(`${head}.${body}`));
    if (!valid) return null;
    const claims = JSON.parse(decoder.decode(unb64url(body))) as { sub?: unknown; client?: unknown; exp?: unknown; iat?: unknown };
    const now = Math.floor(Date.now() / 1000);
    if (typeof claims.sub !== 'string' || typeof claims.client !== 'string' || typeof claims.exp !== 'number' || typeof claims.iat !== 'number') return null;
    return claims.exp > now && claims.iat <= now + 60 ? { sub: claims.sub, client: claims.client } : null;
  } catch { return null; }
}
export function bearerClaims(request: Request, env: Env): Promise<{ sub: string; client: string } | null> {
  const match = /^Bearer\s+(\S+)$/i.exec(request.headers.get('authorization') ?? '');
  return match ? verifyToken(env, match[1]) : Promise.resolve(null);
}
