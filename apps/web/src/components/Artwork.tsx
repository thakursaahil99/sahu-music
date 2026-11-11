'use client';

import { useEffect, useState } from 'react';
import { useSettings } from '@/lib/settings';
import { Icon } from './icons';

/** Lazy-loaded artwork with a graceful fallback. Small tiles request small images. */
export function Artwork({
  src,
  alt,
  size = 'md',
  rounded = 'rounded-lg',
  className = '',
}: {
  src: string | null | undefined;
  alt: string;
  size?: 'sm' | 'md' | 'lg';
  rounded?: string;
  className?: string;
}) {
  const { settings } = useSettings();
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);

  let url = src || '';
  if (url && (size === 'sm' || (settings.dataSaver && size !== 'lg'))) url = url.replace(/(480x480|1000x1000)(\.jpg)/, '150x150$2');

  return (
    <div className={`relative aspect-square overflow-hidden bg-coal-light ${rounded} ${className}`}>
      {url && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={alt} loading="lazy" decoding="async" onError={() => setFailed(true)} className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-coal-light to-ink text-gold/60" aria-label={alt} role="img">
          <Icon name="music" size={size === 'sm' ? 18 : 40} />
        </div>
      )}
    </div>
  );
}
