import { requireAdmin } from './auth';
import { HttpError, one, query, transaction } from './db';
import { body, json, PROVIDER, str, uuid } from './http';

/**
 * Admin tables. Only the tables and columns listed here can be read or changed, and table and
 * column names come from this list, never from the request. Values are always parameters.
 */
interface TableDef {
  pk: string;
  pkType: 'uuid' | 'text' | 'int';
  /** columns an admin may set */
  write: string[];
  /** columns that can be set on create but not changed afterwards */
  createOnly?: string[];
  json?: string[];
  order: string[];
  search?: string;
  create?: boolean;
  edit?: boolean;
  remove?: boolean;
  /** select list (defaults to *) */
  select?: string;
  from?: string;
}

const TABLES: Record<string, TableDef> = {
  songs: {
    pk: 'id', pkType: 'uuid',
    write: ['title', 'artist_name', 'provider', 'provider_track_id', 'stream_url', 'artwork_url', 'permalink', 'duration', 'genre', 'is_public'],
    createOnly: ['provider', 'provider_track_id'], order: ['created_at', 'title'], search: 'title',
  },
  artists: {
    pk: 'id', pkType: 'uuid',
    write: ['name', 'provider', 'provider_artist_id', 'image_url', 'bio', 'verified'],
    createOnly: ['provider', 'provider_artist_id'], order: ['created_at', 'name'], search: 'name',
  },
  albums: {
    pk: 'id', pkType: 'uuid',
    write: ['title', 'provider', 'provider_album_id', 'artwork_url', 'release_date'],
    createOnly: ['provider', 'provider_album_id'], order: ['created_at', 'title'], search: 'title',
  },
  genres: {
    pk: 'slug', pkType: 'text',
    write: ['slug', 'name', 'description', 'strategy', 'sort_order', 'enabled'],
    createOnly: ['slug'], json: ['strategy'], order: ['sort_order', 'name'], search: 'name',
  },
  playlists: {
    pk: 'id', pkType: 'uuid',
    write: ['title', 'description', 'artwork_url', 'is_public', 'is_editorial'],
    order: ['created_at', 'title'], search: 'title',
  },
  music_providers: {
    pk: 'id', pkType: 'text',
    write: ['id', 'name', 'homepage', 'api_base_url', 'requires_key', 'enabled', 'terms_note'],
    createOnly: ['id'], order: ['id', 'name'], remove: false,
  },
  api_errors: { pk: 'id', pkType: 'int', write: [], order: ['created_at'], search: 'provider', create: false, edit: false },
  profiles: {
    pk: 'id', pkType: 'uuid',
    write: ['display_name', 'role', 'is_blocked'],
    order: ['created_at', 'display_name'], search: 'display_name', create: false, remove: false,
    select: 'p.*, u.email::text as email', from: 'profiles p join users u on u.id = p.id',
  },
};

function def(name: unknown): TableDef & { name: string } {
  const t = typeof name === 'string' ? TABLES[name] : undefined;
  if (!t) throw new HttpError(400, 'Unknown table.');
  return { ...t, name: name as string };
}

function pkValue(t: TableDef, v: unknown): string | number {
  if (t.pkType === 'uuid') return uuid(v);
  if (t.pkType === 'int') {
    const n = Number(v);
    if (!Number.isSafeInteger(n)) throw new HttpError(400, 'id is not valid.');
    return n;
  }
  if (typeof v !== 'string' || !v || v.length > 64) throw new HttpError(400, 'id is not valid.');
  return v;
}

/** Column values from the request, limited to the allowed columns and simple JSON types. */
function values(t: TableDef, row: unknown, isNew: boolean): [string[], unknown[]] {
  if (!row || typeof row !== 'object' || Array.isArray(row)) throw new HttpError(400, 'row is required.');
  const cols: string[] = [];
  const vals: unknown[] = [];
  for (const [k, raw] of Object.entries(row as Record<string, unknown>)) {
    if (!t.write.includes(k)) continue;
    if (!isNew && t.createOnly?.includes(k)) continue;
    let v = raw;
    if (t.json?.includes(k)) {
      if (v === null || typeof v !== 'object') throw new HttpError(400, `${k} must be a JSON object.`);
      v = JSON.stringify(v);
      if ((v as string).length > 4000) throw new HttpError(400, `${k} is too large.`);
    } else if (v !== null && !['string', 'number', 'boolean'].includes(typeof v)) {
      throw new HttpError(400, `${k} has an unsupported value.`);
    } else if (typeof v === 'string' && v.length > 5000) {
      throw new HttpError(400, `${k} is too long.`);
    } else if (typeof v === 'number' && !Number.isFinite(v)) {
      throw new HttpError(400, `${k} must be a number.`);
    }
    cols.push(k);
    vals.push(v);
  }
  return [cols, vals];
}

async function list(t: TableDef & { name: string }, b: Record<string, unknown>): Promise<Response> {
  const orderBy = t.order.includes(String(b.orderBy)) ? String(b.orderBy) : t.order[0];
  const dir = b.ascending ? 'asc' : 'desc';
  const limit = Math.min(100, Math.max(1, Number(b.limit) || 25));
  const offset = Math.max(0, Math.min(1_000_000, Number(b.offset) || 0));
  const term = typeof b.search === 'string' ? b.search.trim().slice(0, 60) : '';
  const params: unknown[] = [limit, offset];
  let where = '';
  if (t.search && term) {
    params.push(`%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
    where = `where ${t.from ? 'p.' : ''}${t.search} ilike $3`;
  }
  const from = t.from ?? t.name;
  const prefix = t.from ? 'p.' : '';
  const rows = await query(
    `select ${t.select ?? '*'}, count(*) over()::int as __count from ${from} ${where}
      order by ${prefix}${orderBy} ${dir} nulls last limit $1 offset $2`,
    params,
  );
  const count = (rows[0]?.__count as number | undefined) ?? 0;
  for (const r of rows) delete r.__count;
  return json({ rows, count });
}

export async function adminTable(req: Request): Promise<Response> {
  const admin = await requireAdmin(req);
  const b = await body(req);
  const t = def(b.table);
  switch (b.op) {
    case 'list':
      return list(t, b);
    case 'insert': {
      if (t.create === false) throw new HttpError(403, 'Records cannot be created here.');
      const [cols, vals] = values(t, b.row, true);
      if (t.name === 'playlists') {
        cols.push('owner_id');
        vals.push(admin.id);
      }
      if (!cols.length) throw new HttpError(400, 'Nothing to save.');
      const ph = cols.map((c, i) => (t.json?.includes(c) ? `$${i + 1}::jsonb` : `$${i + 1}`));
      const [row] = await query(`insert into ${t.name} (${cols.join(', ')}) values (${ph.join(', ')}) returning *`, vals);
      return json({ row }, 201);
    }
    case 'update': {
      if (t.edit === false) throw new HttpError(403, 'Records cannot be edited here.');
      const id = pkValue(t, b.id);
      const [cols, vals] = values(t, b.row, false);
      if (!cols.length) throw new HttpError(400, 'Nothing to save.');
      if (t.name === 'profiles' && id === admin.id && (cols.includes('role') || cols.includes('is_blocked'))) {
        const i = cols.indexOf('role');
        const j = cols.indexOf('is_blocked');
        if ((i >= 0 && vals[i] !== 'admin') || (j >= 0 && vals[j] === true)) throw new HttpError(400, 'You cannot remove your own admin access.');
      }
      const sets = cols.map((c, i) => `${c} = $${i + 2}${t.json?.includes(c) ? '::jsonb' : ''}`);
      const rows = await query(`update ${t.name} set ${sets.join(', ')} where ${t.pk} = $1 returning *`, [id, ...vals]);
      if (!rows.length) throw new HttpError(404, 'Record not found.');
      if (t.name === 'profiles' && cols.includes('is_blocked') && vals[cols.indexOf('is_blocked')] === true) {
        await query('delete from sessions where user_id = $1', [id]); // a blocked user is signed out everywhere
      }
      return json({ row: rows[0] });
    }
    case 'delete': {
      if (t.remove === false) throw new HttpError(403, 'Records cannot be deleted here.');
      const id = pkValue(t, b.id);
      await query(`delete from ${t.name} where ${t.pk} = $1`, [id]);
      return json({ ok: true });
    }
    default:
      throw new HttpError(400, 'Unknown operation.');
  }
}

export async function adminStats(req: Request): Promise<Response> {
  await requireAdmin(req);
  const row = await one<{ stats: unknown }>(`select jsonb_build_object(
    'users',           (select count(*) from profiles),
    'admins',          (select count(*) from profiles where role = 'admin'),
    'blocked_users',   (select count(*) from profiles where is_blocked),
    'new_users_24h',   (select count(*) from profiles where created_at > now() - interval '24 hours'),
    'new_users_7d',    (select count(*) from profiles where created_at > now() - interval '7 days'),
    'active_users_24h',(select count(*) from profiles where last_seen_at > now() - interval '24 hours'),
    'active_users_7d', (select count(*) from profiles where last_seen_at > now() - interval '7 days'),
    'signed_in_devices',(select count(*) from sessions where expires_at > now()),
    'signups_by_day',  (select coalesce(jsonb_agg(jsonb_build_object('day', d, 'users', c) order by d), '[]'::jsonb)
                          from (select date_trunc('day', created_at)::date as d, count(*) as c
                                  from profiles where created_at > now() - interval '14 days' group by 1) x),
    'recent_users',    (select coalesce(jsonb_agg(r order by r.created_at desc), '[]'::jsonb)
                          from (select p.id, u.email::text as email, p.display_name, p.created_at, p.last_seen_at
                                  from profiles p join users u on u.id = p.id order by p.created_at desc limit 8) r),
    'songs',           (select count(*) from songs),
    'public_songs',    (select count(*) from songs where is_public),
    'artists',         (select count(*) from artists),
    'albums',          (select count(*) from albums),
    'playlists',       (select count(*) from playlists),
    'favorites',       (select count(*) from favorites),
    'plays_24h',       (select count(*) from listening_history where played_at > now() - interval '24 hours'),
    'plays_7d',        (select count(*) from listening_history where played_at > now() - interval '7 days'),
    'rights_pending',  (select count(*) from music_rights where rights_status = 'pending'),
    'rights_approved', (select count(*) from music_rights where rights_status = 'approved'),
    'rights_blocked',  (select count(*) from music_rights where rights_status in ('blocked', 'rejected')),
    'api_errors_24h',  (select count(*) from api_errors where created_at > now() - interval '24 hours'),
    'plays_by_day',    (select coalesce(jsonb_agg(jsonb_build_object('day', d, 'plays', c) order by d), '[]'::jsonb)
                          from (select date_trunc('day', played_at)::date as d, count(*) as c
                                  from listening_history where played_at > now() - interval '14 days' group by 1) x),
    'top_tracks',      (select coalesce(jsonb_agg(t), '[]'::jsonb)
                          from (select track ->> 'title' as title, track ->> 'artist' as artist, count(*) as plays
                                  from listening_history where played_at > now() - interval '30 days'
                                 group by 1, 2 order by 3 desc limit 10) t)
  ) as stats`);
  return json(row?.stats ?? {});
}

const STATUSES = ['pending', 'approved', 'rejected', 'blocked'];
const PERMS = ['allowed', 'not_allowed', 'unconfirmed'];

export async function adminRights(req: Request): Promise<Response> {
  const admin = await requireAdmin(req);
  const b = await body(req);
  switch (b.op) {
    case 'list': {
      const status = STATUSES.includes(String(b.status)) ? String(b.status) : 'pending';
      const limit = Math.min(100, Math.max(1, Number(b.limit) || 20));
      const offset = Math.max(0, Number(b.offset) || 0);
      const rows = await query(
        `select r.*, count(*) over()::int as __count,
                case when s.id is null then null else jsonb_build_object('title', s.title, 'artist_name', s.artist_name,
                  'artwork_url', s.artwork_url, 'permalink', s.permalink, 'is_public', s.is_public) end as songs
           from music_rights r left join songs s on s.id = r.song_id
          where r.rights_status = $1 order by r.created_at desc limit $2 offset $3`,
        [status, limit, offset],
      );
      const count = (rows[0]?.__count as number | undefined) ?? 0;
      for (const r of rows) delete r.__count;
      return json({ rows, count });
    }
    case 'update': {
      const id = uuid(b.id);
      const c = (b.changes ?? {}) as Record<string, unknown>;
      const sets: string[] = [];
      const vals: unknown[] = [id];
      const add = (col: string, v: unknown) => {
        vals.push(v);
        sets.push(`${col} = $${vals.length}`);
      };
      if (c.rights_status !== undefined) {
        if (!STATUSES.includes(String(c.rights_status))) throw new HttpError(400, 'Unknown status.');
        add('rights_status', c.rights_status);
        add('verified_by', admin.id);
      }
      if (c.streaming_permitted !== undefined) add('streaming_permitted', c.streaming_permitted === true);
      for (const k of ['commercial_use', 'advertising']) {
        if (c[k] !== undefined) {
          if (!PERMS.includes(String(c[k]))) throw new HttpError(400, `${k} is not valid.`);
          add(k, c[k]);
        }
      }
      if (c.license !== undefined) add('license', str(c.license, 'license', { max: 200, required: false }) || null);
      if (c.evidence !== undefined) add('evidence', str(c.evidence, 'evidence', { max: 1000, required: false }) || null);
      if (!sets.length) throw new HttpError(400, 'Nothing to change.');
      const rows = await query(`update music_rights set ${sets.join(', ')} where id = $1 returning id`, vals);
      if (!rows.length) throw new HttpError(404, 'Record not found.');
      return json({ ok: true });
    }
    case 'block': {
      const provider = String(b.provider ?? '');
      const trackId = String(b.providerTrackId ?? '');
      if (!PROVIDER.test(provider)) throw new HttpError(400, 'Provider is not valid.');
      if (!/^[A-Za-z0-9_.:=-]{1,200}$/.test(trackId)) throw new HttpError(400, 'Enter a valid provider track ID.');
      const reason = str(b.reason, 'reason', { max: 500, required: false }) || 'Blocked by administrator.';
      await query(
        `insert into music_rights (provider, provider_track_id, rights_status, streaming_permitted, evidence, verified_by)
         values ($1, $2, 'blocked', false, $3, $4)
         on conflict (provider, provider_track_id) do update
           set rights_status = 'blocked', streaming_permitted = false, evidence = excluded.evidence, verified_by = excluded.verified_by`,
        [provider, trackId, reason, admin.id],
      );
      return json({ ok: true });
    }
    default:
      throw new HttpError(400, 'Unknown operation.');
  }
}

/**
 * Catalogue sync: tracks fetched from a provider API in the admin panel are stored as private songs
 * with a PENDING rights record. Nothing is published, and an existing decision is never overwritten.
 */
export async function adminImport(req: Request): Promise<Response> {
  await requireAdmin(req);
  const b = await body(req);
  const provider = String(b.provider ?? '');
  if (!PROVIDER.test(provider)) throw new HttpError(400, 'Provider is not valid.');
  const enabled = await one<{ enabled: boolean }>('select enabled from music_providers where id = $1', [provider]);
  if (!enabled) throw new HttpError(400, 'Unknown provider.');
  if (!enabled.enabled) throw new HttpError(400, 'This provider is disabled. Enable it under Music providers first.');
  const tracks = Array.isArray(b.tracks) ? b.tracks.slice(0, 50) : [];
  let imported = 0;
  let failed = 0;
  for (const raw of tracks) {
    const t = (raw ?? {}) as Record<string, unknown>;
    try {
      const trackId = String(t.providerTrackId ?? '');
      const streamUrl = String(t.streamUrl ?? '');
      if (!/^[A-Za-z0-9_.:=-]{1,200}$/.test(trackId) || !streamUrl.startsWith('https://')) throw new Error('invalid');
      const title = str(t.title, 'title', { min: 1, max: 300 });
      const artist = str(t.artist, 'artist', { min: 1, max: 200 });
      const artistId = typeof t.artistId === 'string' && /^[A-Za-z0-9_.:=-]{1,200}$/.test(t.artistId) ? t.artistId : null;
      const https = (v: unknown) => (typeof v === 'string' && v.startsWith('https://') && v.length <= 1000 ? v : null);
      const statements = [];
      if (artistId) {
        statements.push({
          text: `insert into artists (provider, provider_artist_id, name) values ($1, $2, $3)
                 on conflict (provider, provider_artist_id) do update set name = excluded.name`,
          params: [provider, artistId, artist],
        });
      }
      statements.push({
        text: `insert into songs (provider, provider_track_id, title, artist_name, artist_id, artwork_url, stream_url, permalink, duration, genre)
               values ($1, $2, $3, $4, (select id from artists where provider = $1 and provider_artist_id = $5), $6, $7, $8, $9, $10)
               on conflict (provider, provider_track_id) do update
                 set title = excluded.title, artist_name = excluded.artist_name, artist_id = excluded.artist_id,
                     artwork_url = excluded.artwork_url, stream_url = excluded.stream_url, permalink = excluded.permalink,
                     duration = excluded.duration, genre = excluded.genre`,
        params: [provider, trackId, title, artist, artistId, https(t.artwork), streamUrl, https(t.permalink),
          Math.max(0, Math.round(Number(t.duration) || 0)), typeof t.genre === 'string' ? t.genre.slice(0, 60) : null],
      });
      const rights = (t.rights ?? {}) as Record<string, unknown>;
      statements.push({
        text: `insert into music_rights (song_id, provider, provider_track_id, rights_status, streaming_permitted, commercial_use, advertising, license, evidence)
               select id, $1, $2, 'pending', true, $3, 'unconfirmed', $4, $5 from songs where provider = $1 and provider_track_id = $2
               on conflict (provider, provider_track_id) do nothing`,
        params: [provider, trackId, PERMS.includes(String(rights.commercialUse)) ? rights.commercialUse : 'unconfirmed',
          typeof rights.license === 'string' ? rights.license.slice(0, 200) : null,
          typeof rights.basis === 'string' ? rights.basis.slice(0, 1000) : null],
      });
      await transaction(statements);
      imported++;
    } catch {
      failed++;
    }
  }
  await query('update music_providers set last_sync_at = now() where id = $1', [provider]);
  return json({ imported, failed });
}

export async function adminPruneErrors(req: Request): Promise<Response> {
  await requireAdmin(req);
  const days = Math.min(365, Math.max(1, Number((await body(req)).olderThanDays) || 7));
  const rows = await query(`delete from api_errors where created_at < now() - make_interval(days => $1) returning id`, [days]);
  return json({ deleted: rows.length });
}

