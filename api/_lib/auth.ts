import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from 'node:crypto';
import { HttpError, one, query } from './db';
import { assertSameOrigin, clientIp, cookie } from './http';

export const SESSION_COOKIE = 'sahu_session';
const SESSION_DAYS = 30;

export interface Account {
  id: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
  role: 'user' | 'admin';
  isBlocked: boolean;
}

// ── passwords (scrypt, per-user salt, parameters stored with the hash) ──
const N = 32768;
const R = 8;
const P = 1;
const KEYLEN = 64;

function scrypt(password: string, salt: Buffer, n: number, r: number, p: number): Promise<Buffer> {
  const opts: ScryptOptions = { N: n, r, p, maxmem: 128 * n * r * 2 };
  return new Promise((res, rej) => scryptCb(password.normalize('NFKC'), salt, KEYLEN, opts, (e, key) => (e ? rej(e) : res(key))));
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, N, R, P);
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [alg, n, r, p, salt, hash] = stored.split('$');
  if (alg !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64');
  const key = await scrypt(password, Buffer.from(salt, 'base64'), Number(n), Number(r), Number(p));
  return key.length === expected.length && timingSafeEqual(key, expected);
}

/** Spend the same time on unknown emails as on wrong passwords, so emails cannot be probed by timing. */
const DUMMY = `scrypt$${N}$${R}$${P}$${Buffer.alloc(16).toString('base64')}$${Buffer.alloc(KEYLEN).toString('base64')}`;
export async function burnPasswordCheck(password: string): Promise<void> {
  await verifyPassword(password, DUMMY);
}

export function validatePassword(v: unknown): string {
  if (typeof v !== 'string' || v.length < 8) throw new HttpError(400, 'Password must be at least 8 characters.');
  if (v.length > 128) throw new HttpError(400, 'Password is too long (max 128 characters).');
  return v;
}

export function validateEmail(v: unknown): string {
  const e = typeof v === 'string' ? v.trim().toLowerCase() : '';
  if (e.length < 3 || e.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e)) throw new HttpError(400, 'Enter a valid email address.');
  return e;
}

// ── sessions (random token; only its SHA-256 is stored) ──
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

export async function createSession(userId: string, client: 'web' | 'mobile' | 'admin'): Promise<{ token: string; cookie: string; expiresAt: string }> {
  const token = randomBytes(32).toString('base64url');
  const expires = new Date(Date.now() + SESSION_DAYS * 864e5);
  await query('insert into sessions (token_hash, user_id, client, expires_at) values ($1, $2, $3, $4)', [sha256(token), userId, client, expires.toISOString()]);
  return { token, cookie: sessionCookie(token, SESSION_DAYS * 86400), expiresAt: expires.toISOString() };
}

export function sessionCookie(value: string, maxAge: number): string {
  return `${SESSION_COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

function tokenFrom(req: Request): { token: string; viaCookie: boolean } | null {
  const auth = req.headers.get('authorization');
  if (auth?.startsWith('Bearer ')) return { token: auth.slice(7).trim(), viaCookie: false };
  const c = cookie(req, SESSION_COOKIE);
  return c ? { token: c, viaCookie: true } : null;
}

/** The signed-in account, or null for guests. Cookie-based writes must come from this site. */
export async function currentAccount(req: Request): Promise<Account | null> {
  const t = tokenFrom(req);
  if (!t || t.token.length < 20 || t.token.length > 100) return null;
  if (t.viaCookie && req.method !== 'GET' && req.method !== 'HEAD') assertSameOrigin(req);
  const row = await one<{ id: string; email: string; display_name: string | null; avatar_url: string | null; role: 'user' | 'admin'; is_blocked: boolean; expires_at: string }>(
    `select u.id, u.email::text as email, p.display_name, p.avatar_url, p.role, p.is_blocked, s.expires_at
       from sessions s join users u on u.id = s.user_id join profiles p on p.id = u.id
      where s.token_hash = $1 and s.expires_at > now()`,
    [sha256(t.token)],
  );
  if (!row) return null;
  // sliding expiry: renew once less than half the lifetime is left
  if (new Date(row.expires_at).getTime() - Date.now() < (SESSION_DAYS / 2) * 864e5) {
    void query('update sessions set expires_at = $2 where token_hash = $1', [sha256(t.token), new Date(Date.now() + SESSION_DAYS * 864e5).toISOString()]).catch(() => undefined);
  }
  return { id: row.id, email: row.email, displayName: row.display_name, avatarUrl: row.avatar_url, role: row.role, isBlocked: row.is_blocked };
}

export async function requireAccount(req: Request): Promise<Account> {
  const a = await currentAccount(req);
  if (!a) throw new HttpError(401, 'Please sign in.');
  return a;
}

/** Signed in and allowed to save data (blocked users can still listen as guests). */
export async function requireActive(req: Request): Promise<Account> {
  const a = await requireAccount(req);
  if (a.isBlocked) throw new HttpError(403, 'This account is blocked.');
  return a;
}

export async function requireAdmin(req: Request): Promise<Account> {
  const a = await requireAccount(req);
  if (a.role !== 'admin' || a.isBlocked) throw new HttpError(403, 'Administrators only.');
  return a;
}

export async function endSession(req: Request): Promise<void> {
  const t = tokenFrom(req);
  if (t) await query('delete from sessions where token_hash = $1', [sha256(t.token)]);
}

// ── rate limiting (failed sign-ins per email and per IP) ──
export async function assertNotLimited(req: Request, email: string): Promise<void> {
  const ip = clientIp(req);
  const r = await one<{ by_email: number; by_ip: number }>(
    `select count(*) filter (where email = $1)::int as by_email, count(*) filter (where ip = $2)::int as by_ip
       from auth_failures where created_at > now() - interval '15 minutes' and (email = $1 or ip = $2)`,
    [email, ip],
  );
  if (r && (r.by_email >= 8 || r.by_ip >= 40)) throw new HttpError(429, 'Too many attempts. Wait 15 minutes and try again.');
}

export async function recordFailure(req: Request, email: string): Promise<void> {
  await query('insert into auth_failures (email, ip) values ($1, $2)', [email, clientIp(req)]);
  if (Math.random() < 0.05) {
    void query(`delete from auth_failures where created_at < now() - interval '1 day'`).catch(() => undefined);
    void query('delete from sessions where expires_at < now()').catch(() => undefined);
  }
}

export function publicAccount(a: Account) {
  return {
    user: { id: a.id, email: a.email },
    profile: { id: a.id, display_name: a.displayName, avatar_url: a.avatarUrl, role: a.role, is_blocked: a.isBlocked },
  };
}
