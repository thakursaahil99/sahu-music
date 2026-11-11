'use client';

import { useState } from 'react';
import { trackKey, type Track } from '@sahu/models';
import { CATEGORIES } from '@sahu/shared';
import { AdSlot } from '@/components/AdSlot';
import { Icon } from '@/components/icons';
import { LoadMore, TrackList } from '@/components/tracks';
import { CardSkeletonRow, CategoryTile, CollectionCard, EmptyState, ErrorState, ListSkeleton, Row, Section } from '@/components/ui';
import { useAsync, usePaged } from '@/lib/hooks';
import { music, visibleCategories } from '@/lib/music';
import { usePlayer } from '@/lib/player';

const TIMES = [
  { id: 'week', label: 'This week' },
  { id: 'month', label: 'This month' },
  { id: 'allTime', label: 'All time' },
] as const;

export default function ExplorePage() {
  const { playQueue } = usePlayer();
  const genres = useAsync(() => music.getGenres(), []);
  const playlists = useAsync(() => music.getTrendingCollections({ limit: 12 }), []);
  const [genre, setGenre] = useState<string>('');
  const [time, setTime] = useState<(typeof TIMES)[number]['id']>('week');

  const chart = usePaged<Track>(
    (offset, limit) => music.getTrending({ genre: genre || undefined, time, limit, offset }),
    trackKey,
    [genre, time],
    20,
  );

  return (
    <>
      <h1 className="mb-6 text-3xl font-extrabold text-white">Explore</h1>

      <Section title="Categories">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {visibleCategories.map((c) => <CategoryTile key={c.slug} category={c} />)}
        </div>
      </Section>

      <Section title="Charts by genre" subtitle="Genres come straight from the music providers">
        <div className="no-scrollbar -mx-4 mb-3 flex gap-2 overflow-x-auto px-4 md:-mx-8 md:px-8" role="tablist" aria-label="Genres">
          <button type="button" role="tab" aria-selected={genre === ''} onClick={() => setGenre('')} className={`chip ${genre === '' ? 'chip-active' : ''}`}>
            All genres
          </button>
          {(genres.data ?? []).map((g) => (
            <button key={g} type="button" role="tab" aria-selected={genre === g} onClick={() => setGenre(g)} className={`chip ${genre === g ? 'chip-active' : ''}`}>
              {g}
            </button>
          ))}
        </div>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {TIMES.map((t) => (
            <button key={t.id} type="button" onClick={() => setTime(t.id)} aria-pressed={time === t.id} className={`chip !py-1 text-xs ${time === t.id ? 'chip-active' : ''}`}>
              {t.label}
            </button>
          ))}
          <button type="button" className="btn-gold ml-auto !py-2" disabled={chart.items.length === 0} onClick={() => playQueue(chart.items, 0)}>
            <Icon name="play" size={16} /> Play all
          </button>
        </div>
        {chart.loading ? (
          <ListSkeleton />
        ) : chart.error ? (
          <ErrorState message={chart.error} onRetry={chart.reload} />
        ) : chart.items.length === 0 ? (
          <EmptyState title="Nothing here yet" text="The providers have no playable tracks for this genre and period. Try another period." />
        ) : (
          <>
            <TrackList tracks={chart.items} />
            <LoadMore hasMore={chart.hasMore} loading={chart.loadingMore} onClick={chart.loadMore} />
          </>
        )}
      </Section>

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
    </>
  );
}
