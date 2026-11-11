'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { isSafeId } from '@sahu/shared';
import { useAsync } from '@/lib/hooks';
import { useLibrary } from '@/lib/library';
import { music } from '@/lib/music';
import { usePlayer } from '@/lib/player';
import { Artwork } from './Artwork';
import { Icon } from './icons';
import { TrackList } from './tracks';
import { EmptyState, ErrorState, ListSkeleton } from './ui';

/** A user's own playlist (guest: this device, signed in: Supabase). */
function UserPlaylistView({ id }: { id: string }) {
  const router = useRouter();
  const { playlists, ready, renamePlaylist, deletePlaylist, removeFromPlaylist } = useLibrary();
  const { playQueue } = usePlayer();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const pl = playlists.find((p) => p.id === id);

  if (!ready) return <ListSkeleton />;
  if (!pl) return <EmptyState title="Playlist not found" text="It may have been deleted, or it belongs to another account."><Link href="/library" className="btn-outline">Go to Library</Link></EmptyState>;

  return (
    <>
      <header className="mb-8 flex flex-col items-center gap-6 text-center md:flex-row md:items-end md:text-left">
        <Artwork src={pl.tracks[0]?.artworkLarge || pl.tracks[0]?.artwork} alt={pl.title} size="lg" rounded="rounded-2xl" className="h-44 w-44 shrink-0 shadow-glow md:h-52 md:w-52" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-gold">Your playlist</p>
          {editing ? (
            <form
              className="mt-2 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                renamePlaylist(pl.id, title);
                setEditing(false);
              }}
            >
              <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} autoFocus aria-label="Playlist name" className="input" />
              <button type="submit" className="btn-gold">Save</button>
              <button type="button" className="btn-outline" onClick={() => setEditing(false)}>Cancel</button>
            </form>
          ) : (
            <h1 className="mt-1 break-words text-3xl font-extrabold text-white md:text-5xl">{pl.title}</h1>
          )}
          <p className="mt-2 text-sm text-muted">{pl.tracks.length} {pl.tracks.length === 1 ? 'song' : 'songs'} · Private</p>
          <div className="mt-4 flex flex-wrap justify-center gap-3 md:justify-start">
            <button type="button" className="btn-gold" disabled={pl.tracks.length === 0} onClick={() => playQueue(pl.tracks, 0)}>
              <Icon name="play" size={18} /> Play
            </button>
            <button type="button" className="btn-outline" onClick={() => { setTitle(pl.title); setEditing(true); }}>
              <Icon name="edit" size={16} /> Rename
            </button>
            {confirmDelete ? (
              <>
                <button type="button" className="btn-outline !border-red-500 !text-red-400" onClick={() => { deletePlaylist(pl.id); router.push('/library'); }}>
                  Confirm delete
                </button>
                <button type="button" className="btn-outline" onClick={() => setConfirmDelete(false)}>Keep</button>
              </>
            ) : (
              <button type="button" className="btn-outline" onClick={() => setConfirmDelete(true)}>
                <Icon name="trash" size={16} /> Delete
              </button>
            )}
          </div>
        </div>
      </header>
      {pl.tracks.length === 0 ? (
        <EmptyState title="This playlist is empty" text="Use the ⋮ menu on any song and choose “Add to playlist”.">
          <Link href="/search" className="btn-gold">Find songs</Link>
        </EmptyState>
      ) : (
        <TrackList tracks={pl.tracks} onRemove={(t) => removeFromPlaylist(pl.id, t)} />
      )}
    </>
  );
}

function ProviderCollectionView({ provider, id }: { provider: string; id: string }) {
  const { playQueue } = usePlayer();
  const valid = isSafeId(provider) && isSafeId(id);
  const col = useAsync(() => (valid ? music.getCollection(provider, id) : Promise.resolve(null)), [provider, id]);

  if (col.loading) return <ListSkeleton />;
  if (col.error) return <ErrorState message={col.error} onRetry={col.reload} />;
  if (!col.data) return <EmptyState title="Not found" text="This playlist or album is unavailable." />;
  const c = col.data;
  const tracks = c.tracks ?? [];

  return (
    <>
      <header className="mb-8 flex flex-col items-center gap-6 text-center md:flex-row md:items-end md:text-left">
        <Artwork src={c.artwork} alt={c.title} size="lg" rounded="rounded-2xl" className="h-44 w-44 shrink-0 shadow-glow md:h-52 md:w-52" />
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-gold">{c.kind}</p>
          <h1 className="mt-1 break-words text-3xl font-extrabold text-white md:text-5xl">{c.title}</h1>
          <p className="mt-2 text-sm text-muted">
            {c.ownerId ? (
              <Link href={`/artist?p=${c.provider}&id=${c.ownerId}`} className="text-white hover:text-gold">{c.ownerName}</Link>
            ) : (
              c.ownerName
            )}{' '}
            · {tracks.length} playable {tracks.length === 1 ? 'song' : 'songs'}
          </p>
          {c.description && <p className="mt-2 max-w-2xl text-sm text-white/60">{c.description.slice(0, 280)}</p>}
          <div className="mt-4 flex flex-wrap justify-center gap-3 md:justify-start">
            <button type="button" className="btn-gold" disabled={tracks.length === 0} onClick={() => playQueue(tracks, 0)}>
              <Icon name="play" size={18} /> Play
            </button>
            <button type="button" className="btn-outline" disabled={tracks.length < 2} onClick={() => playQueue(tracks, Math.floor(Math.random() * tracks.length))}>
              <Icon name="shuffle" size={18} /> Shuffle
            </button>
          </div>
        </div>
      </header>
      {tracks.length === 0 ? (
        <EmptyState title="No playable tracks" text="None of the tracks in this collection have confirmed streaming permission." />
      ) : (
        <TrackList tracks={tracks} />
      )}
    </>
  );
}

export function CollectionView() {
  const params = useSearchParams();
  const provider = params.get('p') ?? '';
  const id = params.get('id') ?? '';
  if (provider === 'user') return <UserPlaylistView id={id} />;
  return <ProviderCollectionView provider={provider} id={id} />;
}
