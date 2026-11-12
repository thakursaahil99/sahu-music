'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { trackKey, type Collection, type Track } from '@sahu/models';
import { getCategory } from '@sahu/shared';
import { AdSlot } from '@/components/AdSlot';
import { Artwork } from '@/components/Artwork';
import { Icon } from '@/components/icons';
import { QuickTile, TrackCard, useWarm } from '@/components/tracks';
import { CardSkeletonRow, CategoryTile, CollectionCard, EmptyState, ErrorState, LazyMount, Row, Section } from '@/components/ui';
import { fetchVerifiedSongs } from '@/lib/catalogue';
import { useAsync } from '@/lib/hooks';
import { useLibrary } from '@/lib/library';
import { music, visibleCategories, youtubeEnabled } from '@/lib/music';
import { usePlayer } from '@/lib/player';
import { HOME_RADIO_ROW, HOME_ROW_SIZE, HOME_ROWS } from '@/lib/home-rows';
import type { HomeSnapshot } from '@/lib/snapshot';

/** Keep a home row for the next visit only when it holds real music (not empty, not the demo fallback). */
const keepRow = (rows: unknown[]) => rows.length > 0 && !music.isDemoMode();

/** Quick moods under the hero. */
const MOODS = ['hindi', 'punjabi', 'romantic', 'bhakti-radio', 'lofi-hindi', 'old-hindi', 'party', 'sad', 'haryanvi', 'ghazal-qawwali'];

function CategoryRow({ slug, initial, refreshDelayMs }: { slug: string; initial?: { at: number; data: Track[] } | null; refreshDelayMs?: number }) {
  const cat = getCategory(slug)!;
  const { data, loading, error, reload } = useAsync(() => music.getCategoryTracks(cat.strategy, { limit: HOME_ROW_SIZE }), [slug], {
    key: `home:${slug}`,
    keep: keepRow,
    initial,
    refreshDelayMs,
  });
  if (!loading && !error && (data?.length ?? 0) === 0) return null; // nothing real to show → show nothing
  return (
    <Section title={cat.name} subtitle={cat.blurb} href={`/genre/${cat.slug}`}>
      {loading ? (
        <CardSkeletonRow />
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : (
        <Row>{data!.map((t, i) => <TrackCard key={trackKey(t)} track={t} list={data!} index={i} />)}</Row>
      )}
    </Section>
  );
}

/** One line of the hero's chart: rank, cover, title, plays on click. */
function ChartLine({ track, rank, list }: { track: Track; rank: number; list: Track[] }) {
  const { current, isPlaying, playQueue, toggle } = usePlayer();
  const intent = useWarm(track);
  const active = !!current && trackKey(current) === trackKey(track);
  return (
    <button
      type="button"
      {...intent}
      onClick={() => (active ? toggle() : playQueue(list, rank - 1))}
      aria-label={active && isPlaying ? `Pause ${track.title}` : `Play ${track.title}`}
      className={`group flex w-full items-center gap-3 rounded-2xl p-1.5 pr-3 text-left transition hover:bg-white/[0.07] ${active ? 'bg-white/[0.08]' : ''}`}
    >
      <span className="w-5 shrink-0 text-center font-display text-lg font-bold text-white/40">{rank}</span>
      <Artwork mirrors={track.artworkMirrors} src={track.artwork} alt="" size="sm" rounded="rounded-xl" className="h-12 w-12 shrink-0" />
      <span className="min-w-0 flex-1">
        <span className={`block truncate text-sm font-semibold ${active ? 'text-dyn' : 'text-white'}`}>{track.title}</span>
        <span className="block truncate text-xs text-white/55">{track.artist}</span>
      </span>
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-white transition group-hover:bg-white group-hover:text-ink">
        <Icon name={active && isPlaying ? 'pause' : 'play'} size={14} />
      </span>
    </button>
  );
}

function Hero({ hits, loading }: { hits: Track[] | null; loading: boolean }) {
  const { playQueue, warm } = usePlayer();
  const top = hits?.[0];
  const intent = useWarm(top);
  // "Play Hindi hits" is the most likely first tap: open its song once the page has settled.
  useEffect(() => {
    if (!top) return;
    const t = setTimeout(() => warm(top, 'likely'), 1200);
    return () => clearTimeout(t);
  }, [top, warm]);
  // Time-of-day greeting, set after mount so the pre-rendered HTML matches on every device.
  const [greeting, setGreeting] = useState('');
  useEffect(() => {
    const h = new Date().getHours();
    setGreeting(h < 5 ? 'Late night listening' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening');
  }, []);

  return (
    <section className="relative mb-6 overflow-hidden rounded-[28px] ring-1 ring-white/10 md:mb-8">
      {/* backdrop: this week's #1 cover, blurred */}
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        {top?.artwork && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={top.artwork.replace(/(1000x1000)(\.jpg)/, '480x480$2')} alt="" className="h-full w-full scale-125 object-cover opacity-40 blur-2xl" />
        )}
        <div className="absolute inset-0 bg-gradient-to-br from-[#2a1a08]/90 via-ink/80 to-[#2a0b1c]/90" />
        <div className="hero-blob -left-24 -top-28 h-72 w-72 bg-gold/30" />
        <div className="hero-blob -bottom-32 right-0 h-80 w-80 bg-rose/20" />
      </div>

      <div className="relative grid gap-6 p-5 xs:p-6 md:p-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:items-center lg:gap-10 lg:p-10">
        <div className="min-w-0">
          <p className="inline-flex items-center gap-2 rounded-full bg-white/[0.07] px-3 py-1 text-[11px] font-bold uppercase tracking-[0.2em] text-gold ring-1 ring-white/10">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-gold" aria-hidden="true" />
            {greeting || 'SAHU MUSIC'}
          </p>
          <h1 className="text-balance mt-4 text-[2.35rem] font-extrabold leading-[0.98] text-white xs:text-[2.7rem] md:text-5xl xl:text-[4rem]">
            Har Gaana, <span className="text-gold-gradient">Ek Jagah.</span>
          </h1>
          <p className="mt-3 max-w-md text-sm text-white/70 md:text-[15px]">Full songs, start to finish. No subscription, no sign-up — just press play.</p>
          <div className="mt-5 flex flex-wrap items-center gap-2.5">
            <button type="button" className="btn-gold !px-6 !py-3" disabled={!hits?.length} onClick={() => hits && playQueue(hits, 0)} {...intent}>
              <Icon name="play" size={18} /> Play Hindi hits
            </button>
            <Link href="/explore" className="btn-outline !py-3">
              <Icon name="compass" size={17} /> Explore
            </Link>
            <Link href="/download" className="inline-flex items-center gap-1.5 rounded-full px-3 py-3 text-sm font-semibold text-white/70 transition hover:text-white">
              <Icon name="download" size={16} /> Android app
            </Link>
          </div>
        </div>

        {/* this week's chart (tablet and desktop) */}
        <div className="hidden min-w-0 rounded-3xl bg-black/25 p-2.5 ring-1 ring-white/10 backdrop-blur-md md:block">
          <p className="px-2 pb-1.5 pt-1 text-[11px] font-bold uppercase tracking-[0.2em] text-white/50">Top Hindi this week</p>
          <div className="grid gap-x-2 md:grid-cols-2 lg:grid-cols-1">
            {loading || !hits
              ? Array.from({ length: 4 }, (_, i) => (
                  <div key={i} className="flex items-center gap-3 p-1.5" aria-hidden="true">
                    <div className="skeleton h-12 w-12 rounded-xl" />
                    <div className="flex-1">
                      <div className="skeleton h-3 w-2/3 rounded" />
                      <div className="skeleton mt-2 h-3 w-1/3 rounded" />
                    </div>
                  </div>
                ))
              : hits.slice(0, 4).map((t, i) => <ChartLine key={trackKey(t)} track={t} rank={i + 1} list={hits} />)}
          </div>
        </div>
      </div>
    </section>
  );
}

function MoodChips() {
  const moods = MOODS.map((s) => visibleCategories.find((c) => c.slug === s)).filter((c): c is NonNullable<typeof c> => !!c);
  return (
    <nav aria-label="Moods" className="no-scrollbar -mx-4 mb-8 flex gap-2 overflow-x-auto px-4 md:-mx-6 md:px-6 lg:-mx-8 lg:px-8">
      {moods.map((c) => (
        <Link key={c.slug} href={`/genre/${c.slug}`} className="chip">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: c.tint[0], boxShadow: `0 0 10px ${c.tint[0]}` }} aria-hidden="true" />
          {c.name}
        </Link>
      ))}
    </nav>
  );
}

export function HomeView({ snapshot }: { snapshot: HomeSnapshot | null }) {
  const { history } = useLibrary();
  const at = snapshot?.at ?? 0;
  const built = (slug: string) => (snapshot?.rows[slug]?.length ? { at, data: snapshot.rows[slug] } : null);
  const trending = useAsync(() => music.getHindiHits(20), [], {
    key: 'home:hindi-hits',
    keep: keepRow,
    initial: snapshot?.hits.length ? { at, data: snapshot.hits } : null,
    refreshDelayMs: 1500,
  });
  const playlists = useAsync(() => music.getTrendingCollections({ limit: 12 }), [], {
    key: 'home:playlists',
    keep: keepRow,
    initial: snapshot?.playlists.length ? { at, data: snapshot.playlists as Collection[] } : null,
    refreshDelayMs: 4000,
  });
  const verified = useAsync(() => fetchVerifiedSongs(20), []);
  const recent = history.slice(0, 8).map((h) => h.track);

  return (
    <>
      <Hero hits={trending.data} loading={trending.loading} />
      <MoodChips />

      {recent.length > 0 && (
        <Section title="Jump back in" subtitle="Your recently played songs" href="/library?tab=history">
          <div className="stagger grid grid-cols-1 gap-2.5 xs:grid-cols-2 xl:grid-cols-4">
            {recent.map((t, i) => (
              <div key={trackKey(t)} className={i >= 4 ? 'hidden xs:block' : ''}>
                <QuickTile track={t} list={recent} index={i} />
              </div>
            ))}
          </div>
        </Section>
      )}

      <Section title="Hindi hits" subtitle="Most played full-length Hindi songs" href="/genre/hindi">
        {trending.loading ? (
          <CardSkeletonRow />
        ) : trending.error ? (
          <ErrorState message={trending.error} onRetry={trending.reload} />
        ) : trending.data!.length === 0 ? (
          <EmptyState title="No songs available right now" text="The music providers returned no playable songs. Please try again shortly." />
        ) : (
          <Row>{trending.data!.map((t, i) => <TrackCard key={trackKey(t)} track={t} list={trending.data!} index={i} />)}</Row>
        )}
      </Section>

      {/* original film songs (YouTube official player) and live Bollywood radio come right after the Hindi hits */}
      {youtubeEnabled && <CategoryRow slug="bollywood-top" />}
      <CategoryRow slug={HOME_RADIO_ROW} initial={built(HOME_RADIO_ROW)} refreshDelayMs={2500} />

      <Section title="Browse categories" href="/explore">
        <div className="stagger grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:gap-3 lg:grid-cols-4 xl:grid-cols-5">
          {visibleCategories.map((c) => <CategoryTile key={c.slug} category={c} />)}
        </div>
      </Section>

      {(verified.data?.length ?? 0) > 0 && (
        <Section title="Verified by SAHU MUSIC" subtitle="Songs whose rights were reviewed by our team">
          <Row>{verified.data!.map((t, i) => <TrackCard key={trackKey(t)} track={t} list={verified.data!} index={i} />)}</Row>
        </Section>
      )}

      <AdSlot />

      <Section title="Trending playlists">
        {playlists.loading ? (
          <CardSkeletonRow />
        ) : playlists.error ? (
          <ErrorState message={playlists.error} onRetry={playlists.reload} />
        ) : (
          <Row>{playlists.data!.map((c) => <CollectionCard key={`${c.provider}:${c.providerCollectionId}`} collection={c} />)}</Row>
        )}
      </Section>

      {/* Rows built into the page show at once (scrolling never waits); if one is old it is
          refreshed in the background, one row after another. Rows without built data load as
          they come near the screen. */}
      {HOME_ROWS.map((slug, i) => {
        const seed = built(slug);
        const row = <CategoryRow slug={slug} initial={seed} refreshDelayMs={5000 + i * 2500} />;
        return seed ? <div key={slug}>{row}</div> : <LazyMount key={slug}>{row}</LazyMount>;
      })}
    </>
  );
}
