'use client';

import { useEffect, useRef } from 'react';
import { adsConfigured, env } from '@/lib/config';
import { useSettings } from '@/lib/settings';

declare global {
  interface Window {
    adsbygoogle?: unknown[];
  }
}

let scriptRequested = false;

/**
 * OPTIONAL advertising slot (Google AdSense display ad).
 * - Renders nothing unless NEXT_PUBLIC_ADSENSE_CLIENT + NEXT_PUBLIC_ADSENSE_SLOT are set
 *   and the user has not switched ads off in Settings.
 * - Display only: it never plays audio and never pauses or interrupts playback.
 * - It is never placed inside the player. The app works identically without it.
 */
export function AdSlot({ className = '' }: { className?: string }) {
  const { settings } = useSettings();
  const ref = useRef<HTMLModElement>(null);
  const enabled = adsConfigured && settings.adsEnabled;

  useEffect(() => {
    if (!enabled) return;
    if (!scriptRequested) {
      scriptRequested = true;
      const s = document.createElement('script');
      s.async = true;
      s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${env.adsenseClient}`;
      s.crossOrigin = 'anonymous';
      s.onerror = () => undefined; // blocked by an ad-blocker: fine, the app does not depend on ads
      document.head.appendChild(s);
    }
    try {
      if (ref.current && !ref.current.dataset.adsbygoogleStatus) (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch {
      /* ignore */
    }
  }, [enabled]);

  if (!enabled) return null;
  return (
    <aside className={`my-8 overflow-hidden rounded-xl bg-coal p-2 ring-1 ring-white/5 ${className}`} aria-label="Advertisement">
      <p className="mb-1 text-center text-[10px] uppercase tracking-widest text-muted">Advertisement</p>
      <ins
        ref={ref}
        className="adsbygoogle block"
        style={{ display: 'block', minHeight: 90 }}
        data-ad-client={env.adsenseClient}
        data-ad-slot={env.adsenseSlot}
        data-ad-format="auto"
        data-full-width-responsive="true"
      />
    </aside>
  );
}
