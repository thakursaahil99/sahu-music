'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { sanitizeQuery } from '@sahu/shared';
import { useAuth } from '@/lib/auth';
import { useOnline } from '@/lib/hooks';
import { music } from '@/lib/music';
import { usePlayer } from '@/lib/player';
import { Icon, type IconName } from './icons';
import { Logo } from './Logo';
import { FullPlayer, MiniPlayer } from './players';
import { usePwaInstall } from './Pwa';
import { VideoStage } from './VideoStage';

const NAV: { href: string; label: string; icon: IconName }[] = [
  { href: '/', label: 'Home', icon: 'home' },
  { href: '/explore', label: 'Explore', icon: 'compass' },
  { href: '/search', label: 'Search', icon: 'search' },
  { href: '/library', label: 'Library', icon: 'library' },
];

const norm = (p: string) => (p.length > 1 ? p.replace(/\/$/, '') : p);

function useDemoMode(): boolean {
  const [demo, setDemo] = useState(false);
  useEffect(() => {
    setDemo(music.isDemoMode());
    return music.onDemoModeChange(setDemo);
  }, []);
  return demo;
}

function InstallButton({ className = '' }: { className?: string }) {
  const { canInstall, install } = usePwaInstall();
  if (!canInstall) return null;
  return (
    <button type="button" onClick={() => void install()} className={`btn-outline whitespace-nowrap !px-4 !py-2 ${className}`}>
      <Icon name="download" size={16} /> Install
    </button>
  );
}

/** Desktop top-bar search: Enter jumps straight to results. */
function QuickSearch() {
  const router = useRouter();
  const [q, setQ] = useState('');
  return (
    <form
      role="search"
      className="relative w-full max-w-md"
      onSubmit={(e) => {
        e.preventDefault();
        const query = sanitizeQuery(q);
        router.push(query ? `/search/?q=${encodeURIComponent(query)}` : '/search/');
        setQ('');
      }}
    >
      <Icon name="search" size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted" />
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        maxLength={80}
        placeholder="Search songs, artists, playlists…"
        aria-label="Search songs, artists and playlists"
        className="w-full rounded-full border border-white/10 bg-white/5 py-2.5 pl-11 pr-4 text-sm text-white transition placeholder:text-muted focus:border-gold focus:bg-white/10 focus:outline-none"
      />
    </form>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const pathname = norm(usePathname() || '/');
  const { user, profile, configured } = useAuth();
  const { current } = usePlayer();
  const online = useOnline();
  const demo = useDemoMode();
  const mainRef = useRef<HTMLElement>(null);

  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 });
  }, [pathname]);

  const isActive = (href: string) => (href === '/' ? pathname === '/' : pathname.startsWith(href));
  const accountHref = user ? '/profile' : '/login';
  const accountLabel = user ? profile?.display_name || 'Profile' : configured ? 'Log in' : 'Guest';
  const sideLink = 'flex items-center gap-3 rounded-xl px-3 py-2 text-sm text-white/70 transition hover:bg-white/[0.06] hover:text-white';

  return (
    <div className="relative flex h-dvh flex-col overflow-hidden bg-ink md:gap-2 md:p-2">
      {/* ambient glow behind everything (decorative) */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        <div className="ambient ambient-a" />
        <div className="ambient ambient-b" />
      </div>

      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[90] focus:rounded focus:bg-gold focus:px-3 focus:py-2 focus:text-ink">
        Skip to content
      </a>
      <div className="relative flex min-h-0 flex-1 md:gap-2">
        {/* Desktop sidebar: a floating panel */}
        <aside className="panel hidden w-64 shrink-0 flex-col overflow-y-auto p-5 backdrop-blur-xl md:flex">
          <Link href="/" aria-label="SAHU MUSIC home" className="transition hover:opacity-90">
            <Logo />
          </Link>
          <nav className="mt-8 flex flex-col gap-1" aria-label="Main">
            {NAV.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                aria-current={isActive(n.href) ? 'page' : undefined}
                className={`group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
                  isActive(n.href) ? 'bg-gradient-to-r from-gold/20 via-gold/10 to-transparent text-white ring-1 ring-gold/25' : 'text-white/70 hover:bg-white/[0.06] hover:text-white'
                }`}
              >
                <span className={`flex h-8 w-8 items-center justify-center rounded-lg transition ${isActive(n.href) ? 'bg-gold text-ink shadow-glow' : 'bg-white/[0.06] text-white/80 group-hover:text-gold'}`}>
                  <Icon name={n.icon} size={18} />
                </span>
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="mt-6 border-t border-white/5 pt-4">
            <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[0.22em] text-white/40">Your music</p>
            <Link href="/library?tab=favorites" className={sideLink}>
              <Icon name="heart" size={18} /> Favourites
            </Link>
            <Link href="/library?tab=history" className={sideLink}>
              <Icon name="clock" size={18} /> History
            </Link>
            <Link href="/download" className={`${sideLink} ${isActive('/download') ? '!text-gold' : ''}`}>
              <Icon name="download" size={18} /> Get the app
            </Link>
            <Link href="/settings" className={sideLink}>
              <Icon name="settings" size={18} /> Settings
            </Link>
          </div>
          <div className="mt-auto space-y-3">
            <InstallButton className="w-full" />
            <Link href={accountHref} className="surface surface-hover flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-semibold text-white">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-gold-soft to-gold-deep text-ink">
                <Icon name="user" size={18} />
              </span>
              <span className="truncate">{accountLabel}</span>
            </Link>
          </div>
        </aside>

        <main id="main" ref={mainRef} className="main-panel min-w-0 flex-1 overflow-y-auto md:rounded-3xl md:ring-1 md:ring-white/[0.07]" tabIndex={-1}>
          {/* Mobile top bar */}
          <header className="glass sticky top-0 z-20 flex items-center justify-between border-b border-white/5 px-4 py-3 md:hidden">
            <Link href="/" aria-label="SAHU MUSIC home">
              <Logo compact />
            </Link>
            <div className="flex items-center gap-1">
              <InstallButton className="!px-3 !py-1.5 text-xs" />
              <Link href="/download" className="icon-btn text-white/80" aria-label="Get the app">
                <Icon name="download" size={20} />
              </Link>
              <Link href="/settings" className="icon-btn text-white/80" aria-label="Settings">
                <Icon name="settings" size={20} />
              </Link>
              <Link href={accountHref} className="icon-btn text-white/80" aria-label={user ? 'Profile' : 'Log in'}>
                <Icon name="user" size={20} />
              </Link>
            </div>
          </header>

          {/* Desktop top bar */}
          <header className="glass sticky top-0 z-20 hidden items-center gap-4 border-b border-white/5 px-8 py-3 md:flex md:rounded-t-3xl">
            <div className="flex-1">{!pathname.startsWith('/search') && <QuickSearch />}</div>
            <Link href="/download" className="btn-gold !px-4 !py-2">
              <Icon name="download" size={16} /> Get the app
            </Link>
          </header>

          {!online && (
            <div className="flex items-center justify-center gap-2 bg-red-900/60 px-4 py-2 text-center text-sm text-white" role="status">
              <Icon name="wifiOff" size={16} /> You are offline. Browsing cached pages; streaming needs a connection.
            </div>
          )}
          {demo && online && (
            <div className="bg-gold/15 px-4 py-2 text-center text-sm text-gold-soft" role="status">
              Demo mode: showing original SAHU MUSIC sample audio because the live catalogue is {process.env.NEXT_PUBLIC_DEMO_MODE === 'true' ? 'switched off' : 'unreachable'}.
            </div>
          )}

          {/* keyed by route so every page fades up as it opens */}
          <div key={pathname} className="mx-auto w-full max-w-[1500px] animate-fade-up px-4 py-6 md:px-8 md:py-8">
            {children}
          </div>

          <footer className="mx-auto w-full max-w-[1500px] border-t border-white/5 px-4 py-8 text-xs text-muted md:px-8">
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
              <span>© {new Date().getFullYear()} SAHU MUSIC · Har Gaana, Ek Jagah.</span>
              <Link href="/about" className="hover:text-white">About</Link>
              <Link href="/download" className="hover:text-white">Download app</Link>
              <Link href="/privacy" className="hover:text-white">Privacy</Link>
              <Link href="/terms" className="hover:text-white">Terms</Link>
              <a href="https://audius.co" target="_blank" rel="noopener noreferrer" className="hover:text-white">Music via Audius</a>
              {music.previewsAllowed && <a href="https://music.apple.com" target="_blank" rel="noopener noreferrer" className="hover:text-white">Previews via Apple Music</a>}
            </div>
          </footer>
        </main>
      </div>

      <MiniPlayer />

      {/* Mobile bottom navigation */}
      <nav className="pb-safe relative grid grid-cols-4 border-t border-white/5 bg-black/80 backdrop-blur-xl md:hidden" aria-label="Main">
        {NAV.map((n) => (
          <Link
            key={n.href}
            href={n.href}
            aria-current={isActive(n.href) ? 'page' : undefined}
            className={`flex flex-col items-center gap-1 py-2 text-[11px] font-medium transition active:scale-90 ${isActive(n.href) ? 'text-gold' : 'text-white/70'}`}
          >
            <span className={`transition-transform duration-300 ${isActive(n.href) ? '-translate-y-0.5 scale-110' : ''}`}>
              <Icon name={n.icon} size={22} />
            </span>
            {n.label}
          </Link>
        ))}
      </nav>

      <FullPlayer />
      <VideoStage />
      {/* keeps layout stable for screen readers when nothing is playing */}
      {!current && <span className="sr-only" aria-live="polite">Nothing is playing</span>}
    </div>
  );
}
