'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';

/** Chrome/Edge/Android fire `beforeinstallprompt`; we keep it so an "Install app" button can trigger it. */
interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: InstallPromptEvent | null = null;
let installed = false;
const subs = new Set<() => void>();
const emit = () => subs.forEach((s) => s());

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as InstallPromptEvent;
    emit();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    installed = true;
    emit();
  });
}

const subscribe = (fn: () => void) => {
  subs.add(fn);
  return () => subs.delete(fn);
};

export function usePwaInstall() {
  const canInstall = useSyncExternalStore(subscribe, () => deferred !== null, () => false);
  const isInstalled = useSyncExternalStore(
    subscribe,
    () => installed || window.matchMedia('(display-mode: standalone)').matches,
    () => false,
  );
  const install = async () => {
    if (!deferred) return false;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    deferred = null;
    emit();
    return outcome === 'accepted';
  };
  return { canInstall, isInstalled, install };
}

/** Set when the listener presses Update on the "new version" notice. */
let updateRequested = false;

/** Registers the service worker (production builds only) and announces updates. */
export function PwaManager() {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return;
    let reloaded = false;
    // Reload only after the listener pressed Update. On a first visit the new service worker also
    // takes control of the page; reloading then would cut off the song that just started playing.
    const onControllerChange = () => {
      if (reloaded || !updateRequested) return;
      reloaded = true;
      window.location.reload();
    };

    navigator.serviceWorker
      .register('/sw.js')
      .then((reg) => {
        if (reg.waiting && navigator.serviceWorker.controller) setWaiting(reg.waiting);
        reg.addEventListener('updatefound', () => {
          const sw = reg.installing;
          sw?.addEventListener('statechange', () => {
            if (sw.state === 'installed' && navigator.serviceWorker.controller) setWaiting(sw);
          });
        });
        // check for a new version when the tab becomes visible again
        const check = () => document.visibilityState === 'visible' && reg.update().catch(() => undefined);
        document.addEventListener('visibilitychange', check);
      })
      .catch(() => undefined);

    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);
    return () => navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
  }, []);

  if (!waiting) return null;
  return (
    // Phones: just below the top bar (and the status bar), so it covers neither. Larger screens: top centre.
    <div className="fixed inset-x-0 top-[calc(env(safe-area-inset-top)+4.5rem)] z-[80] flex justify-center px-3 md:top-[calc(env(safe-area-inset-top)+1rem)]" role="alert">
      <div className="flex w-full max-w-md items-center gap-3 rounded-2xl bg-coal/95 py-2.5 pl-4 pr-2 text-sm text-white shadow-lg ring-1 ring-gold/50 backdrop-blur animate-slide-up">
        <span className="min-w-0 flex-1 leading-snug">New version of SAHU MUSIC available</span>
        <button
          type="button"
          className="shrink-0 rounded-full bg-gold px-3.5 py-1.5 text-xs font-bold text-ink hover:bg-gold-soft"
          onClick={() => {
            updateRequested = true;
            waiting.postMessage({ type: 'SKIP_WAITING' });
          }}
        >
          Update
        </button>
        <button type="button" className="icon-btn !h-8 !w-8 shrink-0 text-muted hover:text-white" onClick={() => setWaiting(null)} aria-label="Dismiss update notice">
          ✕
        </button>
      </div>
    </div>
  );
}
