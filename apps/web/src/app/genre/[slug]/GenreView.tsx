'use client';

import { trackKey, type Track } from '@sahu/models';
import { getCategory } from '@sahu/shared';
import { Icon } from '@/components/icons';
import { LoadMore, TrackList } from '@/components/tracks';
import { ConfigNotice, EmptyState, ErrorState, ListSkeleton } from '@/components/ui';
import { usePaged } from '@/lib/hooks';
import { music, youtubeEnabled } from '@/lib/music';
import { usePlayer } from '@/lib/player';

export function GenreView({ slug }: { slug: string }) {
  const cat = getCategory(slug)!;
  const { playQueue } = usePlayer();
  const list = usePaged<Track>((offset, limit) => music.getCategoryTracks(cat.strategy, { offset, limit }), trackKey, [slug], 20);

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

  return (
    <>
      <header className="mb-6 overflow-hidden rounded-3xl p-6 ring-1 ring-white/5 md:p-10" style={{ background: `linear-gradient(135deg, ${cat.tint[0]} 0%, ${cat.tint[1]} 80%)` }}>
        <p className="text-xs font-bold uppercase tracking-[0.3em] text-white/70">Category</p>
        <h1 className="mt-2 text-3xl font-extrabold text-white md:text-5xl">{cat.name}</h1>
        <p className="mt-2 text-sm text-white/80">{cat.blurb}</p>
        <p className="mt-1 text-xs text-white/50">{how} · only tracks with confirmed streaming permission</p>
        <div className="mt-5 flex gap-3">
          <button type="button" className="btn-gold" disabled={list.items.length === 0} onClick={() => playQueue(list.items, 0)}>
            <Icon name="play" size={18} /> Play all
          </button>
          <button
            type="button"
            className="btn-outline"
            disabled={list.items.length < 2}
            onClick={() => playQueue(list.items, Math.floor(Math.random() * list.items.length))}
          >
            <Icon name="shuffle" size={18} /> Shuffle
          </button>
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
            <p className="mb-3 rounded-lg bg-coal px-3 py-2 text-xs text-muted">
              Songs marked <span className="font-bold text-gold">PREVIEW</span> are 30-second clips from Apple Music. Film songs are owned by their music labels, so
              the full song opens on Apple Music or YouTube from the track&apos;s ⋯ menu.
            </p>
          )}
          <TrackList tracks={list.items} />
          <LoadMore hasMore={list.hasMore} loading={list.loadingMore} onClick={list.loadMore} />
        </>
      )}
    </>
  );
}
