import { query, transaction } from './turso';
import { HttpError, json, readJson, type Ctx } from './common';

const COLOR = /^#[0-9A-Fa-f]{6}$/;

const CENTER_SELECT = `SELECT c.id, c.name, c.badge_text_color, c.created_by, c.updated_by, c.created_at, c.updated_at,
  (SELECT json_group_array(id) FROM (SELECT u.id FROM users u WHERE EXISTS
    (SELECT 1 FROM json_each(COALESCE(u.editor_for, '[]')) WHERE value = CAST(c.id AS INTEGER)) ORDER BY u.id)) AS editor_ids,
  (SELECT COUNT(*) FROM users u WHERE EXISTS
    (SELECT 1 FROM json_each(COALESCE(u.associated_centers, '[]')) WHERE value = CAST(c.id AS INTEGER))) AS member_count
  FROM centers c`;

function publicCenter(row: Record<string, unknown>) {
  let editorIds: unknown = [];
  try { editorIds = JSON.parse(String(row.editor_ids)); } catch { /* json_group_array always yields JSON */ }
  return {
    id: Number(row.id), name: row.name, badge_text_color: row.badge_text_color,
    editor_ids: editorIds, member_count: Number(row.member_count),
    created_by: row.created_by, updated_by: row.updated_by, created_at: row.created_at, updated_at: row.updated_at,
  };
}

function parseId(value: string): number {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) throw new HttpError(400, 'Invalid center id');
  return id;
}

interface CenterInput { name: string; color: string; editorIds: string[] | undefined }
async function parseCenter(payload: Record<string, unknown>, ctx: Ctx): Promise<CenterInput> {
  const name = typeof payload.name === 'string' ? payload.name.trim() : '';
  if (!name || name.length > 255) throw new HttpError(400, 'Center name is required');
  const color = payload.badge_text_color === undefined || payload.badge_text_color === null ? '#000000' : payload.badge_text_color;
  if (typeof color !== 'string' || !COLOR.test(color)) throw new HttpError(400, 'badge_text_color must be a hex color like #000000');
  let editorIds: string[] | undefined;
  if (payload.editor_ids !== undefined && payload.editor_ids !== null) {
    const list = payload.editor_ids;
    if (!Array.isArray(list) || list.length > 200 || !list.every((id) => typeof id === 'string' && id.length > 0 && id.length <= 64)) {
      throw new HttpError(400, 'editor_ids must be an array of user ids');
    }
    editorIds = [...new Set(list as string[])];
    if (editorIds.length > 0) {
      const { rows } = await query(ctx.env, `SELECT id FROM users WHERE id IN (${editorIds.map(() => '?').join(',')})`, editorIds);
      if (rows.length !== editorIds.length) throw new HttpError(400, 'editor_ids contains an unknown user');
    }
  }
  return { name, color, editorIds };
}

async function nameTaken(ctx: Ctx, name: string, exceptId?: number): Promise<boolean> {
  const { rows } = await query(ctx.env, 'SELECT id FROM centers WHERE name = ? COLLATE NOCASE AND CAST(id AS INTEGER) != ?', [name, exceptId ?? -1]);
  return rows.length > 0;
}

export async function listCenters(ctx: Ctx): Promise<Response> {
  const { rows } = await query(ctx.env, `${CENTER_SELECT} ORDER BY c.name COLLATE NOCASE`);
  return json(200, { centers: rows.map(publicCenter) });
}

export async function getCenter(ctx: Ctx): Promise<Response> {
  const { rows } = await query(ctx.env, `${CENTER_SELECT} WHERE CAST(c.id AS INTEGER) = ?`, [parseId(ctx.params[0])]);
  if (rows.length === 0) throw new HttpError(404, 'Center not found');
  return json(200, { center: publicCenter(rows[0]) });
}

export async function createCenter(ctx: Ctx): Promise<Response> {
  const input = await parseCenter(await readJson(ctx.request), ctx);
  if (await nameTaken(ctx, input.name)) throw new HttpError(409, 'A center with this name already exists');
  const now = new Date().toISOString();
  await transaction(ctx.env, [
    {
      sql: `INSERT INTO centers (id, name, badge_text_color, created_by, updated_by, created_at, updated_at)
        SELECT CAST(COALESCE(MAX(CAST(id AS INTEGER)), 0) + 1 AS TEXT), ?, ?, ?, ?, ?, ? FROM centers`,
      args: [input.name, input.color, ctx.actor, ctx.actor, now, now],
    },
    ...(input.editorIds ?? []).map((userId) => ({
      sql: `UPDATE users SET
        associated_centers = json_insert(COALESCE(associated_centers, '[]'), '$[#]', (SELECT CAST(id AS INTEGER) FROM centers WHERE name = ?)),
        editor_for = json_insert(COALESCE(editor_for, '[]'), '$[#]', (SELECT CAST(id AS INTEGER) FROM centers WHERE name = ?))
        WHERE id = ?`,
      args: [input.name, input.name, userId],
    })),
  ]);
  const { rows } = await query(ctx.env, `${CENTER_SELECT} WHERE c.name = ?`, [input.name]);
  return json(201, { center: publicCenter(rows[0]) });
}

export async function updateCenter(ctx: Ctx): Promise<Response> {
  const id = parseId(ctx.params[0]);
  const input = await parseCenter(await readJson(ctx.request), ctx);
  const existing = await query(ctx.env, 'SELECT id FROM centers WHERE CAST(id AS INTEGER) = ?', [id]);
  if (existing.rows.length === 0) throw new HttpError(404, 'Center not found');
  if (await nameTaken(ctx, input.name, id)) throw new HttpError(409, 'A center with this name already exists');
  const statements = [{
    sql: 'UPDATE centers SET name = ?, badge_text_color = ?, updated_by = ?, updated_at = ? WHERE CAST(id AS INTEGER) = ?',
    args: [input.name, input.color, ctx.actor, new Date().toISOString(), id],
  }];
  if (input.editorIds) {
    // Removed editors stay associated with the center as viewers, as in saisongs.
    statements.push({
      sql: `UPDATE users SET editor_for = (SELECT json_group_array(value) FROM json_each(COALESCE(users.editor_for, '[]')) WHERE value != ?)
        WHERE EXISTS (SELECT 1 FROM json_each(COALESCE(users.editor_for, '[]')) WHERE value = ?)`,
      args: [id, id],
    });
    for (const userId of input.editorIds) {
      statements.push({
        sql: `UPDATE users SET
          associated_centers = CASE WHEN EXISTS (SELECT 1 FROM json_each(COALESCE(associated_centers, '[]')) WHERE value = ?)
            THEN COALESCE(associated_centers, '[]') ELSE json_insert(COALESCE(associated_centers, '[]'), '$[#]', ?) END,
          editor_for = json_insert(COALESCE(editor_for, '[]'), '$[#]', ?) WHERE id = ?`,
        args: [id, id, id, userId],
      });
    }
  }
  await transaction(ctx.env, statements);
  const { rows } = await query(ctx.env, `${CENTER_SELECT} WHERE CAST(c.id AS INTEGER) = ?`, [id]);
  return json(200, { center: publicCenter(rows[0]) });
}

export async function deleteCenter(ctx: Ctx): Promise<Response> {
  const id = parseId(ctx.params[0]);
  const existing = await query(ctx.env, 'SELECT id FROM centers WHERE CAST(id AS INTEGER) = ?', [id]);
  if (existing.rows.length === 0) throw new HttpError(404, 'Center not found');
  const { rows } = await query(ctx.env, `SELECT u.name, EXISTS
    (SELECT 1 FROM json_each(COALESCE(u.editor_for, '[]')) WHERE value = ?) AS can_edit
    FROM users u WHERE EXISTS (SELECT 1 FROM json_each(COALESCE(u.associated_centers, '[]')) WHERE value = ?)
    ORDER BY u.name LIMIT 20`, [id, id]);
  if (rows.length > 0) {
    return json(409, {
      error: 'Cannot delete center while users are associated with it',
      dependencies: { type: 'users', items: rows.map((row) => `${row.name}${Number(row.can_edit) ? ' (editor)' : ''}`) },
    });
  }
  await query(ctx.env, 'DELETE FROM centers WHERE CAST(id AS INTEGER) = ?', [id]);
  return json(200, { ok: true });
}
