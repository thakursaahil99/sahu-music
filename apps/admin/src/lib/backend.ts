/**
 * Client for the SAHU MUSIC backend. The admin console is served from the same site at /admin,
 * so it shares the website's /api/v1 and its HttpOnly session cookie. Admin power comes only
 * from the signed-in account's role, checked by the backend on every request.
 */
export const BASE_PATH = '/admin';
export const audiusAppName = process.env.NEXT_PUBLIC_AUDIUS_APP_NAME?.trim() || 'SAHU_MUSIC';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function api<T = Record<string, unknown>>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api/v1/${path}/`, {
      method,
      credentials: 'same-origin',
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      cache: 'no-store',
    });
  } catch {
    throw new ApiError(0, 'No connection.');
  }
  const data = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!res.ok || !data) throw new ApiError(res.status, data?.error || `Request failed (HTTP ${res.status}).`);
  return data;
}

export type Row = Record<string, unknown>;

/** Generic table access for the admin pages (tables and columns are whitelisted by the backend). */
export const adminTable = {
  list: (table: string, opts: { orderBy: string; ascending?: boolean; offset: number; limit: number; search?: string }) =>
    api<{ rows: Row[]; count: number }>('POST', 'admin/table', { op: 'list', table, ...opts }),
  insert: (table: string, row: Row) => api<{ row: Row }>('POST', 'admin/table', { op: 'insert', table, row }),
  update: (table: string, id: unknown, row: Row) => api<{ row: Row }>('POST', 'admin/table', { op: 'update', table, id, row }),
  remove: (table: string, id: unknown) => api('POST', 'admin/table', { op: 'delete', table, id }),
};

/** Reports a provider failure to the API error log. */
export function reportError(provider: string, endpoint: string, message: string): void {
  void api('POST', 'errors', { provider, endpoint, status: 0, message: message.slice(0, 300), client: 'admin' }).catch(() => undefined);
}
