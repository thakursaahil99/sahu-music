'use client';

import { Icon } from '@/components/icons';
import { LogoMark } from '@/components/Logo';
import { usePwaInstall } from '@/components/Pwa';
import { ConfigNotice } from '@/components/ui';

export function DownloadView({ apk }: { apk: { url: string; sizeMb: number | null } | null }) {
  const { canInstall, isInstalled, install } = usePwaInstall();

  return (
    <div className="mx-auto max-w-4xl">
      <header className="relative mb-8 overflow-hidden rounded-3xl bg-gradient-to-br from-[#2a2110] via-coal to-ink p-6 text-center ring-1 ring-gold/25 md:p-12">
        <div className="hero-blob -left-10 -top-20 h-64 w-64 bg-gold/40" aria-hidden="true" />
        <div className="hero-blob -bottom-24 right-0 h-72 w-72 bg-[#7a1f3d]/50 [animation-delay:-5s]" aria-hidden="true" />
        <div className="stagger relative z-10 flex flex-col items-center">
          <LogoMark size={96} className="animate-float" />
          <h1 className="mt-5 text-3xl font-extrabold text-white md:text-5xl">
            Get <span className="text-gold-gradient">SAHU MUSIC</span>
          </h1>
          <p className="mt-3 max-w-xl text-sm text-white/75 md:text-base">Free on every device. No subscription, no sign-up needed. Every song plays in full.</p>
        </div>
      </header>

      <div className="stagger grid gap-5 md:grid-cols-2">
        {/* Android APK */}
        <section className="card card-lift">
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-gold/15 text-gold">
              <Icon name="download" size={24} />
            </span>
            <div>
              <h2 className="text-lg font-bold text-white">Android app (APK)</h2>
              <p className="text-xs text-muted">Background playback and lock-screen controls</p>
            </div>
          </div>

          {apk ? (
            <>
              <a href={apk.url} download="sahu-music.apk" className="btn-gold mt-5 w-full animate-pulse-ring" rel="noopener">
                <Icon name="download" size={18} /> Download APK{apk.sizeMb ? ` · ${apk.sizeMb} MB` : ''}
              </a>
              <ol className="mt-5 list-decimal space-y-2 pl-5 text-sm text-white/75">
                <li>Tap <strong className="text-white">Download APK</strong> on your Android phone.</li>
                <li>Open the downloaded file. If Android asks, allow your browser to <strong className="text-white">install unknown apps</strong>.</li>
                <li>Tap <strong className="text-white">Install</strong>, then open SAHU MUSIC.</li>
              </ol>
              <p className="mt-4 text-xs text-muted">
                Android 7.0 or newer, 64-bit (arm64) phones. Only install APKs you downloaded from this site. The app is not on the Play Store, so Android shows a
                standard warning for apps installed from outside the store.
              </p>
            </>
          ) : (
            <div className="mt-5">
              <ConfigNotice title="The APK has not been added to this deployment yet">
                <p>
                  Site owner: run <code className="text-gold">npm run apk</code> (builds the Flutter app and copies it into the website), or set{' '}
                  <code className="text-gold">NEXT_PUBLIC_APK_URL</code> to a hosted APK, then rebuild the site.
                </p>
                <p>Until then, use the web app below. It installs like an app on Android too.</p>
              </ConfigNotice>
            </div>
          )}
        </section>

        {/* PWA */}
        <section className="card card-lift">
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-gold/15 text-gold">
              <Icon name="music" size={24} />
            </span>
            <div>
              <h2 className="text-lg font-bold text-white">Web app (any device)</h2>
              <p className="text-xs text-muted">Android, iPhone, Windows, Mac, Linux</p>
            </div>
          </div>

          {isInstalled ? (
            <p className="mt-5 flex items-center gap-2 text-sm text-white">
              <Icon name="check" size={18} className="text-gold" /> SAHU MUSIC is installed on this device.
            </p>
          ) : canInstall ? (
            <button type="button" className="btn-gold mt-5 w-full" onClick={() => void install()}>
              <Icon name="download" size={18} /> Install web app
            </button>
          ) : (
            <p className="mt-5 rounded-lg bg-white/5 px-3 py-2 text-sm text-white/75">Use your browser menu to install (steps below).</p>
          )}

          <ul className="mt-5 space-y-2 text-sm text-white/75">
            <li><strong className="text-white">Android / desktop Chrome or Edge:</strong> browser menu → “Install app”.</li>
            <li><strong className="text-white">iPhone / iPad (Safari):</strong> Share → “Add to Home Screen”.</li>
          </ul>
          <p className="mt-4 text-xs text-muted">The web app opens offline and updates itself. Music always needs an internet connection.</p>
        </section>
      </div>

      <section className="card mt-5 animate-fade-up">
        <h2 className="text-lg font-bold text-white">iPhone app</h2>
        <p className="mt-2 text-sm text-white/75">
          Apple does not allow installing apps from a website. On iPhone and iPad use the web app above; it adds a SAHU MUSIC icon to your home screen and plays
          music with lock-screen controls.
        </p>
      </section>
    </div>
  );
}
