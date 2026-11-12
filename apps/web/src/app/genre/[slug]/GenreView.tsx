'use client';

import { useRef } from 'react';
import { trackKey, type Track } from '@sahu/models';
import { formatDuration, getCategory } from '@sahu/shared';
import { Artwork } from '@/components/Artwork';
import { Icon } from '@/components/icons';
import { LoadMore, TrackList } from '@/components/tracks';
import { ConfigNotice, EmptyState, ErrorState, ListSkeleton, useCategoryArt } from '@/components/ui';
import { usePaged } from '@/lib/hooks';
import { music, youtubeEnabled } from '@/lib/music';
import { usePlayer } from '@/lib/player';

export function GenreView({ slug }: { slug: string }) {
  const cat = getCategory(slug)!;
  const { playQueue } = usePlayer();
  const list = usePaged<Track>((offset, limit) => music.getCategoryTracks(cat.strategy, { offset, limit }), trackKey, [slug], 20);
  const headerRef = useRef<HTMLElement>(null);
  const cachedArt = useCategoryArt(cat, headerRef);
  const cover = cachedArt ?? list.items.find((t) => t.artwork)?.artworkLarge ?? list.items.find((t) => t.artwork)?.artwork ?? null;

  const how =
    cat.strategy.kind === 'genre'
      ? `Provider genre: ${cat.strategy.genre}`
      : cat.strategy.kind === 'search'
        ? `Live search: ${cat.strategy.queries.join(', ')}${cat.strategy.years ? ` · released ${cat.strategy.years[0]}–${cat.strategy.years[1]}` : ''}`
        : cat.strategy.kind === 'radio'
          ? 'Live radio stations from the Radio Browser directory'
          : cat.strategy.kind === 'youtube-chart'
            ? 'Most popular music videos in India, played in YouTube’s official player'
            : 'Live trending chart';
  const hasPreviews = list.items.some((t) => t.preview);
  const totalSeconds = list.items.reduce((s, t) => s + (t.duration || 0), 0);
  const artists = [...new Set(list.items.map((t) => t.artist))].slice(0, 3);

  return (
    <>
      <header
        ref={headerRef}
        className="relative mb-8 overflow-hidden rounded-[2rem] p-6 ring-1 ring-white/10 md:p-10"
        style={{ background: `radial-gradient(120% 120% at 0% 0%, rgba(255,255,255,0.14), transparent 50%), linear-gradient(135deg, ${cat.tint[0]} 0%, color-mix(in srgb, ${cat.tint[0]} 30%, #080808) 100%)` }}
      >
        {/* blurred cover as atmosphere */}
        {cover && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cover} alt="" aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full scale-125 object-cover opacity-25 blur-3xl" />
        )}
        <div className="relative flex flex-col gap-6 sm:flex-row sm:items-end">
          <div className="w-36 shrink-0 animate-pop-in sm:w-48 md:w-56">
            <Artwork src={cover} alt={`${cat.name} cover`} size="lg" rounded="rounded-2xl" className="shadow-lift ring-1 ring-white/15" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="inline-flex items-center gap-2 rounded-full bg-black/30 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.2em] text-white/80 backdrop-blur">
              <Icon name="music" size={12} /> Category
            </p>
            <h1 className="mt-3 break-words text-4xl font-extrabold leading-[1.05] text-white md:text-6xl">{cat.name}</h1>
            <p className="mt-3 max-w-2xl text-sm text-white/80 md:text-base">{cat.blurb}</p>
            <p className="mt-2 text-xs text-white/60">
              {list.items.length > 0 && (
                <>
                  <span className="font-semibold text-white/85">{list.items.length}{list.hasMore ? '+' : ''} songs</span>
                  {totalSeconds > 0 && <> · {formatDuration(totalSeconds)}</>}
                  {artists.length > 0 && <> · {artists.join(', ')}</>}
                  {' · '}
                </>
              )}
              {how}
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <button type="button" className="btn-gold !px-6 !py-3" disabled={list.items.length === 0} onClick={() => playQueue(list.items, 0)}>
                <Icon name="play" size={18} /> Play all
              </button>
              <button
                type="button"
                className="btn-outline !py-3 backdrop-blur"
                disabled={list.items.length < 2}
                onClick={() => playQueue(list.items, Math.floor(Math.random() * list.items.length))}
              >
                <Icon name="shuffle" size={18} /> Shuffle
              </button>
            </div>
          </div>
        </div>
      </header>

      {cat.needs === 'youtube' && !youtubeEnabled ? (
        <ConfigNotice title="This category needs the YouTube player">
          <p>
            Site owner: create a free YouTube Data API key and set <code className="text-gold">NEXT_PUBLIC_YOUTUBE_API_KEY</code>, then rebuild. See
            docs/MUSIC-SOURCES.md.
          </p>
        </ConfigNotice>
      ) : list.loading ? (
        <ListSkeleton />
      ) : list.error ? (
        <ErrorState message={list.error} onRetry={list.reload} />
      ) : list.items.length === 0 ? (
        <EmptyState
          title={`No ${cat.name} tracks available right now`}
          text="This category is filled only from authorised music APIs. The providers currently have nothing playable for it, so we show nothing rather than invent songs."
        />
      ) : (
        <>
          {hasPreviews && (
            <p className="mb-3 rounded-xl bg-white/[0.04] px-3 py-2 text-xs text-muted ring-1 ring-white/[0.07]">
              Songs marked <span className="font-bold text-gold">PREVIEW</span> are 30-second clips from Apple Music. Film songs are owned by their music labels, so
              the full song opens on Apple Music or YouTube from the track&apos;s ⋯ menu.
            </p>
          )}
          <div className="panel p-2 md:p-3">
            <TrackList tracks={list.items} />
          </div>
          <LoadMore hasMore={list.hasMore} loading={list.loadingMore} onClick={list.loadMore} />
        </>
      )}
    </>
  );
}
