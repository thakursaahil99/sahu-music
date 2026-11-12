'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { trackKey, type Track } from '@sahu/models';
import { CATEGORIES, sanitizeQuery } from '@sahu/shared';
import { Artwork } from '@/components/Artwork';
import { Icon } from '@/components/icons';
import { LoadMore, TrackRow, useWarm } from '@/components/tracks';
import { ArtistCard, CardSkeletonRow, CategoryTile, CollectionCard, EmptyState, ErrorState, ListSkeleton, PageHeader, Row, Section } from '@/components/ui';
import { useAsync, useDebounced, usePaged } from '@/lib/hooks';
import { useLibrary } from '@/lib/library';
import { music, visibleCategories, youtubeEnabled } from '@/lib/music';
import { usePlayer } from '@/lib/player';

/** The best match, big (desktop): one tap plays it. */
function TopResult({ track, list }: { track: Track; list: Track[] }) {
  const { current, isPlaying, playQueue, toggle } = usePlayer();
  const intent = useWarm(track);
  const active = !!current && trackKey(current) === trackKey(track);
  return (
    <div {...intent} className="group relative overflow-hidden rounded-3xl bg-white/[0.04] p-5 ring-1 ring-white/[0.07] transition hover:bg-white/[0.07]">
      <Artwork mirrors={track.artworkMirrors} src={track.artwork} alt="" rounded="rounded-2xl" className="h-28 w-28 shadow-lift" />
      <p className={`mt-4 line-clamp-2 font-display text-2xl font-bold leading-tight ${active ? 'text-dyn' : 'text-white'}`}>{track.title}</p>
      <p className="mt-1 truncate text-sm text-white/60">
        <span className="mr-2 rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white/80">{track.live ? 'Live' : 'Song'}</span>
        {track.artist}
      </p>
      <button
        type="button"
        onClick={() => (active ? toggle() : playQueue(list, 0))}
        aria-label={active && isPlaying ? `Pause ${track.title}` : `Play ${track.title}`}
        className="absolute bottom-5 right-5 flex h-14 w-14 items-center justify-center rounded-full bg-white text-ink shadow-lift transition duration-300 hover:scale-105 [@media(hover:hover)]:translate-y-2 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:translate-y-0 [@media(hover:hover)]:group-hover:opacity-100"
      >
        <Icon name={active && isPlaying ? 'pause' : 'play'} size={24} />
      </button>
    </div>
  );
}

function Results({ query }: { query: string }) {
  const { history, favorites } = useLibrary();
  // Instant answers from songs already seen in this session, your history and favourites.
  const quick = useMemo(
    () => music.quickMatches(query, 6, [...favorites, ...history.map((h) => h.track)]),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [query],
  );
  // Songs from the fast sources are shown as soon as they arrive; slower sources are merged in after.
  const tracks = usePaged<Track>(
    (offset, limit, live) => music.searchTracks(query, { offset, limit }, { userSearch: true, signal: live?.signal, onPartial: live?.onPartial }),
    trackKey,
    [query],
    50,
  );
  // Artists and playlists wait until typing has paused a little longer, which leaves the request budget to the songs.
  const settled = useDebounced(query, 350);
  const artists = useAsync(() => music.searchArtists(settled, { limit: 10 }), [settled]);
  const collections = useAsync(() => music.searchCollections(settled, { limit: 10 }), [settled]);
  const artistsLoading = artists.loading || settled !== query;
  const collectionsLoading = collections.loading || settled !== query;
  const showQuick = tracks.loading && quick.length > 0;
  const songs = showQuick ? quick : tracks.items;
  // The top result is the most likely tap: open its song while the listener reads the list.
  const { warm } = usePlayer();
  const top = tracks.loading ? undefined : tracks.items[0];
  useEffect(() => {
    if (!top) return;
    const t = setTimeout(() => warm(top, 'likely'), 250);
    return () => clearTimeout(t);
  }, [top, warm]);

  return (
    <>
      <Section title="Songs">
        {tracks.loading && !showQuick ? (
          <ListSkeleton />
        ) : tracks.error ? (
          <ErrorState message={tracks.error} onRetry={tracks.reload} />
        ) : songs.length === 0 ? (
          <EmptyState title={`No songs found for "${query}"`} text="Only tracks with confirmed streaming permission are shown. Try a different spelling or a broader search." />
        ) : (
          <>
            <div className="lg:grid lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] lg:gap-6 xl:grid-cols-[minmax(0,24rem)_minmax(0,1fr)]">
              <div className="hidden lg:block">
                <p className="mb-2 text-sm font-bold text-white/60">Top result</p>
                <TopResult track={songs[0]} list={songs} />
              </div>
              <div className="min-w-0">
                <p className="mb-2 hidden text-sm font-bold text-white/60 lg:block">Best matches</p>
                {songs.slice(0, 5).map((t, i) => (
                  <TrackRow key={trackKey(t)} track={t} list={songs} index={i} />
                ))}
              </div>
            </div>
            <div className="stagger lg:mt-2">
              {songs.slice(5).map((t, i) => (
                <TrackRow key={trackKey(t)} track={t} list={songs} index={i + 5} />
              ))}
            </div>
            {(tracks.refining || showQuick) && (
              <p className="mt-3 flex items-center gap-2 text-xs text-white/50" role="status">
                <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/20 border-t-gold" aria-hidden="true" />
                {showQuick ? 'Songs you have seen · searching every source…' : 'Checking more sources…'}
              </p>
            )}
            {!showQuick && <LoadMore hasMore={tracks.hasMore} loading={tracks.loadingMore} onClick={tracks.loadMore} />}
            <p className="mt-5 rounded-2xl bg-white/[0.04] px-4 py-3 text-xs text-white/50 ring-1 ring-white/[0.06]">
              {youtubeEnabled
                ? 'Every result is a complete song. Original film songs (marked YouTube) play in YouTube’s official player, which stays on screen while it plays. LIVE results are radio stations.'
                : 'Every result is a complete song. Original film songs need the YouTube player, which is not set up on this site yet, so you see the closest full-length versions here: covers, remixes, uploads and LIVE radio stations.'}
            </p>
          </>
        )}
      </Section>

      {(artistsLoading || (artists.data?.length ?? 0) > 0) && (
        <Section title="Artists">
          {artistsLoading ? <CardSkeletonRow /> : <Row>{artists.data!.map((a) => <ArtistCard key={`${a.provider}:${a.providerArtistId}`} artist={a} />)}</Row>}
        </Section>
      )}

      {(collectionsLoading || (collections.data?.length ?? 0) > 0) && (
        <Section title="Playlists & albums">
          {collectionsLoading ? (
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
  const query = sanitizeQuery(useDebounced(text, 170));

  // keep the URL shareable: /search?q=…
  useEffect(() => {
    const currentQ = sanitizeQuery(new URLSearchParams(window.location.search).get('q') ?? '');
    if (query !== currentQ) router.replace(query ? `/search/?q=${encodeURIComponent(query)}` : '/search/', { scroll: false });
  }, [query, router]);

  return (
    <>
      <div className="hidden md:block">
        <PageHeader icon="search" eyebrow="Find anything" title="Search" subtitle="Songs, artists, albums and playlists across every source" />
      </div>
      <h1 className="mb-4 text-[2rem] font-bold text-white md:hidden">Search</h1>
      <form role="search" onSubmit={(e) => e.preventDefault()} className="group relative mb-7 max-w-2xl">
        <Icon name="search" size={20} className="pointer-events-none absolute left-5 top-1/2 -translate-y-1/2 text-ink/60" />
        <input
          type="search"
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={80}
          autoFocus
          placeholder="What do you want to listen to?"
          aria-label="Search songs, artists and playlists"
          className="w-full rounded-2xl bg-white py-3.5 pl-14 pr-14 text-base font-medium text-ink shadow-lift transition placeholder:font-normal placeholder:text-ink/50 focus:outline-none focus:ring-4 focus:ring-gold/40"
        />
        {text && (
          <button type="button" onClick={() => setText('')} className="icon-btn absolute right-2 top-1/2 -translate-y-1/2 text-ink/60 hover:bg-ink/10 hover:text-ink" aria-label="Clear search">
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
          <div className="stagger grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
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
