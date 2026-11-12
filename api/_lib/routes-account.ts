import {
  assertNotLimited,
  burnPasswordCheck,
  createSession,
  currentAccount,
  endSession,
  hashPassword,
  publicAccount,
  recordFailure,
  requireAccount,
  requireActive,
  sessionCookie,
  validateEmail,
  validatePassword,
  verifyPassword,
} from './auth';
import { HttpError, one, query, transaction } from './db';
import { assertSameOrigin, body, clientIp, json, str } from './http';

type Client = 'web' | 'mobile' | 'admin';
const clientOf = (v: unknown): Client => (v === 'mobile' || v === 'admin' ? v : 'web');

/** Web clients get an HttpOnly cookie; the mobile app gets the token in the body (it has no cookie jar). */
function signedIn(account: Parameters<typeof publicAccount>[0], s: { token: string; cookie: string; expiresAt: string }, client: Client, status = 200) {
  const payload = { ...publicAccount(account), ...(client === 'mobile' ? { token: s.token, expiresAt: s.expiresAt } : {}) };
  return json(payload, status, client === 'mobile' ? {} : { 'Set-Cookie': s.cookie });
}

export async function signup(req: Request): Promise<Response> {
  assertSameOrigin(req);
  const b = await body(req);
  const email = validateEmail(b.email);
  const password = validatePassword(b.password);
  const displayName = str(b.displayName, 'Name', { min: 1, max: 50, required: false }) || email.split('@')[0].slice(0, 50);
  const client = clientOf(b.client);

  // at most 10 new accounts per network per hour
  const recent = await one<{ n: number }>(`select count(*)::int as n from auth_failures where email = '#signup' and ip = $1 and created_at > now() - interval '1 hour'`, [clientIp(req)]);
  if ((recent?.n ?? 0) >= 10) throw new HttpError(429, 'Too many new accounts from this network. Try again later.');

  const exists = await one('select 1 from users where email = $1', [email]);
  if (exists) throw new HttpError(409, 'An account with this email already exists. Log in instead.');

  const hash = await hashPassword(password);
  const [[user]] = await transaction([
    { text: 'insert into users (email, password_hash) values ($1, $2) returning id', params: [email, hash] },
    { text: 'insert into profiles (id, display_name) select id, $2 from users where email = $1', params: [email, displayName] },
    { text: `insert into auth_failures (email, ip) values ('#signup', $1)`, params: [clientIp(req)] },
  ]);
  const id = String(user.id);
  const s = await createSession(id, client);
  return signedIn({ id, email, displayName, avatarUrl: null, role: 'user', isBlocked: false }, s, client, 201);
}

export async function login(req: Request): Promise<Response> {
  assertSameOrigin(req);
  const b = await body(req);
  const email = validateEmail(b.email);
  const password = typeof b.password === 'string' ? b.password.slice(0, 128) : '';
  const client = clientOf(b.client);
  await assertNotLimited(req, email);

  const row = await one<{ id: string; password_hash: string; display_name: string | null; avatar_url: string | null; role: 'user' | 'admin'; is_blocked: boolean }>(
    `select u.id, u.password_hash, p.display_name, p.avatar_url, p.role, p.is_blocked
       from users u join profiles p on p.id = u.id where u.email = $1`,
    [email],
  );
  const ok = row ? await verifyPassword(password, row.password_hash) : (await burnPasswordCheck(password), false);
  if (!row || !ok) {
    await recordFailure(req, email);
    throw new HttpError(401, 'Wrong email or password.');
  }
  if (client === 'admin' && (row.role !== 'admin' || row.is_blocked)) throw new HttpError(403, 'This account is not an administrator.');
  const s = await createSession(row.id, client);
  return signedIn({ id: row.id, email, displayName: row.display_name, avatarUrl: row.avatar_url, role: row.role, isBlocked: row.is_blocked }, s, client);
}

export async function logout(req: Request): Promise<Response> {
  await endSession(req);
  return json({ ok: true }, 200, { 'Set-Cookie': sessionCookie('', 0) });
}

export async function me(req: Request): Promise<Response> {
  const a = await currentAccount(req);
  return json(a ? publicAccount(a) : { user: null, profile: null });
}

export async function updateProfile(req: Request): Promise<Response> {
  const a = await requireActive(req);
  const b = await body(req);
  const displayName = str(b.displayName, 'Name', { min: 1, max: 50 });
  await query('update profiles set display_name = $2 where id = $1', [a.id, displayName]);
  return json({ ok: true, display_name: displayName });
}

export async function changePassword(req: Request): Promise<Response> {
  const a = await requireAccount(req);
  const b = await body(req);
  const next = validatePassword(b.newPassword);
  const row = await one<{ password_hash: string }>('select password_hash from users where id = $1', [a.id]);
  if (!row || !(await verifyPassword(typeof b.currentPassword === 'string' ? b.currentPassword : '', row.password_hash))) {
    await recordFailure(req, a.email);
    throw new HttpError(401, 'Current password is wrong.');
  }
  await transaction([
    { text: 'update users set password_hash = $2 where id = $1', params: [a.id, await hashPassword(next)] },
    // sign out every other device
    { text: 'delete from sessions where user_id = $1', params: [a.id] },
  ]);
  const s = await createSession(a.id, clientOf(b.client));
  return signedIn(a, s, clientOf(b.client));
}

export async function deleteAccount(req: Request): Promise<Response> {
  const a = await requireAccount(req);
  const b = await body(req);
  const row = await one<{ password_hash: string }>('select password_hash from users where id = $1', [a.id]);
  if (!row || !(await verifyPassword(typeof b.password === 'string' ? b.password : '', row.password_hash))) {
    await recordFailure(req, a.email);
    throw new HttpError(401, 'Password is wrong.');
  }
  await query('delete from users where id = $1', [a.id]);
  return json({ ok: true }, 200, { 'Set-Cookie': sessionCookie('', 0) });
}
