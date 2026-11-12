import { hasDatabase, query } from './db';
import { body, json, str } from './http';

/** Admin rules every client applies: blocked tracks and switched-off providers. Cached for a minute at the edge. */
export async function rules(): Promise<Response> {
  if (!hasDatabase()) return json({ blocked: [], disabledProviders: [], accounts: false });
  const [blocked, providers] = await Promise.all([
    query<{ k: string }>(`select provider || ':' || provider_track_id as k from music_rights where rights_status in ('blocked', 'rejected') limit 5000`),
    query<{ id: string }>('select id from music_providers where not enabled'),
  ]);
  return json(
    { blocked: blocked.map((r) => r.k), disabledProviders: providers.map((p) => p.id), accounts: true },
    200,
    { 'Cache-Control': 'public, max-age=60, s-maxage=60, stale-while-revalidate=300' },
  );
}

/** Admin-verified catalogue: only songs whose rights are approved with streaming permission. */
export async function catalogue(req: Request): Promise<Response> {
  const limit = Math.min(100, Math.max(1, Number(new URL(req.url).searchParams.get('limit')) || 20));
  const rows = await query('select * from public_songs order by created_at desc limit $1', [limit]);
  return json({ songs: rows }, 200, { 'Cache-Control': 'public, max-age=60, s-maxage=120' });
}

/** Provider API failures reported by the apps, for the admin panel. Length-limited by the table. */
export async function reportError(req: Request): Promise<Response> {
  const b = await body(req);
  const client = ['web', 'mobile', 'admin'].includes(String(b.client)) ? String(b.client) : 'web';
  // monitoring must never flood the database: beyond 60 reports a minute, drop them
  const recent = await query<{ n: number }>(`select count(*)::int as n from api_errors where created_at > now() - interval '1 minute'`);
  if ((recent[0]?.n ?? 0) >= 60) return json({ ok: true, dropped: true }, 202);
  await query('insert into api_errors (provider, endpoint, status, message, client) values ($1, $2, $3, $4, $5)', [
    str(b.provider, 'provider', { max: 40 }),
    str(b.endpoint, 'endpoint', { max: 200 }),
    Number.isInteger(b.status) ? Number(b.status) : 0,
    str(b.message, 'message', { max: 300 }),
    client,
  ]);
  return json({ ok: true }, 201);
}

export async function health(): Promise<Response> {
  if (!hasDatabase()) return json({ ok: true, database: false });
  const started = Date.now();
  await query('select 1');
  return json({ ok: true, database: true, ms: Date.now() - started });
}
