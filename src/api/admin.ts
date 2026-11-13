import { query, transaction } from './turso';
import { HttpError, json, normalizeEmail, readJson, type Ctx } from './common';
import { USER_SELECT, assertCentersExist, parseCenterList, parseProfile, publicUser, type UserRow } from './users';
import { nameKey } from './name-key.mjs';
import { managerTransaction } from './manager-transaction';

const MAX_IMPORT = 100;

export async function adminImport(ctx: Ctx): Promise<Response> {
  const list = (await readJson(ctx.request)).users;
  if (!Array.isArray(list) || list.length === 0 || list.length > MAX_IMPORT) throw new HttpError(400, `users must be an array of 1-${MAX_IMPORT} entries`);
  const now = new Date().toISOString();
  const seen = new Set<string>();
  const statements: Array<{ sql: string; args: Array<string | number | null> }> = [];
  const allCenters = new Set<number>();
  for (const entry of list as unknown[]) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new HttpError(400, 'Each user must be an object');
    const item = entry as Record<string, unknown>;
    const email = normalizeEmail(item.email);
    if (!email || seen.has(email)) throw new HttpError(400, 'Each user needs a unique valid email');
    seen.add(email);
    const profile = parseProfile(item);
    if (item.is_admin !== undefined && typeof item.is_admin !== 'boolean') throw new HttpError(400, 'is_admin must be a boolean');
    const editorFor = parseCenterList(item.editor_for, 'editor_for');
    // Editors are always associated with the centers they edit.
    const associated = [...new Set([...profile.associated_centers, ...editorFor])];
    validateManagedUser(profile.name, email, item.is_admin === true, editorFor, associated);
    if (item.is_admin !== true) {
      const { rows } = await query(ctx.env, 'SELECT id FROM users WHERE email = ? AND is_admin = 1', [email]);
      if (rows.length) throw new HttpError(409, 'Use user editing to remove administrator access');
    }
    associated.forEach((id) => allCenters.add(id));
    statements.push({
      sql: `INSERT INTO users (id, email, name, name_key, gender, is_admin, registered_via, associated_centers, editor_for, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, 'import', ?, ?, ?, ?)
        ON CONFLICT(email) WHERE email IS NOT NULL DO UPDATE SET
          name = CASE WHEN users.is_admin = 1 AND excluded.is_admin = 0 THEN NULL ELSE excluded.name END, name_key = excluded.name_key, gender = excluded.gender,
          is_admin = excluded.is_admin, associated_centers = excluded.associated_centers,
          editor_for = excluded.editor_for, updated_at = excluded.updated_at`,
      args: [crypto.randomUUID(), email, profile.name, nameKey(profile.name), profile.gender, item.is_admin ? 1 : 0,
        JSON.stringify(associated), JSON.stringify(editorFor), now, now],
    });
  }
  await assertCentersExist(ctx.env, [...allCenters]);
  await managerTransaction(ctx, statements);
  return json(200, { ok: true, imported: list.length });
}

function parseFlags(item: Record<string, unknown>) {
  if (item.is_admin !== undefined && typeof item.is_admin !== 'boolean') throw new HttpError(400, 'is_admin must be a boolean');
  return { isAdmin: item.is_admin === true, editorFor: parseCenterList(item.editor_for, 'editor_for') };
}

function validateManagedUser(name: string, email: string | null, isAdmin: boolean, editorFor: number[], centers: number[]): void {
  if (!isAdmin && centers.length === 0) throw new HttpError(400, 'At least one center is required');
  if ((isAdmin || editorFor.length > 0) && !email) throw new HttpError(400, 'An email is required for administrators and editors');
  if (name.includes('&')) {
    const parts = name.split('&');
    if (parts.length !== 2 || parts.some((part) => !part.trim())) throw new HttpError(400, 'A pair must contain two names');
    if (email || isAdmin || editorFor.length > 0) throw new HttpError(400, 'Pairs cannot have email or privileged roles');
  }
}

function mutationGuard(ctx: Ctx, centers: number[] | null, target: boolean): { sql: string; args: Array<string | number> } {
  const principal = ctx.principal;
  if (!principal) return { sql: '1', args: [] };
  if (principal.isAdmin) return {
    sql: 'EXISTS (SELECT 1 FROM users manager WHERE manager.id = ? AND manager.session_version = ? AND manager.is_admin = 1)',
    args: [principal.id, principal.sessionVersion],
  };
  const targetCheck = target ? `AND users.is_admin = 0
    AND json_array_length(COALESCE(users.associated_centers, '[]')) > 0
    AND NOT EXISTS (SELECT 1 FROM json_each(COALESCE(users.associated_centers, '[]')) member
      WHERE NOT EXISTS (SELECT 1 FROM json_each(manager.editor_for) allowed WHERE allowed.value = member.value))` : '';
  const desiredCheck = centers ? `AND NOT EXISTS (SELECT 1 FROM json_each(?) member
    WHERE NOT EXISTS (SELECT 1 FROM json_each(manager.editor_for) allowed WHERE allowed.value = member.value))` : '';
  return {
    sql: `EXISTS (SELECT 1 FROM users manager WHERE manager.id = ? AND manager.session_version = ?
      AND manager.email IS NOT NULL AND json_array_length(COALESCE(manager.editor_for, '[]')) > 0
      ${desiredCheck} ${targetCheck})`,
    args: [principal.id, principal.sessionVersion, ...(centers ? [JSON.stringify(centers)] : [])],
  };
}

async function loadUser(ctx: Ctx, id: string) {
  const { rows } = await query(ctx.env, `${USER_SELECT} WHERE u.id = ?`, [id]);
  return rows[0] ? publicUser(rows[0] as unknown as UserRow) : null;
}

/** Refuses changes that would lock everyone out: removing one's own admin rights, or the last admin. */
async function assertAdminRemovable(ctx: Ctx, target: { id: string; email: string | null; is_admin: boolean }, action: string): Promise<void> {
  if (!target.is_admin) return;
  if (ctx.actor === target.email) throw new HttpError(409, `You cannot ${action} your own administrator account`);
  const { rows } = await query(ctx.env, 'SELECT COUNT(*) AS n FROM users WHERE is_admin = 1');
  if (Number(rows[0].n) <= 1) throw new HttpError(409, `Cannot ${action} the last administrator`);
}

export async function adminCreate(ctx: Ctx): Promise<Response> {
  const payload = await readJson(ctx.request);
  const email = normalizeEmail(payload.email);
  if (payload.email != null && (typeof payload.email !== 'string' || (payload.email.trim() !== '' && !email))) {
    throw new HttpError(400, 'A valid email is required when provided');
  }
  const profile = parseProfile(payload);
  const { isAdmin, editorFor } = parseFlags(payload);
  const associated = [...new Set([...profile.associated_centers, ...editorFor])];
  await assertCentersExist(ctx.env, associated);
  validateManagedUser(profile.name, email, isAdmin, editorFor, associated);
  if (ctx.principal && !ctx.principal.isAdmin && isAdmin) throw new HttpError(403, 'Editors cannot assign administrator access');
  
  // Only check email uniqueness if email is provided
  if (email && (await query(ctx.env, 'SELECT id FROM users WHERE email = ?', [email])).rows.length > 0) {
    throw new HttpError(409, 'A user with this email already exists');
  }
  
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const guard = mutationGuard(ctx, associated, false);
  const inserted = await query(ctx.env, `INSERT INTO users (id, email, name, name_key, gender, is_admin, registered_via, associated_centers, editor_for, created_at, updated_at)
    SELECT ?, ?, ?, ?, ?, ?, 'admin', ?, ?, ?, ? WHERE ${guard.sql} RETURNING id`,
  [id, email, profile.name, nameKey(profile.name), profile.gender, isAdmin ? 1 : 0, JSON.stringify(associated), JSON.stringify(editorFor), now, now, ...guard.args]);
  if (inserted.rows.length === 0) throw new HttpError(403, 'You cannot manage users in the selected centers');
  return json(201, { user: await loadUser(ctx, id) });
}

export async function adminUpdate(ctx: Ctx): Promise<Response> {
  const id = ctx.params[0];
  const payload = await readJson(ctx.request);
  const current = await loadUser(ctx, id);
  if (!current) throw new HttpError(404, 'User not found');
  const profile = parseProfile(payload);
  const { isAdmin, editorFor } = parseFlags(payload);
  const associated = [...new Set([...profile.associated_centers, ...editorFor])];
  const email = payload.email === undefined ? current.email : normalizeEmail(payload.email);
  if (payload.email != null && (typeof payload.email !== 'string' || (payload.email.trim() !== '' && !email))) {
    throw new HttpError(400, 'A valid email is required when provided');
  }
  if (payload.revoke_sessions !== undefined && typeof payload.revoke_sessions !== 'boolean') throw new HttpError(400, 'revoke_sessions must be a boolean');
  validateManagedUser(profile.name, email, isAdmin, editorFor, associated);
  if (ctx.principal && !ctx.principal.isAdmin && (current.is_admin || isAdmin)) throw new HttpError(403, 'Editors cannot manage administrators');
  
  if (current.is_admin && !isAdmin) await assertAdminRemovable(ctx, current, 'remove administrator rights from');
  await assertCentersExist(ctx.env, associated);
  
  const guard = mutationGuard(ctx, associated, true);
  const updated = await query(ctx.env, `UPDATE users SET email = ?, name = ?, name_key = ?, gender = ?, is_admin = ?, associated_centers = ?, editor_for = ?,
    session_version = session_version + CASE WHEN email IS NULL AND ? IS NOT NULL AND ? = 1 THEN 1 ELSE ? END,
    updated_at = ? WHERE id = ? AND ${guard.sql}
    AND (users.is_admin = 0 OR ? = 1 OR (users.id != ? AND (SELECT COUNT(*) FROM users WHERE is_admin = 1) > 1)) RETURNING id`,
  [email, profile.name, nameKey(profile.name), profile.gender, isAdmin ? 1 : 0, JSON.stringify(associated), JSON.stringify(editorFor), email,
    isAdmin || editorFor.length > 0 ? 1 : 0, payload.revoke_sessions === true ? 1 : 0,
    new Date().toISOString(), id, ...guard.args, isAdmin ? 1 : 0, ctx.principal?.id ?? '']);
  if (updated.rows.length === 0) throw new HttpError(403, 'You cannot manage this user or the selected centers');
  return json(200, { user: await loadUser(ctx, id) });
}

export async function adminList(ctx: Ctx): Promise<Response> {
  const principal = ctx.principal;
  const { rows } = principal
    ? await query(ctx.env, `${USER_SELECT} WHERE EXISTS (
        SELECT 1 FROM users manager WHERE manager.id = ? AND manager.session_version = ?
          AND manager.email IS NOT NULL AND (manager.is_admin = 1 OR EXISTS (
            SELECT 1 FROM json_each(COALESCE(manager.editor_for, '[]')) allowed,
              json_each(COALESCE(u.associated_centers, '[]')) member WHERE allowed.value = member.value
          ))
      ) ORDER BY u.email`, [principal.id, principal.sessionVersion])
    : await query(ctx.env, `${USER_SELECT} ORDER BY u.email`);
  if (principal && rows.length === 0) throw new HttpError(403, 'Management authorization changed');
  return json(200, { users: rows.map((row) => publicUser(row as unknown as UserRow)) });
}

async function deleteUser(ctx: Ctx, id: string): Promise<Response> {
  const user = await loadUser(ctx, id);
  if (!user) return json(200, { ok: true, deleted: 0 });
  await assertAdminRemovable(ctx, user, 'delete');
  if (ctx.principal && !ctx.principal.isAdmin && user.is_admin) throw new HttpError(403, 'Editors cannot manage administrators');
  const guard = mutationGuard(ctx, null, true);
  await transaction(ctx.env, [
    { sql: `DELETE FROM users WHERE id = ? AND ${guard.sql}
      AND (users.is_admin = 0 OR (users.id != ? AND (SELECT COUNT(*) FROM users WHERE is_admin = 1) > 1))`,
      args: [id, ...guard.args, ctx.principal?.id ?? ''] },
    { sql: 'DELETE FROM otp_codes WHERE email = ? AND NOT EXISTS (SELECT 1 FROM users WHERE id = ?)', args: [user.email, id] },
  ]);
  if (await loadUser(ctx, id)) throw new HttpError(403, 'You cannot manage this user');
  return json(200, { ok: true, deleted: 1 });
}

export const adminDeleteById = (ctx: Ctx) => deleteUser(ctx, ctx.params[0]);

export async function adminDelete(ctx: Ctx): Promise<Response> {
  const email = normalizeEmail((await readJson(ctx.request)).email);
  if (!email) throw new HttpError(400, 'A valid email is required');
  const found = await query(ctx.env, 'SELECT id FROM users WHERE email = ?', [email]);
  return found.rows.length === 0 ? json(200, { ok: true, deleted: 0 }) : deleteUser(ctx, String(found.rows[0].id));
}
