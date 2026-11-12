import { neon, type NeonQueryFunction } from '@neondatabase/serverless';

let client: NeonQueryFunction<false, false> | null = null;

/** True when the deployment has a database (DATABASE_URL from the Neon integration). */
export function hasDatabase(): boolean {
  return !!process.env.DATABASE_URL?.trim();
}

function sql(): NeonQueryFunction<false, false> {
  if (!client) {
    const url = process.env.DATABASE_URL?.trim();
    if (!url) throw new HttpError(503, 'Accounts are not configured on this deployment.');
    client = neon(url);
  }
  return client;
}

export type Row = Record<string, unknown>;

/** Parameterised query. Values are always sent as parameters, never spliced into the SQL text. */
export async function query<T extends Row = Row>(text: string, params: unknown[] = []): Promise<T[]> {
  try {
    return (await sql().query(text, params)) as T[];
  } catch (e) {
    throw toHttpError(e);
  }
}

export async function one<T extends Row = Row>(text: string, params: unknown[] = []): Promise<T | null> {
  return (await query<T>(text, params))[0] ?? null;
}

/** Several statements in one transaction (all succeed or none do). */
export async function transaction(statements: { text: string; params?: unknown[] }[]): Promise<Row[][]> {
  const s = sql();
  try {
    return (await s.transaction(statements.map((q) => s.query(q.text, q.params ?? [])))) as Row[][];
  } catch (e) {
    throw toHttpError(e);
  }
}

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Database errors become short, safe messages; constraint messages are meant for people. */
function toHttpError(e: unknown): HttpError {
  if (e instanceof HttpError) return e;
  const err = e as { code?: string; message?: string; constraint?: string };
  switch (err.code) {
    case '23505':
      return new HttpError(409, 'That record already exists.');
    case '23503':
      return new HttpError(409, 'That record is linked to something that does not exist (or is still in use).');
    case '23514': // check_violation, also raised by the rights trigger
      return new HttpError(400, err.message?.startsWith('Song cannot be public') ? err.message : 'A value is not allowed for that field.');
    case '22P02':
    case '22007':
    case '22008':
      return new HttpError(400, 'A value has the wrong format.');
    case '23502':
      return new HttpError(400, 'A required field is missing.');
    default:
      console.error('[db]', err.code, err.message);
      return new HttpError(500, 'Database error. Please try again.');
  }
}
