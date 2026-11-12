import { hashPassword, requireAdmin, validatePassword } from './auth';
import { HttpError, one, query, transaction } from './db';
import { body, json, uuid } from './http';

/**
 * Admin view of the people using SAHU MUSIC: who signed up, when they were last active, and
 * everything their account holds. Password hashes and session tokens are never returned.
 */

const SORTS: Record<string, string> = {
  newest: 'p.created_at desc',
  oldest: 'p.created_at asc',
  active: 'p.last_seen_at desc nulls last',
  name: 'lower(coalesce(p.display_name, u.email::text)) asc',
};
const FILTERS: Record<string, string> = {
  all: 'true',
  admins: "p.role = 'admin'",
  blocked: 'p.is_blocked',
  active7d: "p.last_seen_at > now() - interval '7 days'",
  new7d: "p.created_at > now() - interval '7 days'",
};

export async function adminUsers(req: Request): Promise<Response> {
  await requireAdmin(req);
  const b = await body(req);
  const limit = Math.min(100, Math.max(1, Number(b.limit) || 25));
  const offset = Math.max(0, Math.min(1_000_000, Number(b.offset) || 0));
  const sort = SORTS[String(b.sort)] ?? SORTS.newest;
  const filter = FILTERS[String(b.filter)] ?? FILTERS.all;
  const term = typeof b.search === 'string' ? b.search.trim().slice(0, 80) : '';
  const params: unknown[] = [limit, offset];
  let where = filter;
  if (term) {
    params.push(`%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
    where += ` and (u.email::text ilike $3 or p.display_name ilike $3)`;
  }
  const rows = await query(
    `select p.id, u.email::text as email, p.display_name, p.role, p.is_blocked, p.created_at, p.last_seen_at,
            (select count(*) from favorites f where f.user_id = p.id)::int as favorites,
            (select count(*) from playlists l where l.owner_id = p.id)::int as playlists,
            (select count(*) from listening_history h where h.user_id = p.id)::int as plays,
            (select count(*) from sessions s where s.user_id = p.id and s.expires_at > now())::int as sessions,
            count(*) over()::int as __count
       from profiles p join users u on u.id = p.id
      where ${where}
      order by ${sort} limit $1 offset $2`,
    params,
  );
  const count = (rows[0]?.__count as number | undefined) ?? 0;
  for (const r of rows) delete r.__count;
  return json({ rows, count });
}

export async function adminUser(req: Request): Promise<Response> {
  await requireAdmin(req);
  const id = uuid((await body(req)).id);
  const account = await one(
    `select p.id, u.email::text as email, p.display_name, p.avatar_url, p.role, p.is_blocked, p.created_at, p.last_seen_at,
            (select preferences from user_preferences where user_id = p.id) as preferences,
            (select count(*) from favorites f where f.user_id = p.id)::int as favorites,
            (select count(*) from playlists l where l.owner_id = p.id)::int as playlists,
            (select count(*) from listening_history h where h.user_id = p.id)::int as plays
       from profiles p join users u on u.id = p.id where p.id = $1`,
    [id],
  );
  if (!account) throw new HttpError(404, 'User not found.');
  const [playlists, favorites, history, sessions] = await Promise.all([
    query(
      `select l.id, l.title, l.description, l.is_public, l.created_at,
              coalesce((select jsonb_agg(ps.track order by ps.position) from playlist_songs ps where ps.playlist_id = l.id), '[]'::jsonb) as tracks
         from playlists l where l.owner_id = $1 order by l.created_at desc`,
      [id],
    ),
    query('select track, created_at from favorites where user_id = $1 order by created_at desc limit 200', [id]),
    query('select track, played_at from listening_history where user_id = $1 order by played_at desc limit 200', [id]),
    query(
      `select client, created_at, expires_at from sessions where user_id = $1 and expires_at > now() order by created_at desc`,
      [id],
    ),
  ]);
  return json({ account, playlists, favorites, history, sessions });
}

export async function adminUserAction(req: Request): Promise<Response> {
  const admin = await requireAdmin(req);
  const b = await body(req);
  const id = uuid(b.id);
  const op = String(b.op ?? '');
  const self = id === admin.id;
  const exists = await one('select 1 from profiles where id = $1', [id]);
  if (!exists) throw new HttpError(404, 'User not found.');
  if (self && ['remove-admin', 'block', 'delete'].includes(op)) throw new HttpError(400, 'You cannot do that to your own account.');

  switch (op) {
    case 'make-admin':
      await query(`update profiles set role = 'admin' where id = $1`, [id]);
      break;
    case 'remove-admin':
      await query(`update profiles set role = 'user' where id = $1`, [id]);
      break;
    case 'block':
      // blocked: signed out everywhere and cannot save data (can still listen as a guest)
      await transaction([
        { text: 'update profiles set is_blocked = true where id = $1', params: [id] },
        { text: 'delete from sessions where user_id = $1', params: [id] },
      ]);
      break;
    case 'unblock':
      await query('update profiles set is_blocked = false where id = $1', [id]);
      break;
    case 'sign-out':
      await query('delete from sessions where user_id = $1', [id]);
      break;
    case 'reset-password': {
      const password = validatePassword(b.password);
      await transaction([
        { text: 'update users set password_hash = $2 where id = $1', params: [id, await hashPassword(password)] },
        { text: 'delete from sessions where user_id = $1', params: [id] },
      ]);
      break;
    }
    case 'rename': {
      const name = typeof b.displayName === 'string' ? b.displayName.trim() : '';
      if (name.length < 1 || name.length > 50) throw new HttpError(400, 'Name must be 1–50 characters.');
      await query('update profiles set display_name = $2 where id = $1', [id, name]);
      break;
    }
    case 'delete':
      // removes the account and everything it owns (profile, library, sessions) through foreign keys
      await query('delete from users where id = $1', [id]);
      break;
    default:
      throw new HttpError(400, 'Unknown action.');
  }
  return json({ ok: true });
}
