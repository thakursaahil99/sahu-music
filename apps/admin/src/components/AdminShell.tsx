'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { isValidEmail } from '@sahu/shared';
import { api, ApiError, BASE_PATH } from '@/lib/backend';

export interface User {
  id: string;
  email: string;
}
interface Me {
  user: User | null;
  profile: { role: 'user' | 'admin'; is_blocked: boolean } | null;
}

const NAV = [
  ['/', 'Dashboard'],
  ['/rights', 'Rights verification'],
  ['/sync', 'Catalogue sync'],
  ['/songs', 'Songs'],
  ['/artists', 'Artists'],
  ['/albums', 'Albums'],
  ['/genres', 'Genres'],
  ['/playlists', 'Playlists'],
  ['/providers', 'Music providers'],
  ['/errors', 'API errors'],
  ['/users', 'Users'],
] as const;

interface AdminCtx {
  user: User;
  notify(text: string, kind?: 'ok' | 'error'): void;
}
const Ctx = createContext<AdminCtx | null>(null);
export function useAdmin(): AdminCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAdmin outside AdminShell');
  return v;
}

function Brand() {
  return (
    <div className="flex items-center gap-3">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`${BASE_PATH}/logo.png`} alt="" width={36} height={36} className="rounded-lg" />
      <div className="leading-tight">
        <p className="text-sm font-extrabold tracking-[0.18em] text-white">
          SAHU <span className="text-gold">MUSIC</span>
        </p>
        <p className="text-[11px] text-muted">Admin console</p>
      </div>
    </div>
  );
}

function Centered({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-ink p-4">
      <div className="card w-full max-w-md">
        <Brand />
        <div className="mt-6">{children}</div>
      </div>
    </div>
  );
}

function Login({ onSignedIn }: { onSignedIn: (me: Me) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <Centered>
      <h1 className="text-xl font-bold text-white">Administrator sign-in</h1>
      <p className="mt-1 text-sm text-muted">Only accounts with the admin role can use this console.</p>
      <form
        className="mt-5 space-y-4"
        noValidate
        onSubmit={async (e) => {
          e.preventDefault();
          setError(null);
          if (!isValidEmail(email.trim())) return setError('Enter a valid email address.');
          if (!password) return setError('Enter your password.');
          setBusy(true);
          try {
            onSignedIn(await api<Me>('POST', 'auth/login', { email: email.trim().toLowerCase(), password, client: 'admin' }));
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Sign-in failed.');
          }
          setBusy(false);
        }}
      >
        <div>
          <label htmlFor="email" className="mb-1 block text-sm text-white">Email</label>
          <input id="email" type="email" autoComplete="username" className="input" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={254} />
        </div>
        <div>
          <label htmlFor="password" className="mb-1 block text-sm text-white">Password</label>
          <input id="password" type="password" autoComplete="current-password" className="input" value={password} onChange={(e) => setPassword(e.target.value)} maxLength={128} />
        </div>
        {error && <p className="rounded-lg bg-red-950/60 px-3 py-2 text-sm text-red-300" role="alert">{error}</p>}
        <button type="submit" className="btn-gold w-full" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
    </Centered>
  );
}

export function AdminShell({ children }: { children: ReactNode }) {
  const pathname = (usePathname() || '/').replace(/(.)\/$/, '$1');
  const [user, setUser] = useState<User | null>(null);
  const [state, setState] = useState<'loading' | 'signed-out' | 'admin' | 'denied' | 'no-backend'>('loading');
  const [toast, setToast] = useState<{ text: string; kind: 'ok' | 'error' } | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  // The UI check is a convenience only. The backend checks the admin role on every request.
  const apply = useCallback((me: Me) => {
    setUser(me.user);
    setState(!me.user ? 'signed-out' : me.profile?.role === 'admin' && !me.profile.is_blocked ? 'admin' : 'denied');
  }, []);

  useEffect(() => {
    api<Me>('GET', 'auth/me').then(apply, (e) => setState(e instanceof ApiError && (e.status === 404 || e.status === 503) ? 'no-backend' : 'signed-out'));
  }, [apply]);

  const signOut = useCallback(async () => {
    await api('POST', 'auth/logout', {}).catch(() => undefined);
    setUser(null);
    setState('signed-out');
  }, []);

  useEffect(() => setMenuOpen(false), [pathname]);

  const notify = useCallback((text: string, kind: 'ok' | 'error' = 'ok') => {
    setToast({ text, kind });
    setTimeout(() => setToast(null), 4000);
  }, []);

  if (state === 'no-backend') {
    return (
      <Centered>
        <h1 className="text-xl font-bold text-white">The backend is not configured</h1>
        <p className="mt-2 text-sm text-white/75">
          This copy of the site has no backend (for example a local static server), so you cannot sign in here. The admin console needs the SAHU MUSIC API and its Neon database.
        </p>
        <a href="https://sahu-music.vercel.app/admin/" className="btn-gold mt-5 w-full">Open the live admin console</a>
        <p className="mt-3 text-xs text-muted">
          To run it locally with the database: <code className="text-gold">vercel env pull .env.neon</code>, <code className="text-gold">npm run build:site</code>, then <code className="text-gold">npm run serve -- --env-file .env.neon</code>.
        </p>
      </Centered>
    );
  }
  if (state === 'loading') return <Centered><p className="text-sm text-muted">Checking access…</p></Centered>;
  if (state === 'signed-out' || !user) return <Login onSignedIn={apply} />;
  if (state === 'denied') {
    return (
      <Centered>
        <h1 className="text-xl font-bold text-white">Access denied</h1>
        <p className="mt-2 text-sm text-white/75">{user.email} is not an administrator. An existing admin must grant the admin role (or the project owner runs <code className="text-gold">npm run admin -- {user.email}</code>).</p>
        <button type="button" className="btn-outline mt-5" onClick={() => void signOut()}>Sign out</button>
      </Centered>
    );
  }

  return (
    <Ctx.Provider value={{ user, notify }}>
      <div className="flex min-h-dvh bg-ink">
        <aside className={`fixed inset-y-0 left-0 z-40 w-64 shrink-0 flex-col border-r border-coal-line bg-[#0a0a0a] p-5 md:static md:flex ${menuOpen ? 'flex' : 'hidden'}`}>
          <Brand />
          <nav className="mt-6 flex flex-1 flex-col gap-0.5 overflow-y-auto" aria-label="Admin">
            {NAV.map(([href, label]) => {
              const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
              return (
                <Link key={href} href={href} aria-current={active ? 'page' : undefined} className={`rounded-lg px-3 py-2 text-sm font-medium ${active ? 'bg-coal text-gold' : 'text-white/80 hover:bg-coal hover:text-white'}`}>
                  {label}
                </Link>
              );
            })}
          </nav>
          <div className="border-t border-coal-line pt-3">
            <p className="truncate text-xs text-muted">{user.email}</p>
            <button type="button" className="mt-2 text-sm font-semibold text-gold" onClick={() => void signOut()}>Sign out</button>
          </div>
        </aside>
        {menuOpen && <button type="button" className="fixed inset-0 z-30 bg-black/60 md:hidden" aria-label="Close menu" onClick={() => setMenuOpen(false)} />}

        <div className="min-w-0 flex-1">
          <header className="sticky top-0 z-20 flex items-center justify-between border-b border-coal-line bg-ink/95 px-4 py-3 md:hidden">
            <Brand />
            <button type="button" className="btn-outline !px-3 !py-1.5" onClick={() => setMenuOpen(true)} aria-label="Open menu">Menu</button>
          </header>
          <main className="mx-auto w-full max-w-7xl p-4 md:p-8">{children}</main>
        </div>

        {toast && (
          <div className="fixed inset-x-0 bottom-6 z-50 flex justify-center px-4" role="status" aria-live="polite">
            <div className={`max-w-xl rounded-xl px-4 py-2.5 text-sm font-medium shadow-lg ${toast.kind === 'error' ? 'bg-red-600 text-white' : 'bg-gold text-ink'}`}>{toast.text}</div>
          </div>
        )}
      </div>
    </Ctx.Provider>
  );
}

export function PageTitle({ title, subtitle, children }: { title: string; subtitle?: string; children?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-extrabold text-white">{title}</h1>
        {subtitle && <p className="mt-1 max-w-3xl text-sm text-muted">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}
