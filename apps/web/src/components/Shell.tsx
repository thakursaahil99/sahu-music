'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useAuth } from '@/lib/auth';
import { useSongColor } from '@/lib/color';
import { useOnline } from '@/lib/hooks';
import { music } from '@/lib/music';
import { usePlayer } from '@/lib/player';
import { Icon, type IconName } from './icons';
import { BuiltByBadge, Logo, LogoMark } from './Logo';
import { FullPlayer, MiniPlayer } from './players';
import { usePwaInstall } from './Pwa';
import { QuickSearch } from './QuickSearch';
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

function InstallButton({ className = '', iconOnly = false }: { className?: string; iconOnly?: boolean }) {
  const { canInstall, install } = usePwaInstall();
  if (!canInstall) return null;
  if (iconOnly) {
    return (
      <button type="button" onClick={() => void install()} className={`icon-btn text-gold ${className}`} aria-label="Install SAHU MUSIC">
        <Icon name="plus" size={20} />
      </button>
    );
  }
  return (
    <button type="button" onClick={() => void install()} className={`btn-outline whitespace-nowrap !px-4 !py-2 ${className}`}>
      <Icon name="download" size={16} /> Install app
    </button>
  );
}


export function Shell({ children }: { children: ReactNode }) {
  const pathname = norm(usePathname() || '/');
  const { user, profile, configured } = useAuth();
  const { current } = usePlayer();
  const online = useOnline();
  const demo = useDemoMode();
  const mainRef = useRef<HTMLElement>(null);
  useSongColor(current?.artwork);

  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 });
  }, [pathname]);

  const isActive = (href: string) => (href === '/' ? pathname === '/' : pathname.startsWith(href));
  const accountHref = user ? '/profile' : '/login';
  const accountLabel = user ? profile?.display_name || 'Profile' : configured ? 'Log in' : 'Guest';
  const initial = (user ? profile?.display_name || 'U' : 'G').slice(0, 1).toUpperCase();
  const sideLink = 'flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium text-white/65 transition hover:bg-white/[0.06] hover:text-white';

  return (
    <div className="app-backdrop relative flex h-dvh flex-col overflow-hidden md:gap-2 md:p-2 md:pt-[max(0.5rem,env(safe-area-inset-top))]">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[90] focus:rounded focus:bg-gold focus:px-3 focus:py-2 focus:text-ink">
        Skip to content
      </a>
      <div className="relative flex min-h-0 flex-1 md:gap-2">
        {/* Tablet: slim icon rail */}
        <aside className="panel hidden w-[78px] shrink-0 flex-col items-center gap-1 overflow-y-auto py-4 md:flex lg:hidden" aria-label="Sidebar">
          <Link href="/" aria-label="SAHU MUSIC home" className="mb-4 transition hover:opacity-90">
            <LogoMark size={42} />
          </Link>
          <nav className="flex flex-col items-center gap-1.5" aria-label="Main">
            {NAV.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                aria-current={isActive(n.href) ? 'page' : undefined}
                className={`flex w-16 flex-col items-center gap-1 rounded-2xl py-2.5 text-[10px] font-bold transition ${
                  isActive(n.href) ? 'bg-white/[0.08] text-gold' : 'text-white/60 hover:bg-white/[0.05] hover:text-white'
                }`}
              >
                <Icon name={n.icon} size={22} />
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="mt-auto flex flex-col items-center gap-1">
            <Link href="/library?tab=favorites" className="icon-btn text-white/60 hover:text-white" aria-label="Favourites">
              <Icon name="heart" size={20} />
            </Link>
            <Link href="/download" className="icon-btn text-white/60 hover:text-white" aria-label="Get the app">
              <Icon name="download" size={20} />
            </Link>
            <Link href="/settings" className="icon-btn text-white/60 hover:text-white" aria-label="Settings">
              <Icon name="settings" size={20} />
            </Link>
            <Link href={accountHref} aria-label={accountLabel} className="mt-1 flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-gold-soft via-gold to-[#FF7A59] text-sm font-extrabold text-ink">
              {initial}
            </Link>
          </div>
        </aside>

        {/* Desktop sidebar */}
        <aside className="panel hidden w-64 shrink-0 flex-col overflow-y-auto p-5 lg:flex" aria-label="Sidebar">
          <Link href="/" aria-label="SAHU MUSIC home" className="transition hover:opacity-90">
            <Logo />
          </Link>
          <nav className="mt-8 flex flex-col gap-1" aria-label="Main">
            {NAV.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                aria-current={isActive(n.href) ? 'page' : undefined}
                className={`group relative flex items-center gap-3 rounded-2xl px-3 py-2.5 text-[15px] font-semibold transition ${
                  isActive(n.href) ? 'bg-white/[0.07] text-white' : 'text-white/65 hover:bg-white/[0.04] hover:text-white'
                }`}
              >
                {isActive(n.href) && <span className="absolute -left-5 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-gold shadow-glow" aria-hidden="true" />}
                <Icon name={n.icon} size={21} className={isActive(n.href) ? 'text-gold' : 'text-white/70 group-hover:text-white'} />
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="mt-6 border-t border-white/[0.06] pt-4">
            <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[0.22em] text-white/35">Your music</p>
            <Link href="/library?tab=favorites" className={sideLink}>
              <Icon name="heart" size={18} /> Favourites
            </Link>
            <Link href="/library?tab=history" className={sideLink}>
              <Icon name="clock" size={18} /> History
            </Link>
            <Link href="/library?tab=playlists" className={sideLink}>
              <Icon name="queue" size={18} /> Playlists
            </Link>
            <Link href="/settings" className={`${sideLink} ${isActive('/settings') ? '!text-gold' : ''}`}>
              <Icon name="settings" size={18} /> Settings
            </Link>
          </div>
          <div className="mt-auto space-y-3 pt-6">
            <Link href="/download" className="sheen block rounded-2xl bg-gradient-to-br from-gold/25 via-[#FF7A59]/15 to-rose/15 p-4 ring-1 ring-gold/25 transition hover:ring-gold/50">
              <span className="flex items-center gap-2 text-sm font-bold text-white">
                <Icon name="download" size={18} className="text-gold" /> Android app
              </span>
              <span className="mt-1 block text-xs text-white/60">Lock-screen controls, background play.</span>
            </Link>
            <InstallButton className="w-full" />
            <Link href={accountHref} className="surface surface-hover flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-semibold text-white">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-gold-soft via-gold to-[#FF7A59] font-extrabold text-ink">{initial}</span>
              <span className="truncate">{accountLabel}</span>
            </Link>
          </div>
        </aside>

        <main id="main" ref={mainRef} className="main-panel min-w-0 flex-1 overflow-y-auto md:rounded-3xl md:ring-1 md:ring-white/[0.06]" tabIndex={-1}>
          {/* Phone top bar: starts below the status bar / notch when the app is drawn edge to edge */}
          <header className="glass sticky top-0 z-20 flex items-center justify-between gap-2 border-b border-white/[0.05] px-4 pb-3 pt-[calc(env(safe-area-inset-top)+0.75rem)] md:hidden">
            <Link href="/" aria-label="SAHU MUSIC home, built by Sahil Thakur" className="min-w-0">
              <Logo compact byline />
            </Link>
            <div className="flex shrink-0 items-center">
              {!pathname.startsWith('/search') && (
                <Link href="/search/" className="icon-btn text-white/80" aria-label="Search">
                  <Icon name="search" size={20} />
                </Link>
              )}
              <InstallButton iconOnly />
              <Link href="/download" className="icon-btn text-white/80" aria-label="Get the app">
                <Icon name="download" size={20} />
              </Link>
              <Link href="/settings" className="icon-btn text-white/80" aria-label="Settings">
                <Icon name="settings" size={20} />
              </Link>
              <Link href={accountHref} aria-label={user ? 'Profile' : 'Log in'} className="ml-1 flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-gold-soft via-gold to-[#FF7A59] text-xs font-extrabold text-ink">
                {initial}
              </Link>
            </div>
          </header>

          {/* Tablet & desktop top bar */}
          <header className="glass sticky top-0 z-20 hidden items-center gap-3 border-b border-white/[0.05] px-6 py-3 md:flex md:rounded-t-3xl lg:px-8">
            <div className="min-w-0 flex-1">{!pathname.startsWith('/search') && <QuickSearch />}</div>
            <BuiltByBadge />
            <Link href="/download" className="btn-gold !px-4 !py-2" aria-label="Get the app">
              <Icon name="download" size={16} /> <span className="hidden lg:inline">Get the app</span>
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

          {/* keyed by route so every page fades in as it opens */}
          <div key={pathname} className="mx-auto w-full max-w-[1500px] animate-fade-up px-4 py-5 md:px-6 md:py-6 lg:px-8 lg:py-7">
            {children}
          </div>

          <footer className="mx-auto w-full max-w-[1500px] border-t border-white/[0.05] px-4 py-8 text-xs text-muted md:px-6 lg:px-8">
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
              <span>© {new Date().getFullYear()} SAHU MUSIC · Har Gaana, Ek Jagah.</span>
              <span>
                Built by <span className="font-semibold text-gold">Sahil Thakur</span>
              </span>
              <Link href="/about" className="hover:text-white">About</Link>
              <Link href="/download" className="hover:text-white">Download app</Link>
              <Link href="/privacy" className="hover:text-white">Privacy</Link>
              <Link href="/terms" className="hover:text-white">Terms</Link>
              <a href="https://audius.co" target="_blank" rel="noopener noreferrer" className="hover:text-white">Music via Audius</a>
              {music.previewsAllowed && <a href="https://music.apple.com" target="_blank" rel="noopener noreferrer" className="hover:text-white">Previews via Apple Music</a>}
            </div>
          </footer>
          {/* room to scroll the page out from under the floating YouTube video */}
          {current?.video && <div className="h-64" aria-hidden="true" />}
        </main>
      </div>

      <MiniPlayer />

      {/* Phone bottom navigation: a floating bar */}
      <nav className="pb-safe relative z-30 px-3 pt-1.5 md:hidden" aria-label="Main">
        <div className="glass mb-2 grid grid-cols-4 rounded-2xl p-1 ring-1 ring-white/10">
          {NAV.map((n) => {
            const on = isActive(n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                aria-current={on ? 'page' : undefined}
                className={`flex flex-col items-center gap-0.5 rounded-xl py-1.5 text-[10.5px] font-bold transition active:scale-95 ${on ? 'bg-white/[0.08] text-gold' : 'text-white/60'}`}
              >
                <Icon name={n.icon} size={21} />
                {n.label}
              </Link>
            );
          })}
        </div>
      </nav>

      <FullPlayer />
      <VideoStage />
      {/* keeps layout stable for screen readers when nothing is playing */}
      {!current && <span className="sr-only" aria-live="polite">Nothing is playing</span>}
    </div>
  );
}
