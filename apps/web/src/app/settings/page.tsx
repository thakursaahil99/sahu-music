'use client';

import Link from 'next/link';
import { useState } from 'react';
import { clearApiCache } from '@sahu/api';
import { Icon } from '@/components/icons';
import { usePwaInstall } from '@/components/Pwa';
import { ConfigNotice, Toggle } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { adsConfigured } from '@/lib/config';
import { useLibrary } from '@/lib/library';
import { music } from '@/lib/music';
import { useSettings } from '@/lib/settings';
import { useToast } from '@/lib/toast';

export default function SettingsPage() {
  const { settings, update } = useSettings();
  const { user, configured } = useAuth();
  const { clearHistory } = useLibrary();
  const { canInstall, isInstalled, install } = usePwaInstall();
  const toast = useToast();
  const providers = music.status();

  const clearCache = async () => {
    clearApiCache();
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k.startsWith('sahu-') && !k.includes('shell')).map((k) => caches.delete(k)));
    }
    toast('Cached artwork and metadata cleared');
  };

  /**
   * Gets the newest deployed version now (useful in the installed app, where the browser only
   * looks for updates now and then). A waiting new version is activated and the page reloads.
   */
  const [checking, setChecking] = useState(false);
  const checkForUpdate = async () => {
    setChecking(true);
    try {
      const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : undefined;
      if (!reg) {
        window.location.reload();
        return;
      }
      await reg.update();
      // a new version may still be installing: give it a moment to finish
      for (let i = 0; i < 20 && reg.installing; i++) await new Promise((r) => setTimeout(r, 250));
      if (reg.waiting) {
        toast('Updating to the newest version…');
        navigator.serviceWorker.addEventListener('controllerchange', () => window.location.reload(), { once: true });
        reg.waiting.postMessage({ type: 'SKIP_WAITING' });
        return;
      }
      toast('You have the newest version.');
    } catch {
      toast('Could not check for updates. Check your connection.', 'error');
    }
    setChecking(false);
  };

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-6 text-3xl font-extrabold text-white">Settings</h1>

      <section className="card mb-5">
        <h2 className="mb-1 text-sm font-bold uppercase tracking-widest text-gold">Playback</h2>
        <div className="divide-y divide-coal-line">
          <Toggle label="Autoplay next song" hint="Keep playing through the queue" checked={settings.autoplayNext} onChange={(v) => update({ autoplayNext: v })} />
          <Toggle label="Data saver" hint="Load smaller artwork" checked={settings.dataSaver} onChange={(v) => update({ dataSaver: v })} />
        </div>
      </section>

      <section className="card mb-5">
        <h2 className="mb-1 text-sm font-bold uppercase tracking-widest text-gold">Advertising</h2>
        <Toggle
          label="Show ads"
          hint={adsConfigured ? 'Display ads help keep SAHU MUSIC free. They never interrupt playback.' : 'No ad network is configured on this deployment, so no ads are shown.'}
          checked={adsConfigured && settings.adsEnabled}
          onChange={(v) => update({ adsEnabled: v })}
        />
      </section>

      <section className="card mb-5">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-widest text-gold">App</h2>
        {isInstalled ? (
          <p className="flex items-center gap-2 text-sm text-white"><Icon name="check" size={18} className="text-gold" /> SAHU MUSIC is installed on this device.</p>
        ) : canInstall ? (
          <button type="button" className="btn-gold" onClick={() => void install()}>
            <Icon name="download" size={16} /> Install SAHU MUSIC
          </button>
        ) : (
          <p className="text-sm text-muted">
            To install: on Android/desktop Chrome or Edge use the browser menu → “Install app”. On iPhone/iPad Safari use Share → “Add to Home Screen”.
          </p>
        )}
        <div className="mt-4 flex flex-wrap gap-3">
          <button type="button" className="btn-gold" onClick={() => void checkForUpdate()} disabled={checking}>
            <Icon name="download" size={16} /> {checking ? 'Checking…' : 'Check for updates'}
          </button>
          <button type="button" className="btn-outline" onClick={() => void clearCache()}>Clear cached data</button>
          <button type="button" className="btn-outline" onClick={() => { clearHistory(); toast('Listening history cleared'); }}>Clear listening history</button>
        </div>
      </section>

      <section className="card mb-5">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-widest text-gold">Music sources</h2>
        <ul className="space-y-3">
          {providers.map((p) => (
            <li key={p.id} className="flex items-start justify-between gap-3 text-sm">
              {/* min-w-0 + anywhere: a long setting name (NEXT_PUBLIC_…) wraps instead of pushing the badge off a narrow phone */}
              <span className="min-w-0 [overflow-wrap:anywhere]">
                <span className="font-semibold text-white">{p.name}</span>
                {p.configHint && <span className="block text-xs text-muted">{p.configHint}</span>}
              </span>
              <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${p.configured ? 'bg-emerald-500/15 text-emerald-300' : 'bg-coal-line text-muted'}`}>
                {p.configured ? 'Active' : 'Not configured'}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-muted">Only tracks whose provider confirms streaming permission are playable. Audio is streamed, never stored.</p>
      </section>

      <section className="card mb-5">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-widest text-gold">Account</h2>
        {user ? (
          <p className="text-sm text-white">Signed in as {user.email}. <Link href="/profile" className="text-gold">Manage profile</Link></p>
        ) : configured ? (
          <p className="text-sm text-white">Guest mode. <Link href="/login" className="text-gold">Log in</Link> to sync your library.</p>
        ) : (
          <ConfigNotice title="Accounts are not configured">
            <p>Guest mode is active. Accounts need the backend and its database (see README).</p>
          </ConfigNotice>
        )}
      </section>

      <p className="text-center text-xs text-muted">
        SAHU MUSIC v1.0.0 · <Link href="/about" className="hover:text-white">About</Link> · <Link href="/privacy" className="hover:text-white">Privacy</Link> ·{' '}
        <Link href="/terms" className="hover:text-white">Terms</Link>
      </p>
    </div>
  );
}
