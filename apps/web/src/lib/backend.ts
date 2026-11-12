import { setErrorReporter } from '@sahu/api';
import { music } from './music';

/**
 * Client for the SAHU MUSIC backend (/api/v1 on the same site, data in Neon).
 * The session is an HttpOnly cookie, so no token is ever visible to page scripts.
 */
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
    const [p, q] = path.split('?');
    res = await fetch(`/api/v1/${p}/${q ? `?${q}` : ''}`, {
      method,
      credentials: 'same-origin',
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      cache: 'no-store',
    });
  } catch {
    throw new ApiError(0, 'No connection. Check your internet and try again.');
  }
  const data = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!res.ok || !data) throw new ApiError(res.status, data?.error || `Request failed (HTTP ${res.status}).`);
  return data;
}

let bootstrapped = false;
/** Load admin rules (blocked tracks, switched-off providers) and wire API error monitoring. */
export async function bootstrapCatalogueRules(): Promise<void> {
  if (bootstrapped) return;
  bootstrapped = true;
  try {
    const rules = await api<{ blocked: string[]; disabledProviders: string[]; accounts: boolean }>('GET', 'rules');
    music.setBlocklist(rules.blocked);
    music.setDisabledProviders(rules.disabledProviders);
    if (!rules.accounts) return;
  } catch {
    return; // static hosting without the API, or offline: provider-level rights checks still apply
  }

  let lastReport = 0;
  setErrorReporter((e) => {
    const now = Date.now();
    if (now - lastReport < 15_000) return; // throttle: monitoring must not flood the database
    lastReport = now;
    void api('POST', 'errors', { provider: e.provider, endpoint: e.endpoint.slice(0, 200), status: e.status, message: e.message.slice(0, 300), client: 'web' }).catch(() => undefined);
  });
}
