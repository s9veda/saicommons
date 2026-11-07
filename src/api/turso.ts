export interface TursoEnv { TURSO_DATABASE_URL?: string; TURSO_AUTH_TOKEN?: string }

export type SqlValue = string | number | null;
export type Row = Record<string, SqlValue>;
export interface QueryResult { rows: Row[]; changes: number }

interface WireValue { type: string; value?: string | number }

function encodeArg(value: SqlValue): WireValue {
  if (value === null) return { type: 'null' };
  if (typeof value === 'number') return { type: 'integer', value: String(Math.trunc(value)) };
  return { type: 'text', value };
}
function decodeValue(cell: WireValue): SqlValue {
  if (cell.type === 'null' || cell.value === undefined) return null;
  if (cell.type === 'integer') return Number(cell.value);
  if (cell.type === 'float') return Number(cell.value);
  return String(cell.value);
}

async function pipeline(env: TursoEnv, statements: Array<{ sql: string; args?: SqlValue[] }>) {
  if (!env.TURSO_DATABASE_URL || !env.TURSO_AUTH_TOKEN) throw new Error('Turso is not configured');
  const base = env.TURSO_DATABASE_URL.replace(/^libsql:\/\//, 'https://').replace(/\/+$/, '');
  const response = await fetch(`${base}/v2/pipeline`, {
    method: 'POST',
    headers: { authorization: `Bearer ${env.TURSO_AUTH_TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      requests: [
        ...statements.map((s) => ({ type: 'execute', stmt: { sql: s.sql, args: (s.args ?? []).map(encodeArg) } })),
        { type: 'close' },
      ],
    }),
  });
  if (!response.ok) throw new Error(`Turso request failed with status ${response.status}`);
  const body = await response.json() as {
    results?: Array<{ type: string; response?: { result?: { cols: Array<{ name: string }>; rows: WireValue[][]; affected_row_count?: number } } }>;
  };
  return statements.map((_, i): QueryResult => {
    const entry = body.results?.[i];
    const result = entry?.response?.result;
    if (entry?.type !== 'ok' || !result) throw new Error('Turso statement failed');
    const rows = result.rows.map((cells) => Object.fromEntries(result.cols.map((col, c) => [col.name, decodeValue(cells[c])])));
    return { rows, changes: result.affected_row_count ?? 0 };
  });
}

/** Runs one statement through Turso's HTTP (Hrana) pipeline API. */
export async function query(env: TursoEnv, sql: string, args: SqlValue[] = []): Promise<QueryResult> {
  return (await pipeline(env, [{ sql, args }]))[0];
}

/**
 * Runs statements atomically using a Hrana batch whose steps are conditional on the previous step's success,
 * with a ROLLBACK step that runs if the COMMIT did not succeed.
 */
export async function transaction(env: TursoEnv, statements: Array<{ sql: string; args?: SqlValue[] }>): Promise<void> {
  if (!env.TURSO_DATABASE_URL || !env.TURSO_AUTH_TOKEN) throw new Error('Turso is not configured');
  const base = env.TURSO_DATABASE_URL.replace(/^libsql:\/\//, 'https://').replace(/\/+$/, '');
  const steps: Array<Record<string, unknown>> = [{ stmt: { sql: 'BEGIN' } }];
  statements.forEach((statement, i) => steps.push({
    condition: { type: 'ok', step: i },
    stmt: { sql: statement.sql, args: (statement.args ?? []).map(encodeArg) },
  }));
  const commit = steps.length;
  steps.push({ condition: { type: 'ok', step: commit - 1 }, stmt: { sql: 'COMMIT' } });
  steps.push({ condition: { type: 'not', cond: { type: 'ok', step: commit } }, stmt: { sql: 'ROLLBACK' } });
  const response = await fetch(`${base}/v2/pipeline`, {
    method: 'POST',
    headers: { authorization: `Bearer ${env.TURSO_AUTH_TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify({ requests: [{ type: 'batch', batch: { steps } }, { type: 'close' }] }),
  });
  if (!response.ok) throw new Error(`Turso request failed with status ${response.status}`);
  const body = await response.json() as {
    results?: Array<{ type: string; response?: { result?: { step_results?: unknown[]; step_errors?: unknown[] } } }>;
  };
  const result = body.results?.[0];
  if (result?.type !== 'ok' || !result.response?.result?.step_results?.[commit] || result.response.result.step_errors?.[commit]) {
    throw new Error('Turso transaction failed');
  }
}
