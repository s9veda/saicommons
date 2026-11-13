import { transaction, type SqlValue } from './turso';
import type { Ctx } from './common';

export async function managerTransaction(ctx: Ctx, statements: Array<{ sql: string; args?: SqlValue[] }>): Promise<void> {
  const principal = ctx.principal;
  const guard = principal ? [
    { sql: 'CREATE TEMP TABLE saicommons_admin_guard (allowed INTEGER CONSTRAINT SAI_MANAGER_AUTH CHECK (allowed = 1))' },
    { sql: `INSERT INTO saicommons_admin_guard SELECT EXISTS (
      SELECT 1 FROM users WHERE id = ? AND session_version = ? AND is_admin = 1 AND email IS NOT NULL)`,
      args: [principal.id, principal.sessionVersion] },
    { sql: 'DROP TABLE saicommons_admin_guard' },
  ] : [];
  await transaction(ctx.env, [...guard, ...statements]);
}
