'use client';

import { useEffect, useRef, useState } from 'react';
import { useSettings } from '@/lib/settings';
import { Icon } from './icons';

/** The same file on another server: swap the origin, keep the path. */
function onMirror(url: string, mirror: string): string {
  try {
    const u = new URL(url);
    return `${mirror}${u.pathname}${u.search}`;
  } catch {
    return url;
  }
}

/**
 * Lazy-loaded artwork with a graceful fallback. Small tiles request small images. When the
 * cover's server fails, the next mirror (another server holding the same file) is tried before
 * the placeholder is shown.
 */
export function Artwork({
  src,
  alt,
  size = 'md',
  rounded = 'rounded-lg',
  className = '',
  mirrors,
  eager = false,
}: {
  src: string | null | undefined;
  alt: string;
  size?: 'sm' | 'md' | 'lg';
  rounded?: string;
  className?: string;
  /** Other servers holding the same cover (Track.artworkMirrors). */
  mirrors?: string[];
  /** Load at once (covers at the top of the page). */
  eager?: boolean;
}) {
  const { settings } = useSettings();
  /** 0 = the main server, n = mirrors[n - 1]; past the last one: the placeholder. */
  const [attempt, setAttempt] = useState(0);
  const imgRef = useRef<HTMLImageElement>(null);
  const tries = 1 + (mirrors?.length ?? 0);
  const next = () => setAttempt((a) => a + 1);

  // A new cover starts on the main server again. Pages arrive as HTML, so an image can also
  // fail before React is listening: check once on mount.
  useEffect(() => {
    setAttempt(0);
    const img = imgRef.current;
    if (img && img.complete && img.naturalWidth === 0 && img.getAttribute('src')) next();
  }, [src]);

  let url = src || '';
  if (url && (size === 'sm' || (settings.dataSaver && size !== 'lg'))) url = url.replace(/(480x480|1000x1000)(\.jpg)/, '150x150$2');
  if (url && attempt > 0 && mirrors?.[attempt - 1]) url = onMirror(url, mirrors[attempt - 1]);
  const failed = attempt >= tries;

  return (
    <div className={`relative aspect-square overflow-hidden bg-coal-light ${rounded} ${className}`}>
      {url && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img ref={imgRef} src={url} alt={alt} loading={eager ? 'eager' : 'lazy'} decoding="async" onError={next} className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-coal-light to-ink text-gold/60" aria-label={alt} role="img">
          <Icon name="music" size={size === 'sm' ? 18 : 40} />
        </div>
      )}
    </div>
  );
}
