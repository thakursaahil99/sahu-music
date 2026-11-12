import { requireAccount, requireActive } from './auth';
import { HttpError, one, query } from './db';
import { body, json, refOnly, str, trackRef, uuid } from './http';

const HISTORY_KEEP = 300;
const MAX_PLAYLISTS = 200;
const MAX_PLAYLIST_TRACKS = 1000;
const MAX_FAVORITES = 5000;

/** Everything the apps show in "Your Library", in one request. */
export async function getLibrary(req: Request): Promise<Response> {
  const a = await requireAccount(req);
  const [favorites, history, playlists, songs, prefs] = await Promise.all([
    query<{ track: unknown }>('select track from favorites where user_id = $1 order by created_at desc limit 1000', [a.id]),
    query<{ track: unknown; played_at: string }>('select track, played_at from listening_history where user_id = $1 order by played_at desc limit 100', [a.id]),
    query<{ id: string; title: string; description: string | null; is_public: boolean; created_at: string }>(
      'select id, title, description, is_public, created_at from playlists where owner_id = $1 order by created_at desc',
      [a.id],
    ),
    query<{ playlist_id: string; track: unknown }>(
      `select ps.playlist_id, ps.track from playlist_songs ps join playlists p on p.id = ps.playlist_id
        where p.owner_id = $1 order by ps.position, ps.added_at`,
      [a.id],
    ),
    one<{ preferences: unknown }>('select preferences from user_preferences where user_id = $1', [a.id]),
  ]);
  const byPlaylist = new Map<string, unknown[]>();
  for (const s of songs) byPlaylist.set(s.playlist_id, [...(byPlaylist.get(s.playlist_id) ?? []), s.track]);
  return json({
    favorites: favorites.map((r) => r.track),
    history: history.map((r) => ({ track: r.track, playedAt: r.played_at })),
    playlists: playlists.map((p) => ({
      id: p.id,
      title: p.title,
      description: p.description ?? '',
      isPublic: p.is_public,
      createdAt: p.created_at,
      tracks: byPlaylist.get(p.id) ?? [],
    })),
    preferences: prefs?.preferences ?? null,
  });
}

export async function addFavorite(req: Request): Promise<Response> {
  const a = await requireActive(req);
  const t = trackRef((await body(req)).track);
  const n = await one<{ n: number }>('select count(*)::int as n from favorites where user_id = $1', [a.id]);
  if ((n?.n ?? 0) >= MAX_FAVORITES) throw new HttpError(400, `You can keep up to ${MAX_FAVORITES} favourites.`);
  await query(
    `insert into favorites (user_id, provider, provider_track_id, track) values ($1, $2, $3, $4::jsonb)
     on conflict (user_id, provider, provider_track_id) do update set track = excluded.track`,
    [a.id, t.provider, t.providerTrackId, t.json],
  );
  return json({ ok: true });
}

export async function removeFavorite(req: Request): Promise<Response> {
  const a = await requireAccount(req);
  const r = refOnly(await body(req));
  await query('delete from favorites where user_id = $1 and provider = $2 and provider_track_id = $3', [a.id, r.provider, r.providerTrackId]);
  return json({ ok: true });
}

export async function addHistory(req: Request): Promise<Response> {
  const a = await requireActive(req);
  const t = trackRef((await body(req)).track);
  await query('insert into listening_history (user_id, provider, provider_track_id, track) values ($1, $2, $3, $4::jsonb)', [a.id, t.provider, t.providerTrackId, t.json]);
  if (Math.random() < 0.1) {
    // keep the most recent plays only
    void query(
      `delete from listening_history where user_id = $1 and id not in
         (select id from listening_history where user_id = $1 order by played_at desc limit ${HISTORY_KEEP})`,
      [a.id],
    ).catch(() => undefined);
  }
  return json({ ok: true });
}

export async function clearHistory(req: Request): Promise<Response> {
  const a = await requireAccount(req);
  await query('delete from listening_history where user_id = $1', [a.id]);
  return json({ ok: true });
}

export async function createPlaylist(req: Request): Promise<Response> {
  const a = await requireActive(req);
  const b = await body(req);
  const id = uuid(b.id);
  const title = str(b.title, 'Title', { min: 1, max: 80 });
  const n = await one<{ n: number }>('select count(*)::int as n from playlists where owner_id = $1', [a.id]);
  if ((n?.n ?? 0) >= MAX_PLAYLISTS) throw new HttpError(400, `You can have up to ${MAX_PLAYLISTS} playlists.`);
  await query('insert into playlists (id, owner_id, title, is_public) values ($1, $2, $3, false)', [id, a.id, title]);
  return json({ ok: true, id }, 201);
}

/** Every playlist change checks ownership in the same statement. */
async function ownPlaylist(userId: string, id: string): Promise<void> {
  const p = await one('select 1 from playlists where id = $1 and owner_id = $2', [id, userId]);
  if (!p) throw new HttpError(404, 'Playlist not found.');
}

export async function renamePlaylist(req: Request): Promise<Response> {
  const a = await requireActive(req);
  const b = await body(req);
  const id = uuid(b.id);
  const title = str(b.title, 'Title', { min: 1, max: 80 });
  const rows = await query('update playlists set title = $3 where id = $1 and owner_id = $2 returning id', [id, a.id, title]);
  if (!rows.length) throw new HttpError(404, 'Playlist not found.');
  return json({ ok: true });
}

export async function deletePlaylist(req: Request): Promise<Response> {
  const a = await requireAccount(req);
  const id = uuid((await body(req)).id);
  await query('delete from playlists where id = $1 and owner_id = $2', [id, a.id]);
  return json({ ok: true });
}

export async function addPlaylistTrack(req: Request): Promise<Response> {
  const a = await requireActive(req);
  const b = await body(req);
  const id = uuid(b.playlistId, 'playlistId');
  const t = trackRef(b.track);
  await ownPlaylist(a.id, id);
  const n = await one<{ n: number }>('select count(*)::int as n from playlist_songs where playlist_id = $1', [id]);
  if ((n?.n ?? 0) >= MAX_PLAYLIST_TRACKS) throw new HttpError(400, `A playlist can hold up to ${MAX_PLAYLIST_TRACKS} songs.`);
  await query(
    `insert into playlist_songs (playlist_id, provider, provider_track_id, track, position)
     values ($1, $2, $3, $4::jsonb, (select coalesce(max(position), 0) + 1 from playlist_songs where playlist_id = $1))
     on conflict (playlist_id, provider, provider_track_id) do nothing`,
    [id, t.provider, t.providerTrackId, t.json],
  );
  return json({ ok: true });
}

export async function removePlaylistTrack(req: Request): Promise<Response> {
  const a = await requireAccount(req);
  const b = await body(req);
  const id = uuid(b.playlistId, 'playlistId');
  const r = refOnly(b);
  await ownPlaylist(a.id, id);
  await query('delete from playlist_songs where playlist_id = $1 and provider = $2 and provider_track_id = $3', [id, r.provider, r.providerTrackId]);
  return json({ ok: true });
}

export async function savePreferences(req: Request): Promise<Response> {
  const a = await requireAccount(req);
  const prefs = (await body(req)).preferences;
  if (!prefs || typeof prefs !== 'object' || Array.isArray(prefs)) throw new HttpError(400, 'preferences must be an object.');
  const text = JSON.stringify(prefs);
  if (text.length > 4000) throw new HttpError(413, 'Preferences too large.');
  await query(
    `insert into user_preferences (user_id, preferences, updated_at) values ($1, $2::jsonb, now())
     on conflict (user_id) do update set preferences = excluded.preferences, updated_at = now()`,
    [a.id, text],
  );
  return json({ ok: true });
}

export async function getPreferences(req: Request): Promise<Response> {
  const a = await requireAccount(req);
  const row = await one<{ preferences: unknown }>('select preferences from user_preferences where user_id = $1', [a.id]);
  return json({ preferences: row?.preferences ?? null });
}
