import { query } from './turso';
import { HttpError, type Env } from './common';

export interface UserRow {
  id: string; email: string | null; name: string; gender: string | null;
  is_admin: number | null; associated_centers: string | null; editor_for: string | null;
  session_version: number;
}
export interface Profile { name: string; gender: string | null; associated_centers: number[] }

// Same values as saisongs; matched case-insensitively and stored canonically.
const GENDERS = ['Male', 'Female', 'Boy', 'Girl', 'Other'];

export const USER_SELECT = `SELECT u.id, u.email, u.name, u.gender, u.is_admin,
  u.associated_centers, u.editor_for, u.session_version FROM users u`;

function parseIds(value: string | null): number[] {
  if (value === null) return [];
  const parsed: unknown = JSON.parse(value);
  if (!Array.isArray(parsed) || !parsed.every((c) => Number.isSafeInteger(c) && c > 0)) {
    throw new Error('Invalid stored center IDs');
  }
  return parsed;
}
/** admin > editor (has editor_for centers) > viewer, matching the saisongs role rules. */
export function publicUser(row: UserRow) {
  const editorFor = parseIds(row.editor_for);
  const isAdmin = Number(row.is_admin) === 1;
  return {
    id: row.id, email: row.email, name: row.name, gender: row.gender,
    associated_centers: parseIds(row.associated_centers),
    is_admin: isAdmin, editor_for: editorFor,
    role: isAdmin ? 'admin' : editorFor.length > 0 ? 'editor' : 'viewer',
  };
}

export function parseCenterList(value: unknown, field: string): number[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > 100 || !value.every((c) => Number.isSafeInteger(c) && (c as number) > 0)) {
    throw new HttpError(400, `${field} must be an array of positive integers`);
  }
  return [...new Set(value as number[])];
}
export function parseProfile(payload: Record<string, unknown>): Profile {
  const name = typeof payload.name === 'string' ? payload.name.trim() : '';
  if (!name || name.length > 200) throw new HttpError(400, 'name is required');
  let gender: string | null = null;
  if (payload.gender !== undefined && payload.gender !== null && payload.gender !== '') {
    const value = typeof payload.gender === 'string' ? payload.gender.trim().toLowerCase() : '';
    gender = GENDERS.find((g) => g.toLowerCase() === value) ?? null;
    if (!gender) throw new HttpError(400, `gender must be one of: ${GENDERS.join(', ')}`);
  }
  return { name, gender, associated_centers: parseCenterList(payload.associated_centers, 'associated_centers') };
}

/** Rejects ids that do not exist in `centers`. */
export async function assertCentersExist(env: Env, ids: number[]): Promise<void> {
  if (ids.length === 0) return;
  const { rows } = await query(env, `SELECT id FROM centers WHERE CAST(id AS INTEGER) IN (${ids.map(() => '?').join(',')})`, ids);
  const known = new Set(rows.map((row) => Number(row.id)));
  const unknown = ids.filter((id) => !known.has(id));
  if (unknown.length > 0) throw new HttpError(400, `Unknown center id(s): ${unknown.join(', ')}`);
}
