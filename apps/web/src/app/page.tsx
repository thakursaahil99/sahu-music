'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { trackKey } from '@sahu/models';
import { CATEGORIES, getCategory } from '@sahu/shared';
import { AdSlot } from '@/components/AdSlot';
import { Artwork } from '@/components/Artwork';
import { Icon } from '@/components/icons';
import { QuickTile, TrackCard } from '@/components/tracks';
import { CardSkeletonRow, CategoryTile, CollectionCard, EmptyState, ErrorState, LazyMount, Row, Section } from '@/components/ui';
import { fetchVerifiedSongs } from '@/lib/catalogue';
import { useAsync } from '@/lib/hooks';
import { useLibrary } from '@/lib/library';
import { music, visibleCategories, youtubeEnabled } from '@/lib/music';
import { usePlayer } from '@/lib/player';

/** Position, tilt and stacking of the three hero covers. */
const HERO_SLOTS = ['left-[7.25rem] top-0 z-20 w-52 rotate-2', 'left-0 top-12 z-10 w-44 -rotate-6', 'right-0 top-16 z-10 w-44 rotate-[8deg]'];
/** Rank badge corner per slot – the side that is not covered by the front (#1) cover. */
const HERO_BADGE = ['right-2', 'left-2', 'right-2'];

function CategoryRow({ slug }: { slug: string }) {
  const cat = getCategory(slug)!;
  const { data, loading, error, reload } = useAsync(() => music.getCategoryTracks(cat.strategy, { limit: 12 }), [slug]);
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

export default function HomePage() {
  const { playQueue } = usePlayer();
  const { history } = useLibrary();
  const trending = useAsync(() => music.getHindiHits(20), []); // Hindi leads the home page
  const playlists = useAsync(() => music.getTrendingCollections({ limit: 12 }), []);
  const verified = useAsync(() => fetchVerifiedSongs(20), []);
  const recent = history.slice(0, 12).map((h) => h.track);
  const top3 = (trending.data ?? []).slice(0, 3);

  // Time-of-day greeting, set after mount so the pre-rendered HTML matches on every device.
  const [greeting, setGreeting] = useState('');
  useEffect(() => {
    const h = new Date().getHours();
    setGreeting(h < 5 ? 'Late night listening' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening');
  }, []);

  return (
    <>
      <section className="relative mb-10 flex items-center justify-between gap-10 overflow-hidden rounded-[2rem] bg-gradient-to-br from-[#2a2110] via-[#15120c] to-[#0b0809] p-6 ring-1 ring-gold/25 md:p-10 lg:p-12">
        <div className="hero-blob -left-16 -top-24 h-72 w-72 bg-gold/40" aria-hidden="true" />
        <div className="hero-blob -bottom-28 right-10 h-80 w-80 bg-[#7a1f3d]/50 [animation-delay:-6s]" aria-hidden="true" />
        <div className="stagger relative z-10 min-w-0 max-w-2xl">
          <p className="inline-flex items-center gap-2 rounded-full border border-gold/30 bg-gold/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.2em] text-gold">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-gold" aria-hidden="true" />
            {greeting || 'SAHU MUSIC'}
          </p>
          <h1 className="mt-4 text-4xl font-extrabold leading-[1.05] text-white sm:text-5xl xl:text-6xl">
            Har Gaana, <span className="text-gold-gradient block">Ek Jagah.</span>
          </h1>
          <p className="mt-4 max-w-xl text-sm text-white/75 md:text-base">
            Free music streaming with no subscription. Every song plays in full, from start to finish, streamed from open platforms where artists share
            their own work.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <button type="button" className="btn-gold" disabled={!trending.data?.length} onClick={() => trending.data && playQueue(trending.data, 0)}>
              <Icon name="play" size={18} /> Play Hindi hits
            </button>
            <Link href="/explore" className="btn-outline">
              Explore music
            </Link>
            <Link href="/download" className="btn-outline">
              <Icon name="download" size={16} /> Get the Android app
            </Link>
          </div>
          <ul className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-xs font-medium text-white/70">
            {['Full songs, start to finish', 'No subscription', 'Listen without an account'].map((f) => (
              <li key={f} className="flex items-center gap-1.5">
                <span className="flex h-4 w-4 items-center justify-center rounded-full bg-gold/20 text-gold">
                  <Icon name="check" size={11} />
                </span>
                {f}
              </li>
            ))}
          </ul>
        </div>

        {/* this week's top three covers, fanned out – click one to play from it */}
        <div className="relative z-10 hidden h-72 w-[27rem] shrink-0 lg:block" aria-label="Top Hindi tracks">
          {top3.length === 0
            ? HERO_SLOTS.map((slot) => <div key={slot} className={`skeleton absolute aspect-square rounded-2xl ${slot}`} aria-hidden="true" />)
            : top3.map((t, i) => (
                <button
                  key={trackKey(t)}
                  type="button"
                  onClick={() => playQueue(trending.data!, i)}
                  aria-label={`Play ${t.title} by ${t.artist}`}
                  className={`group absolute overflow-hidden rounded-2xl shadow-lift ring-1 ring-white/15 transition duration-500 hover:!z-30 hover:rotate-0 hover:scale-105 hover:ring-gold/60 ${HERO_SLOTS[i]}`}
                >
                  <Artwork src={t.artworkLarge || t.artwork} alt="" rounded="rounded-none" />
                  <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent p-3 pt-10 text-left">
                    <span className="block truncate text-sm font-bold text-white">{t.title}</span>
                    <span className="block truncate text-xs text-white/70">{t.artist}</span>
                  </span>
                  <span className={`absolute ${HERO_BADGE[i]} top-2 flex h-7 min-w-7 items-center justify-center rounded-full bg-black/60 px-2 text-xs font-extrabold text-gold backdrop-blur`}>#{i + 1}</span>
                  <span className="absolute left-1/2 top-1/2 flex h-12 w-12 -translate-x-1/2 -translate-y-1/2 scale-75 items-center justify-center rounded-full bg-gold text-ink opacity-0 shadow-glow transition duration-300 group-hover:scale-100 group-hover:opacity-100">
                    <Icon name="play" size={20} />
                  </span>
                </button>
              ))}
        </div>
      </section>

      {recent.length > 0 && (
        <Section title="Jump back in" subtitle="Your recently played tracks" href="/library?tab=history">
          <div className="stagger grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {recent.slice(0, 8).map((t, i) => <QuickTile key={trackKey(t)} track={t} list={recent} index={i} />)}
          </div>
        </Section>
      )}

      <Section title="Hindi hits" subtitle="Most played full-length Hindi tracks" href="/genre/hindi">
        {trending.loading ? (
          <CardSkeletonRow />
        ) : trending.error ? (
          <ErrorState message={trending.error} onRetry={trending.reload} />
        ) : trending.data!.length === 0 ? (
          <EmptyState title="No tracks available right now" text="The music providers returned no playable tracks. Please try again shortly." />
        ) : (
          <Row>{trending.data!.map((t, i) => <TrackCard key={trackKey(t)} track={t} list={trending.data!} index={i} />)}</Row>
        )}
      </Section>

      {/* original film songs (YouTube official player) and live Bollywood radio come right after the Hindi hits */}
      {youtubeEnabled && <CategoryRow slug="bollywood-top" />}
      <CategoryRow slug="bollywood-radio" />

      <Section title="Browse categories" href="/explore">
        <div className="stagger grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {visibleCategories.map((c) => <CategoryTile key={c.slug} category={c} />)}
        </div>
      </Section>

      {(verified.data?.length ?? 0) > 0 && (
        <Section title="Verified by SAHU MUSIC" subtitle="Tracks whose rights were reviewed by our team">
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

      {['bollywood', 'retro-radio', 'punjabi', 'old-hindi', 'devotional', 'bhakti-radio', 'romantic', 'lofi-hindi', 'independent-artists'].map((slug) => (
        <LazyMount key={slug}>
          <CategoryRow slug={slug} />
        </LazyMount>
      ))}
    </>
  );
}
