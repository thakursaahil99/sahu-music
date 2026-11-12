'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { Artwork } from '@/components/Artwork';
import { Icon } from '@/components/icons';
import { TrackList } from '@/components/tracks';
import { ConfigNotice, EmptyState, ListSkeleton, PageHeader, Segmented } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { useLibrary } from '@/lib/library';
import { usePlayer } from '@/lib/player';
import type { Track } from '@sahu/models';

/** 2×2 mosaic of the first four distinct covers (one big cover when there are fewer). */
function PlaylistCover({ tracks, title }: { tracks: Track[]; title: string }) {
  const covers = [...new Set(tracks.map((t) => t.artwork).filter((a): a is string => !!a))].slice(0, 4);
  if (covers.length < 4) return <Artwork src={covers[0]} alt={title} rounded="rounded-xl" className="art-zoom ring-1 ring-white/5" />;
  return (
    <div className="art-zoom grid aspect-square grid-cols-2 overflow-hidden rounded-xl ring-1 ring-white/5" role="img" aria-label={title}>
      {covers.map((c) => (
        <Artwork key={c} src={c} alt="" size="sm" rounded="rounded-none" />
      ))}
    </div>
  );
}

const TABS = [
  { id: 'playlists', label: 'Playlists' },
  { id: 'favorites', label: 'Favourites' },
  { id: 'history', label: 'History' },
] as const;
type Tab = (typeof TABS)[number]['id'];

function LibraryInner() {
  const router = useRouter();
  const params = useSearchParams();
  const tab: Tab = (TABS.find((t) => t.id === params.get('tab'))?.id ?? 'playlists') as Tab;
  const { user, configured } = useAuth();
  const lib = useLibrary();
  const { playQueue } = usePlayer();
  const [title, setTitle] = useState('');
  const historyTracks = lib.history.map((h) => h.track);

  return (
    <>
      <PageHeader
        icon="library"
        eyebrow={user ? 'Synced to your account' : 'Saved on this device'}
        title="Your Library"
        subtitle={`${lib.playlists.length} playlists · ${lib.favorites.length} favourites · ${lib.history.length} played`}
      />

      {!user && (
        <div className="mb-6">
          <ConfigNotice title="You are listening as a guest">
            <p>
              Favourites, playlists and history are saved on this device only.{' '}
              {configured ? (
                <>
                  <Link href="/login" className="font-semibold text-gold underline">Log in</Link> to keep them in your account across devices.
                </>
              ) : (
                'Account sync is not available on this deployment yet.'
              )}
            </p>
          </ConfigNotice>
        </div>
      )}

      <div className="mb-6">
        <Segmented label="Library sections" items={TABS} value={tab} onChange={(id) => router.replace(`/library/?tab=${id}`, { scroll: false })} />
      </div>

      {!lib.ready ? (
        <ListSkeleton />
      ) : tab === 'playlists' ? (
        <>
          <form
            className="mb-6 flex max-w-lg gap-2"
            onSubmit={async (e) => {
              e.preventDefault();
              if (await lib.createPlaylist(title)) setTitle('');
            }}
          >
            <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} placeholder="New playlist name" aria-label="New playlist name" className="input" />
            <button type="submit" className="btn-gold shrink-0" disabled={!title.trim()}>
              <Icon name="plus" size={16} /> Create
            </button>
          </form>
          {lib.playlists.length === 0 ? (
            <EmptyState title="No playlists yet" text="Create a playlist above, then add songs from the ⋮ menu on any track." />
          ) : (
            <div className="stagger grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {lib.playlists.map((p) => (
                <Link key={p.id} href={`/playlist?p=user&id=${p.id}`} className="surface surface-hover card-lift group rounded-2xl p-3">
                  <PlaylistCover tracks={p.tracks} title={p.title} />
                  <p className="mt-3 truncate text-sm font-semibold text-white">{p.title}</p>
                  <p className="text-xs text-muted">{p.tracks.length} {p.tracks.length === 1 ? 'song' : 'songs'}</p>
                </Link>
              ))}
            </div>
          )}
        </>
      ) : tab === 'favorites' ? (
        lib.favorites.length === 0 ? (
          <EmptyState title="No favourites yet" text="Tap the heart on any song to save it here." />
        ) : (
          <>
            <button type="button" className="btn-gold mb-4" onClick={() => playQueue(lib.favorites, 0)}>
              <Icon name="play" size={18} /> Play all
            </button>
            <div className="panel p-2 md:p-3">
              <TrackList tracks={lib.favorites} />
            </div>
          </>
        )
      ) : historyTracks.length === 0 ? (
        <EmptyState title="No listening history" text="Songs you play will appear here." />
      ) : (
        <>
          <div className="mb-4 flex gap-3">
            <button type="button" className="btn-gold" onClick={() => playQueue(historyTracks, 0)}>
              <Icon name="play" size={18} /> Play all
            </button>
            <button type="button" className="btn-outline" onClick={lib.clearHistory}>
              <Icon name="trash" size={16} /> Clear history
            </button>
          </div>
          <div className="panel p-2 md:p-3">
            <TrackList tracks={historyTracks} />
          </div>
        </>
      )}
    </>
  );
}

export default function LibraryPage() {
  return (
    <Suspense fallback={<ListSkeleton />}>
      <LibraryInner />
    </Suspense>
  );
}
