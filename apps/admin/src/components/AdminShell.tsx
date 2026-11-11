'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { User } from '@supabase/supabase-js';
import { isValidEmail } from '@sahu/shared';
import { supabase } from '@/lib/supabase';

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
      <img src="/logo.png" alt="" width={36} height={36} className="rounded-lg" />
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

function Login() {
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
          const { error: err } = await supabase!.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
          setBusy(false);
          if (err) setError(err.message);
        }}
      >
        <div>
          <label htmlFor="email" className="mb-1 block text-sm text-white">Email</label>
          <input id="email" type="email" autoComplete="username" className="input" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={254} />
        </div>
        <div>
          <label htmlFor="password" className="mb-1 block text-sm text-white">Password</label>
          <input id="password" type="password" autoComplete="current-password" className="input" value={password} onChange={(e) => setPassword(e.target.value)} maxLength={72} />
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
  const [state, setState] = useState<'loading' | 'signed-out' | 'checking' | 'admin' | 'denied'>(supabase ? 'loading' : 'signed-out');
  const [toast, setToast] = useState<{ text: string; kind: 'ok' | 'error' } | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null);
      setState(data.session ? 'checking' : 'signed-out');
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null);
      setState(session ? 'checking' : 'signed-out');
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // The UI check is a convenience only. Real enforcement is Row Level Security in the database.
  const uid = user?.id;
  useEffect(() => {
    if (!supabase || !uid) return;
    let alive = true;
    supabase
      .from('profiles')
      .select('role, is_blocked')
      .eq('id', uid)
      .maybeSingle()
      .then(({ data }) => alive && setState(data?.role === 'admin' && !data.is_blocked ? 'admin' : 'denied'));
    return () => {
      alive = false;
    };
  }, [uid]);

  useEffect(() => setMenuOpen(false), [pathname]);

  const notify = useCallback((text: string, kind: 'ok' | 'error' = 'ok') => {
    setToast({ text, kind });
    setTimeout(() => setToast(null), 4000);
  }, []);

  if (!supabase) {
    return (
      <Centered>
        <h1 className="text-xl font-bold text-white">Supabase is not configured</h1>
        <p className="mt-2 text-sm text-white/75">The admin console needs a database. Create a free Supabase project, run the SQL files in <code className="text-gold">supabase/migrations</code>, then add to <code className="text-gold">apps/admin/.env.local</code>:</p>
        <pre className="mt-3 overflow-x-auto rounded-lg bg-ink p-3 text-xs text-gold-soft">{`NEXT_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT.supabase.co\nNEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key`}</pre>
        <p className="mt-3 text-xs text-muted">Use the anon key only. Never put the service-role key in this app. Restart the dev server after editing the file.</p>
      </Centered>
    );
  }
  if (state === 'loading' || state === 'checking') return <Centered><p className="text-sm text-muted">Checking access…</p></Centered>;
  if (state === 'signed-out' || !user) return <Login />;
  if (state === 'denied') {
    return (
      <Centered>
        <h1 className="text-xl font-bold text-white">Access denied</h1>
        <p className="mt-2 text-sm text-white/75">{user.email} is not an administrator. An existing admin (or the project owner, via the SQL editor) must grant the admin role.</p>
        <button type="button" className="btn-outline mt-5" onClick={() => void supabase!.auth.signOut()}>Sign out</button>
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
            <button type="button" className="mt-2 text-sm font-semibold text-gold" onClick={() => void supabase!.auth.signOut()}>Sign out</button>
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
