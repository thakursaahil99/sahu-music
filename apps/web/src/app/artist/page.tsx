'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { providerName, trackKey, type Track } from '@sahu/models';
import { formatCount, isSafeId } from '@sahu/shared';
import { Artwork } from '@/components/Artwork';
import { Icon } from '@/components/icons';
import { LoadMore, TrackList } from '@/components/tracks';
import { CollectionCard, EmptyState, ErrorState, ListSkeleton, Row, Section } from '@/components/ui';
import { useAsync, usePaged } from '@/lib/hooks';
import { music } from '@/lib/music';
import { usePlayer } from '@/lib/player';

function ArtistInner() {
  const params = useSearchParams();
  const provider = params.get('p') ?? '';
  const id = params.get('id') ?? '';
  const valid = isSafeId(provider) && isSafeId(id);
  const { playQueue } = usePlayer();

  const artist = useAsync(() => (valid ? music.getArtist(provider, id) : Promise.resolve(null)), [provider, id]);
  const albums = useAsync(() => (valid ? music.getArtistAlbums(provider, id, { limit: 12 }) : Promise.resolve([])), [provider, id]);
  const tracks = usePaged<Track>(
    (offset, limit) => (valid ? music.getArtistTracks(provider, id, { offset, limit }) : Promise.resolve([])),
    trackKey,
    [provider, id],
    20,
  );

  if (artist.loading) return <ListSkeleton />;
  if (artist.error) return <ErrorState message={artist.error} onRetry={artist.reload} />;
  if (!artist.data) return <EmptyState title="Artist not found" text="This artist link is invalid or the artist is no longer available." />;
  const a = artist.data;

  return (
    <>
      <header className="relative mb-8 overflow-hidden rounded-3xl bg-coal ring-1 ring-white/5">
        {a.cover && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={a.cover} alt="" className="absolute inset-0 h-full w-full object-cover opacity-30" loading="lazy" />
        )}
        <div className="relative flex flex-col items-center gap-5 bg-gradient-to-t from-ink via-ink/60 to-transparent p-6 text-center md:flex-row md:items-end md:p-10 md:text-left">
          <Artwork src={a.image} alt={a.name} size="lg" rounded="rounded-full" className="h-36 w-36 shrink-0 ring-2 ring-gold/50 md:h-44 md:w-44" />
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-[0.3em] text-gold">{a.verified ? 'Verified artist' : 'Artist'}</p>
            <h1 className="mt-1 break-words text-3xl font-extrabold text-white md:text-5xl">{a.name}</h1>
            <p className="mt-2 text-sm text-muted">
              {a.followerCount != null && `${formatCount(a.followerCount)} followers`}
              {a.trackCount != null && ` · ${formatCount(a.trackCount)} tracks`}
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-3 md:justify-start">
              <button type="button" className="btn-gold" disabled={tracks.items.length === 0} onClick={() => playQueue(tracks.items, 0)}>
                <Icon name="play" size={18} /> Play
              </button>
              {a.permalink && (
                <a href={a.permalink} target="_blank" rel="noopener noreferrer" className="btn-outline">
                  View on {providerName(a.provider)} <Icon name="external" size={14} />
                </a>
              )}
            </div>
          </div>
        </div>
      </header>

      {a.bio && <p className="mb-8 max-w-3xl whitespace-pre-line text-sm leading-relaxed text-white/70">{a.bio.slice(0, 600)}</p>}

      <Section title="Popular tracks">
        {tracks.loading ? (
          <ListSkeleton />
        ) : tracks.error ? (
          <ErrorState message={tracks.error} onRetry={tracks.reload} />
        ) : tracks.items.length === 0 ? (
          <EmptyState title="No playable tracks" text="This artist has no tracks with confirmed streaming permission." />
        ) : (
          <>
            <TrackList tracks={tracks.items} />
            <LoadMore hasMore={tracks.hasMore} loading={tracks.loadingMore} onClick={tracks.loadMore} />
          </>
        )}
      </Section>

      {(albums.data?.length ?? 0) > 0 && (
        <Section title="Albums">
          <Row>{albums.data!.map((c) => <CollectionCard key={c.providerCollectionId} collection={c} />)}</Row>
        </Section>
      )}
    </>
  );
}

export default function ArtistPage() {
  return (
    <Suspense fallback={<ListSkeleton />}>
      <ArtistInner />
    </Suspense>
  );
}
