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
    <div className="fixed inset-x-0 top-3 z-[80] flex justify-center px-4" role="alert">
      <div className="flex items-center gap-3 rounded-full bg-coal px-4 py-2 text-sm text-white shadow-lg ring-1 ring-gold/50">
        <span>A new version of SAHU MUSIC is available.</span>
        <button
          type="button"
          className="font-bold text-gold hover:text-gold-soft"
          onClick={() => {
            updateRequested = true;
            waiting.postMessage({ type: 'SKIP_WAITING' });
          }}
        >
          Update
        </button>
        <button type="button" className="text-muted hover:text-white" onClick={() => setWaiting(null)} aria-label="Dismiss update notice">
          ✕
        </button>
      </div>
    </div>
  );
}
