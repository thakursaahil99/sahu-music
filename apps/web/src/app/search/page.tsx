'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { trackKey, type Track } from '@sahu/models';
import { CATEGORIES, sanitizeQuery } from '@sahu/shared';
import { Icon } from '@/components/icons';
import { LoadMore, TrackList } from '@/components/tracks';
import { ArtistCard, CardSkeletonRow, CategoryTile, CollectionCard, EmptyState, ErrorState, ListSkeleton, Row, Section } from '@/components/ui';
import { useAsync, useDebounced, usePaged } from '@/lib/hooks';
import { music, visibleCategories, youtubeEnabled } from '@/lib/music';

function Results({ query }: { query: string }) {
  const tracks = usePaged<Track>((offset, limit) => music.searchTracks(query, { offset, limit }, { userSearch: true }), trackKey, [query], 50);
  const artists = useAsync(() => music.searchArtists(query, { limit: 10 }), [query]);
  const collections = useAsync(() => music.searchCollections(query, { limit: 10 }), [query]);

  return (
    <>
      {(artists.loading || (artists.data?.length ?? 0) > 0) && (
        <Section title="Artists">
          {artists.loading ? <CardSkeletonRow /> : <Row>{artists.data!.map((a) => <ArtistCard key={`${a.provider}:${a.providerArtistId}`} artist={a} />)}</Row>}
        </Section>
      )}

      <Section title="Songs">
        {tracks.loading ? (
          <ListSkeleton />
        ) : tracks.error ? (
          <ErrorState message={tracks.error} onRetry={tracks.reload} />
        ) : tracks.items.length === 0 ? (
          <EmptyState title={`No songs found for "${query}"`} text="Only tracks with confirmed streaming permission are shown. Try a different spelling or a broader search." />
        ) : (
          <>
            <TrackList tracks={tracks.items} />
            <LoadMore hasMore={tracks.hasMore} loading={tracks.loadingMore} onClick={tracks.loadMore} />
            <p className="mt-5 rounded-lg bg-white/5 px-3 py-2 text-xs text-muted">
              {youtubeEnabled
                ? 'Every result is a complete song. Original film songs (marked YouTube) play in YouTube’s official player, which stays on screen while it plays. LIVE results are radio stations.'
                : 'Every result is a complete song. Original film songs need the YouTube player, which is not set up on this site yet, so you see the closest full-length versions here: covers, remixes, uploads and LIVE radio stations.'}
            </p>
          </>
        )}
      </Section>

      {(collections.loading || (collections.data?.length ?? 0) > 0) && (
        <Section title="Playlists & albums">
          {collections.loading ? (
            <CardSkeletonRow />
          ) : (
            <Row>{collections.data!.map((c) => <CollectionCard key={`${c.provider}:${c.providerCollectionId}`} collection={c} />)}</Row>
          )}
        </Section>
      )}
    </>
  );
}

function SearchInner() {
  const router = useRouter();
  const params = useSearchParams();
  const initial = sanitizeQuery(params.get('q') ?? '');
  const [text, setText] = useState(initial);
  const query = sanitizeQuery(useDebounced(text, 220));

  // keep the URL shareable: /search?q=…
  useEffect(() => {
    const currentQ = sanitizeQuery(new URLSearchParams(window.location.search).get('q') ?? '');
    if (query !== currentQ) router.replace(query ? `/search/?q=${encodeURIComponent(query)}` : '/search/', { scroll: false });
  }, [query, router]);

  return (
    <>
      <h1 className="mb-4 text-3xl font-extrabold text-white">Search</h1>
      <form role="search" onSubmit={(e) => e.preventDefault()} className="relative mb-8 max-w-2xl">
        <Icon name="search" size={20} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted" />
        <input
          type="search"
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={80}
          autoFocus
          placeholder="Songs, artists, playlists…"
          aria-label="Search songs, artists and playlists"
          className="input !rounded-full !py-3 !pl-12 !pr-12 text-base"
        />
        {text && (
          <button type="button" onClick={() => setText('')} className="icon-btn absolute right-1 top-1/2 -translate-y-1/2 text-muted hover:text-white" aria-label="Clear search">
            <Icon name="close" size={18} />
          </button>
        )}
      </form>

      {query.length >= 2 ? (
        <Results query={query} />
      ) : (
        <>
        <Section title="Popular searches">
          <div className="stagger flex flex-wrap gap-2">
            {['Arijit Singh', 'Hindi songs', 'Bollywood', 'Punjabi', 'Bhajan', 'Lofi Hindi', 'Ghazal', 'Haryanvi', 'Old Hindi songs', 'Romantic Hindi', 'Sad songs', 'Qawwali'].map((s) => (
              <button key={s} type="button" className="chip" onClick={() => setText(s)}>
                {s}
              </button>
            ))}
          </div>
        </Section>
        <Section title="Browse all">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {visibleCategories.map((c) => <CategoryTile key={c.slug} category={c} />)}
          </div>
        </Section>
        </>
      )}
    </>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={<ListSkeleton />}>
      <SearchInner />
    </Suspense>
  );
}
