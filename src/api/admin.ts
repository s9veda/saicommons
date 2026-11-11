import { query, transaction } from './turso';
import { HttpError, json, normalizeEmail, readJson, type Ctx } from './common';
import { USER_SELECT, assertCentersExist, parseCenterList, parseProfile, publicUser, type UserRow } from './users';

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
    associated.forEach((id) => allCenters.add(id));
    statements.push({
      sql: `INSERT INTO users (id, email, name, gender, is_admin, registered_via, associated_centers, editor_for, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 'import', ?, ?, ?, ?)
        ON CONFLICT(email) WHERE email IS NOT NULL DO UPDATE SET name = excluded.name, gender = excluded.gender,
          is_admin = excluded.is_admin, associated_centers = excluded.associated_centers,
          editor_for = excluded.editor_for, updated_at = excluded.updated_at`,
      args: [crypto.randomUUID(), email, profile.name, profile.gender, item.is_admin ? 1 : 0,
        JSON.stringify(associated), JSON.stringify(editorFor), now, now],
    });
  }
  await assertCentersExist(ctx.env, [...allCenters]);
  await transaction(ctx.env, statements);
  return json(200, { ok: true, imported: list.length });
}

function parseFlags(item: Record<string, unknown>) {
  if (item.is_admin !== undefined && typeof item.is_admin !== 'boolean') throw new HttpError(400, 'is_admin must be a boolean');
  return { isAdmin: item.is_admin === true, editorFor: parseCenterList(item.editor_for, 'editor_for') };
}

async function loadUser(ctx: Ctx, id: string) {
  const { rows } = await query(ctx.env, `${USER_SELECT} WHERE u.id = ?`, [id]);
  return rows[0] ? publicUser(rows[0] as unknown as UserRow) : null;
}

/** Refuses changes that would lock everyone out: removing one's own admin rights, or the last admin. */
async function assertAdminRemovable(ctx: Ctx, target: { id: string; email: string; is_admin: boolean }, action: string): Promise<void> {
  if (!target.is_admin) return;
  if (ctx.actor === target.email) throw new HttpError(409, `You cannot ${action} your own administrator account`);
  const { rows } = await query(ctx.env, 'SELECT COUNT(*) AS n FROM users WHERE is_admin = 1');
  if (Number(rows[0].n) <= 1) throw new HttpError(409, `Cannot ${action} the last administrator`);
}

export async function adminCreate(ctx: Ctx): Promise<Response> {
  const payload = await readJson(ctx.request);
  const email = normalizeEmail(payload.email);
  const profile = parseProfile(payload);
  const { isAdmin, editorFor } = parseFlags(payload);
  const associated = [...new Set([...profile.associated_centers, ...editorFor])];
  await assertCentersExist(ctx.env, associated);
  
  // Check name uniqueness within associated centers
  if (associated.length > 0) {
    const { rows } = await query(ctx.env, `
      SELECT u.id, u.name FROM users u
      WHERE u.name = ? AND u.id != ? AND (
        u.associated_centers IS NOT NULL AND json_type(u.associated_centers) = 'array' AND (
          EXISTS (SELECT 1 FROM json_each(u.associated_centers) WHERE value IN (${associated.map(() => '?').join(',')}))
        )
        OR u.editor_for IS NOT NULL AND json_type(u.editor_for) = 'array' AND (
          EXISTS (SELECT 1 FROM json_each(u.editor_for) WHERE value IN (${associated.map(() => '?').join(',')}))
        )
      )
    `, [profile.name, 'new', ...associated, ...associated]);
    if (rows.length > 0) {
      const centerNames = await Promise.all(associated.map(async (id) => {
        const { rows: centerRows } = await query(ctx.env, 'SELECT name FROM centers WHERE id = ?', [id]);
        return centerRows[0]?.name;
      }));
      const conflictingCenters = centerNames.filter(Boolean).join(', ');
      throw new HttpError(409, `A user with this name already exists in: ${conflictingCenters}`);
    }
  }
  
  // Only check email uniqueness if email is provided
  if (email && (await query(ctx.env, 'SELECT id FROM users WHERE email = ?', [email])).rows.length > 0) {
    throw new HttpError(409, 'A user with this email already exists');
  }
  
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await transaction(ctx.env, [
    {
      sql: `INSERT INTO users (id, email, name, gender, is_admin, registered_via, associated_centers, editor_for, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 'admin', ?, ?, ?, ?)`,
      args: [id, email, profile.name, profile.gender, isAdmin ? 1 : 0, JSON.stringify(associated), JSON.stringify(editorFor), now, now],
    },
  ]);
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
  
  if (current.is_admin && !isAdmin) await assertAdminRemovable(ctx, current, 'remove administrator rights from');
  await assertCentersExist(ctx.env, associated);
  
  // Check name uniqueness within associated centers (excluding current user)
  if (associated.length > 0) {
    const { rows } = await query(ctx.env, `
      SELECT u.id, u.name FROM users u
      WHERE u.name = ? AND u.id != ? AND (
        u.associated_centers IS NOT NULL AND json_type(u.associated_centers) = 'array' AND (
          EXISTS (SELECT 1 FROM json_each(u.associated_centers) WHERE value IN (${associated.map(() => '?').join(',')}))
        )
        OR u.editor_for IS NOT NULL AND json_type(u.editor_for) = 'array' AND (
          EXISTS (SELECT 1 FROM json_each(u.editor_for) WHERE value IN (${associated.map(() => '?').join(',')}))
        )
      )
    `, [profile.name, id, ...associated, ...associated]);
    if (rows.length > 0) {
      const centerNames = await Promise.all(associated.map(async (cid) => {
        const { rows: centerRows } = await query(ctx.env, 'SELECT name FROM centers WHERE id = ?', [cid]);
        return centerRows[0]?.name;
      }));
      const conflictingCenters = centerNames.filter(Boolean).join(', ');
      throw new HttpError(409, `A user with this name already exists in: ${conflictingCenters}`);
    }
  }
  
  await transaction(ctx.env, [
    {
      sql: 'UPDATE users SET name = ?, gender = ?, is_admin = ?, associated_centers = ?, editor_for = ?, updated_at = ? WHERE id = ?',
      args: [profile.name, profile.gender, isAdmin ? 1 : 0, JSON.stringify(associated), JSON.stringify(editorFor), new Date().toISOString(), id],
    },
  ]);
  return json(200, { user: await loadUser(ctx, id) });
}

export async function adminList(ctx: Ctx): Promise<Response> {
  const { rows } = await query(ctx.env, `${USER_SELECT} ORDER BY u.email`);
  return json(200, { users: rows.map((row) => publicUser(row as unknown as UserRow)) });
}

async function deleteUser(ctx: Ctx, id: string): Promise<Response> {
  const user = await loadUser(ctx, id);
  if (!user) return json(200, { ok: true, deleted: 0 });
  await assertAdminRemovable(ctx, user, 'delete');
  await transaction(ctx.env, [
    { sql: 'DELETE FROM users WHERE id = ?', args: [id] },
    { sql: 'DELETE FROM otp_codes WHERE email = ?', args: [user.email] },
  ]);
  return json(200, { ok: true, deleted: 1 });
}

export const adminDeleteById = (ctx: Ctx) => deleteUser(ctx, ctx.params[0]);

export async function adminDelete(ctx: Ctx): Promise<Response> {
  const email = normalizeEmail((await readJson(ctx.request)).email);
  if (!email) throw new HttpError(400, 'A valid email is required');
  const found = await query(ctx.env, 'SELECT id FROM users WHERE email = ?', [email]);
  return found.rows.length === 0 ? json(200, { ok: true, deleted: 0 }) : deleteUser(ctx, String(found.rows[0].id));
}
