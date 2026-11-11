'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Artist, Collection } from '@sahu/models';
import { formatCount, type Category } from '@sahu/shared';
import { readLocal, writeLocal } from '@/lib/hooks';
import { music } from '@/lib/music';
import { useSettings } from '@/lib/settings';
import { Artwork } from './Artwork';
import { Icon } from './icons';

export function Section({ title, subtitle, href, children }: { title: string; subtitle?: string; href?: string; children: ReactNode }) {
  return (
    <section className="mb-10 animate-fade-up">
      <div className="mb-4 flex items-end justify-between gap-4">
        <div>
          <h2 className="text-xl font-extrabold text-white md:text-[1.65rem] md:leading-tight">{title}</h2>
          {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
        </div>
        {href && (
          <Link href={href} className="pill shrink-0 transition hover:border-gold/60 hover:text-gold">
            See all <Icon name="chevronRight" size={14} />
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

/** Horizontal scroller for cards. */
export function Row({ children }: { children: ReactNode }) {
  // scroll-padding keeps the first card aligned with the section heading (snap would otherwise eat the left padding)
  return <div className="stagger no-scrollbar -mx-4 flex snap-x scroll-px-4 gap-3 overflow-x-auto px-4 pb-3 pt-2 md:-mx-8 md:scroll-px-8 md:px-8">{children}</div>;
}

export function Grid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">{children}</div>;
}

export function CardSkeletonRow({ count = 6 }: { count?: number }) {
  return (
    <Row>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="w-44 shrink-0 rounded-2xl bg-white/[0.03] p-3 md:w-48" aria-hidden="true">
          <div className="skeleton aspect-square rounded-xl" />
          <div className="skeleton mt-3 h-3 w-3/4 rounded" />
          <div className="skeleton mt-2 h-3 w-1/2 rounded" />
        </div>
      ))}
    </Row>
  );
}

export function ListSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div aria-busy="true" aria-label="Loading">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="flex items-center gap-3 px-2 py-2">
          <div className="skeleton h-12 w-12 rounded-md" />
          <div className="flex-1">
            <div className="skeleton h-3 w-1/2 rounded" />
            <div className="skeleton mt-2 h-3 w-1/3 rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="rounded-xl border border-coal-line bg-coal p-6 text-center" role="alert">
      <Icon name="wifiOff" size={28} className="mx-auto text-gold" />
      <p className="mt-3 text-sm text-muted">{message}</p>
      {onRetry && (
        <button onClick={onRetry} className="btn-outline mt-4">
          Try again
        </button>
      )}
    </div>
  );
}

export function EmptyState({ title, text, children }: { title: string; text?: string; children?: ReactNode }) {
  return (
    <div className="animate-fade-up rounded-xl border border-dashed border-coal-line p-8 text-center">
      <Icon name="music" size={30} className="mx-auto text-gold/70" />
      <p className="mt-3 font-semibold text-white">{title}</p>
      {text && <p className="mx-auto mt-1 max-w-md text-sm text-muted">{text}</p>}
      {children && <div className="mt-4">{children}</div>}
    </div>
  );
}

/** Renders children only once scrolled near the viewport (lazy loading of below-the-fold sections). */
export function LazyMount({ children, minHeight = 240 }: { children: ReactNode; minHeight?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [show, setShow] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || show) return;
    if (!('IntersectionObserver' in window)) return setShow(true);
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setShow(true);
          io.disconnect();
        }
      },
      { rootMargin: '300px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [show]);
  return (
    <div ref={ref} style={show ? undefined : { minHeight }}>
      {show ? children : null}
    </div>
  );
}

/* ── Category photos ──────────────────────────────────────────────
 * A tile shows cover art from the category's own live tracks (never stock images).
 * The cover URL is remembered for a day, so tiles cost API calls only once per day. */
const ART_KEY = 'sahu.category-art.v1';
const ART_TTL_MS = 24 * 60 * 60 * 1000;
type ArtCache = Record<string, { at: number; url: string }>;
const artRequests = new Map<string, Promise<string | null>>();

function loadCategoryArt(category: Category, used: ReadonlySet<string>): Promise<string | null> {
  let req = artRequests.get(category.slug);
  if (!req) {
    req = music
      .getCategoryTracks(category.strategy, { limit: 8 })
      .then((tracks) => {
        const covers = tracks.map((t) => t.artwork).filter((u): u is string => !!u && u.startsWith('https://'));
        // prefer a cover no other tile is showing, so neighbouring categories look different
        const url = covers.find((u) => !used.has(u)) ?? covers[0] ?? null;
        if (url) writeLocal(ART_KEY, { ...readLocal<ArtCache>(ART_KEY, {}), [category.slug]: { at: Date.now(), url } });
        return url;
      })
      .catch(() => {
        artRequests.delete(category.slug); // allow a retry on the next visit
        return null;
      });
    artRequests.set(category.slug, req);
  }
  return req;
}

function useCategoryArt(category: Category, ref: React.RefObject<HTMLElement | null>): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    const cache = readLocal<ArtCache>(ART_KEY, {});
    const hit = cache[category.slug];
    if (hit && Date.now() - hit.at < ART_TTL_MS) return setUrl(hit.url);
    const el = ref.current;
    if (!el) return;
    let alive = true;
    const load = () => {
      const used = new Set(Object.values(readLocal<ArtCache>(ART_KEY, {})).map((c) => c.url));
      void loadCategoryArt(category, used).then((u) => alive && u && setUrl(u));
    };
    if (!('IntersectionObserver' in window)) {
      load();
      return () => {
        alive = false;
      };
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          io.disconnect();
          load();
        }
      },
      { rootMargin: '200px' },
    );
    io.observe(el);
    return () => {
      alive = false;
      io.disconnect();
    };
  }, [category, ref]);
  return url;
}

export function CategoryTile({ category }: { category: Category }) {
  const ref = useRef<HTMLAnchorElement>(null);
  const { settings } = useSettings();
  const art = useCategoryArt(category, ref);
  const [loaded, setLoaded] = useState(false);
  const src = art && settings.dataSaver ? art.replace(/(480x480|1000x1000)(\.jpg)/, '150x150$2') : art;
  return (
    <Link
      ref={ref}
      href={`/genre/${category.slug}`}
      className="card-lift sheen group relative flex h-28 items-start overflow-hidden rounded-2xl p-4 ring-1 ring-white/10 transition hover:shadow-lift hover:ring-gold/60 md:h-32"
      style={{
        background: `radial-gradient(120% 90% at 0% 0%, rgba(255,255,255,0.18), transparent 55%), linear-gradient(140deg, ${category.tint[0]} 0%, color-mix(in srgb, ${category.tint[0]} 38%, #0a0a0a) 100%)`,
      }}
    >
      {src && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          loading="lazy"
          decoding="async"
          onLoad={() => setLoaded(true)}
          onError={() => setLoaded(false)}
          className={`absolute inset-y-0 right-0 h-full w-[64%] object-cover transition duration-700 group-hover:scale-110 ${loaded ? 'opacity-100' : 'opacity-0'}`}
          style={{ maskImage: 'linear-gradient(to right, transparent 0%, #000 70%)', WebkitMaskImage: 'linear-gradient(to right, transparent 0%, #000 70%)' }}
        />
      )}
      {/* keeps the name readable over any photo */}
      <span className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-black/10" aria-hidden="true" />
      <span className="relative z-10 max-w-[70%] text-base font-extrabold leading-tight text-white [text-shadow:0_1px_8px_rgba(0,0,0,0.6)] md:text-lg">{category.name}</span>
      <span className="absolute bottom-3 left-4 z-10 flex h-8 w-8 translate-y-2 items-center justify-center rounded-full bg-white/90 text-ink opacity-0 transition duration-300 group-hover:translate-y-0 group-hover:opacity-100">
        <Icon name="chevronRight" size={16} />
      </span>
      {!(src && loaded) && (
        <Icon name="music" size={84} className="absolute -bottom-4 -right-3 rotate-12 text-black/20 transition duration-500 group-hover:rotate-0 group-hover:scale-110 group-hover:text-black/30" />
      )}
    </Link>
  );
}

export function ArtistCard({ artist }: { artist: Artist }) {
  return (
    <Link href={`/artist?p=${artist.provider}&id=${artist.providerArtistId}`} className="surface surface-hover card-lift group w-40 shrink-0 snap-start rounded-2xl p-3 text-center md:w-44">
      <Artwork src={artist.image} alt={artist.name} rounded="rounded-full" className="art-zoom ring-1 ring-white/5" />
      <p className="mt-3 truncate text-sm font-semibold text-white">{artist.name}</p>
      <p className="truncate text-xs text-muted">{artist.followerCount != null ? `${formatCount(artist.followerCount)} followers` : 'Artist'}</p>
    </Link>
  );
}

export function CollectionCard({ collection }: { collection: Collection }) {
  const path = collection.kind === 'album' ? 'album' : 'playlist';
  return (
    <Link href={`/${path}?p=${collection.provider}&id=${collection.providerCollectionId}`} className="surface surface-hover card-lift group w-44 shrink-0 snap-start rounded-2xl p-3 md:w-48">
      <Artwork src={collection.artwork} alt={collection.title} rounded="rounded-xl" className="art-zoom ring-1 ring-white/5" />
      <p className="mt-3 truncate text-sm font-semibold text-white">{collection.title}</p>
      <p className="truncate text-xs text-muted">
        {collection.kind === 'album' ? 'Album' : 'Playlist'} · {collection.ownerName}
      </p>
    </Link>
  );
}

export function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 py-3">
      <span>
        <span className="block text-sm font-medium text-white">{label}</span>
        {hint && <span className="block text-xs text-muted">{hint}</span>}
      </span>
      <input type="checkbox" className="peer sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="relative h-6 w-11 shrink-0 rounded-full bg-coal-line transition peer-checked:bg-gold peer-focus-visible:ring-2 peer-focus-visible:ring-gold-soft after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:transition peer-checked:after:translate-x-5" />
    </label>
  );
}

export function ConfigNotice({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-gold/40 bg-gold/10 p-4 text-sm text-gold-soft" role="note">
      <p className="flex items-center gap-2 font-semibold text-gold">
        <Icon name="info" size={18} /> {title}
      </p>
      <div className="mt-2 space-y-1 text-white/80">{children}</div>
    </div>
  );
}
