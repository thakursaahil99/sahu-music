'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Artist, Collection } from '@sahu/models';
import { formatCount, type Category } from '@sahu/shared';
import { readLocal, writeLocal } from '@/lib/hooks';
import { useSettings } from '@/lib/settings';
import { Artwork } from './Artwork';
import { Icon, type IconName } from './icons';

/** Top-of-page heading shared by Explore, Search, Library and Settings. */
export function PageHeader({ eyebrow, title, subtitle, icon, children }: { eyebrow?: string; title: string; subtitle?: string; icon?: IconName; children?: ReactNode }) {
  return (
    <header className="mb-8 flex flex-wrap items-end justify-between gap-4 animate-fade-up">
      <div className="flex min-w-0 items-center gap-4">
        {icon && (
          <span className="hidden h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-gold-soft via-gold to-[#FF7A59] text-ink shadow-glow sm:flex" aria-hidden="true">
            <Icon name={icon} size={26} />
          </span>
        )}
        <div className="min-w-0">
          {eyebrow && <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-gold">{eyebrow}</p>}
          <h1 className="text-[2rem] font-bold leading-tight text-white md:text-[2.6rem]">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-white/60">{subtitle}</p>}
        </div>
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </header>
  );
}

/** Segmented control (pill tabs) with a sliding look. */
export function Segmented<T extends string>({ items, value, onChange, label }: { items: readonly { id: T; label: string }[]; value: T; onChange: (id: T) => void; label: string }) {
  return (
    <div className="no-scrollbar inline-flex max-w-full gap-1 overflow-x-auto rounded-full bg-white/[0.05] p-1 ring-1 ring-white/[0.08]" role="tablist" aria-label={label}>
      {items.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={value === t.id}
          onClick={() => onChange(t.id)}
          className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-semibold transition duration-200 ${value === t.id ? 'bg-white text-ink' : 'text-white/70 hover:bg-white/[0.06] hover:text-white'}`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function Section({ title, subtitle, href, children }: { title: string; subtitle?: string; href?: string; children: ReactNode }) {
  return (
    <section className="mb-9 md:mb-11">
      <div className="mb-3.5 flex items-end justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-[1.3rem] font-bold leading-tight text-white md:text-[1.7rem]">{title}</h2>
          {subtitle && <p className="mt-0.5 truncate text-[13px] text-white/50 md:text-sm">{subtitle}</p>}
        </div>
        {href && (
          <Link href={href} className="inline-flex shrink-0 items-center gap-0.5 rounded-full px-2 py-1 text-[13px] font-bold text-white/55 transition hover:text-white">
            See all <Icon name="chevronRight" size={15} />
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
  return <div className="stagger no-scrollbar -mx-4 flex snap-x scroll-px-4 gap-3 overflow-x-auto px-4 pb-3 pt-1 md:-mx-6 md:scroll-px-6 md:gap-4 md:px-6 lg:-mx-8 lg:scroll-px-8 lg:px-8">{children}</div>;
}

export function Grid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 gap-x-3 gap-y-5 xs:gap-x-4 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">{children}</div>;
}

export function CardSkeletonRow({ count = 6 }: { count?: number }) {
  return (
    <Row>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="w-[9.25rem] shrink-0 xs:w-40 md:w-44 lg:w-48" aria-hidden="true">
          <div className="skeleton aspect-square rounded-2xl" />
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
          <div className="skeleton h-12 w-12 rounded-xl" />
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
    <div className="rounded-3xl bg-white/[0.03] p-6 text-center ring-1 ring-white/[0.07]" role="alert">
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
    <div className="animate-fade-up rounded-3xl border border-dashed border-white/10 p-8 text-center">
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
 * The covers are picked once while the site is built (app/category-art.json/route.ts) and
 * read from that one small file: opening a page with twenty tiles costs no music-server
 * requests, so the listener's own search is never queued behind them. */
const ART_KEY = 'sahu.category-art.v2';
let artFile: Promise<Record<string, string>> | null = null;

function categoryArt(): Promise<Record<string, string>> {
  artFile ??= fetch('/category-art.json')
    .then((r) => (r.ok ? r.json() : null))
    .then((j: { art?: Record<string, string> } | null) => {
      const art = j?.art ?? {};
      if (Object.keys(art).length) writeLocal(ART_KEY, art);
      return Object.keys(art).length ? art : readLocal<Record<string, string>>(ART_KEY, {});
    })
    .catch(() => readLocal<Record<string, string>>(ART_KEY, {}));
  return artFile;
}

// `ref` is kept for callers; the covers no longer depend on scrolling into view.
export function useCategoryArt(category: Category, _ref?: React.RefObject<HTMLElement | null>): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    const kept = readLocal<Record<string, string>>(ART_KEY, {})[category.slug];
    if (kept) setUrl(kept);
    void categoryArt().then((art) => alive && setUrl(art[category.slug] ?? kept ?? null));
    return () => {
      alive = false;
    };
  }, [category.slug]);
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
      className="card-lift sheen group relative flex h-24 items-start overflow-hidden rounded-2xl p-3.5 ring-1 ring-white/10 transition hover:shadow-lift hover:ring-white/30 xs:h-28 md:h-32 md:p-4"
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
      <span className="relative z-10 max-w-[70%] font-display text-[15px] font-bold leading-tight text-white [text-shadow:0_1px_8px_rgba(0,0,0,0.6)] md:text-lg">{category.name}</span>
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
    <Link href={`/artist?p=${artist.provider}&id=${artist.providerArtistId}`} className="card-lift group w-32 shrink-0 snap-start text-center xs:w-36 md:w-40">
      <Artwork src={artist.image} alt={artist.name} rounded="rounded-full" className="art-zoom shadow-lift ring-1 ring-white/[0.08]" />
      <p className="mt-2.5 truncate text-sm font-semibold text-white">{artist.name}</p>
      <p className="truncate text-xs text-white/50">{artist.followerCount != null ? `${formatCount(artist.followerCount)} followers` : 'Artist'}</p>
    </Link>
  );
}

export function CollectionCard({ collection }: { collection: Collection }) {
  const path = collection.kind === 'album' ? 'album' : 'playlist';
  return (
    <Link href={`/${path}?p=${collection.provider}&id=${collection.providerCollectionId}`} className="card-lift group w-[9.25rem] shrink-0 snap-start xs:w-40 md:w-44 lg:w-48">
      <Artwork src={collection.artwork} alt={collection.title} rounded="rounded-2xl" className="art-zoom shadow-lift ring-1 ring-white/[0.06]" />
      <p className="mt-2.5 truncate text-[13.5px] font-semibold text-white">{collection.title}</p>
      <p className="truncate text-xs text-white/55">
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
      <span className="relative h-6 w-11 shrink-0 rounded-full bg-white/15 transition peer-checked:bg-gold peer-focus-visible:ring-2 peer-focus-visible:ring-gold-soft after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:transition peer-checked:after:translate-x-5" />
    </label>
  );
}

export function ConfigNotice({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl bg-gold/10 p-4 text-sm text-gold-soft ring-1 ring-gold/30" role="note">
      <p className="flex items-center gap-2 font-semibold text-gold">
        <Icon name="info" size={18} /> {title}
      </p>
      <div className="mt-2 space-y-1 text-white/80">{children}</div>
    </div>
  );
}
