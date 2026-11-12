'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { providerName, trackKey, type Track } from '@sahu/models';
import { formatDuration } from '@sahu/shared';
import { useLibrary } from '@/lib/library';
import { music } from '@/lib/music';
import { usePlayer } from '@/lib/player';
import { useToast } from '@/lib/toast';
import { Artwork } from './Artwork';
import { Icon } from './icons';

/** Plain link to a YouTube search for the song (no scraping, no embedding – the user leaves to YouTube). */
export const youtubeSearchUrl = (t: Pick<Track, 'title' | 'artist'>): string =>
  `https://www.youtube.com/results?search_query=${encodeURIComponent(`${t.title} ${t.artist}`)}`;

/** Live radio station. */
export function LiveBadge({ className = '' }: { className?: string }) {
  return (
    <span className={`flex shrink-0 items-center gap-1 rounded bg-red-500/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-red-400 ${className}`} title="Live radio station">
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" /> Live
    </span>
  );
}

/** Plays in YouTube's official video player. */
export function VideoBadge({ className = '', official = false }: { className?: string; official?: boolean }) {
  return (
    <span className={`shrink-0 rounded bg-[#ff0033]/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#ff5c7a] ${className}`} title="Plays in YouTube's official player">
      {official ? 'Official · YouTube' : 'YouTube'}
    </span>
  );
}

function SourceBadge({ track, overlay = false }: { track: Track; overlay?: boolean }) {
  const cls = overlay ? 'absolute left-2 top-2 !bg-black/75' : '';
  if (!music.isTrackPlayable(track)) return <UnavailableBadge className={cls} />;
  if (track.live) return <LiveBadge className={cls} />;
  if (track.video) return <VideoBadge className={cls} official={track.official} />;
  if (track.preview) return <PreviewBadge className={cls} />;
  return null;
}

/** Shown on saved tracks that can no longer be played in full (preview-only or removed). */
export function UnavailableBadge({ className = '' }: { className?: string }) {
  return (
    <span className={`shrink-0 rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-muted ${className}`} title="No full-length stream is available for this track">
      Unavailable
    </span>
  );
}

/** Marks a 30-second preview clip so nobody mistakes it for the full song. */
export function PreviewBadge({ className = '' }: { className?: string }) {
  return (
    <span className={`shrink-0 rounded bg-gold/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-gold ${className}`} title="30-second preview clip from Apple Music">
      Preview
    </span>
  );
}

function Equalizer({ dark = false }: { dark?: boolean }) {
  return (
    <span className="flex h-4 items-end gap-0.5" aria-label="Now playing">
      {[0, 0.2, 0.4].map((d) => (
        <span key={d} className={`w-1 origin-bottom animate-eq rounded-sm ${dark ? 'bg-ink' : 'bg-dyn'}`} style={{ height: '100%', animationDelay: `${d}s` }} />
      ))}
    </span>
  );
}

/**
 * Pointer resting on a song (mouse), a finger touching it, or keyboard focus: the listener is
 * about to play it, so the player starts buffering it already. Playing then starts at once.
 */
export function useWarm(track: Track | null | undefined) {
  const { warm } = usePlayer();
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  // A YouTube song on screen: start YouTube's player shortly after, so the first tap does not
  // wait for the player to load (phones have no hover, so pointer intent comes too late).
  useEffect(() => {
    if (!track?.video) return;
    const t = setTimeout(() => warm(track, 'likely'), 1200);
    return () => clearTimeout(t);
  }, [track, warm]);
  const go = () => track && warm(track);
  return {
    onPointerEnter: (e: React.PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      clearTimeout(timer.current);
      timer.current = setTimeout(go, 180);
    },
    onPointerLeave: () => clearTimeout(timer.current),
    onPointerDown: go,
    onFocus: go,
  };
}

export function FavoriteButton({ track, size = 20 }: { track: Track; size?: number }) {
  const { isFavorite, toggleFavorite } = useLibrary();
  const fav = isFavorite(track);
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        toggleFavorite(track);
      }}
      aria-label={fav ? 'Remove from favourites' : 'Add to favourites'}
      aria-pressed={fav}
      className={`icon-btn ${fav ? 'text-rose' : 'text-white/55 hover:text-white'}`}
    >
      <Icon name={fav ? 'heartFill' : 'heart'} size={size} />
    </button>
  );
}

/** Square card used in horizontal rows. The whole cover plays the song. */
export function TrackCard({ track, list, index }: { track: Track; list: Track[]; index: number }) {
  const { current, isPlaying, playQueue, toggle } = usePlayer();
  const intent = useWarm(track);
  const active = !!current && trackKey(current) === trackKey(track);
  const unavailable = !music.isTrackPlayable(track);
  return (
    <div {...intent} className={`card-lift group w-[9.25rem] shrink-0 snap-start xs:w-40 md:w-44 lg:w-48 ${unavailable ? 'opacity-50' : ''}`}>
      <div className="relative">
        <Artwork mirrors={track.artworkMirrors} src={track.artwork} alt={`${track.title} artwork`} rounded="rounded-2xl" className={`art-zoom shadow-lift ${active ? 'ring-2 ring-dyn' : 'ring-1 ring-white/[0.06]'}`} />
        <button
          type="button"
          onClick={() => (active ? toggle() : playQueue(list, index))}
          aria-label={active && isPlaying ? `Pause ${track.title}` : `Play ${track.title}`}
          className="absolute inset-0 rounded-2xl"
        >
          <span
            className={`absolute bottom-2 right-2 flex h-10 w-10 items-center justify-center rounded-full bg-white text-ink shadow-lift transition duration-300 group-hover:scale-105 ${
              active ? 'opacity-100' : '[@media(hover:hover)]:translate-y-1.5 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:translate-y-0 [@media(hover:hover)]:group-hover:opacity-100 group-focus-within:opacity-100'
            }`}
          >
            <Icon name={active && isPlaying ? 'pause' : 'play'} size={18} />
          </span>
        </button>
        {active && isPlaying && (
          <span className="pointer-events-none absolute bottom-2 left-2 rounded-full bg-black/60 px-2 py-1.5 backdrop-blur" aria-hidden="true">
            <Equalizer />
          </span>
        )}
        <SourceBadge track={track} overlay />
      </div>
      <p className={`mt-2.5 truncate text-[13.5px] font-semibold ${active ? 'text-dyn' : 'text-white'}`} title={track.title}>
        {track.title}
      </p>
      {track.artistId ? (
        <Link href={`/artist?p=${track.provider}&id=${track.artistId}`} className="block truncate text-xs text-white/55 hover:text-white">
          {track.artist}
        </Link>
      ) : (
        <p className="truncate text-xs text-white/55">{track.artist}</p>
      )}
    </div>
  );
}

/** Compact horizontal tile (artwork + title) for "jump back in" grids. */
export function QuickTile({ track, list, index }: { track: Track; list: Track[]; index: number }) {
  const { current, isPlaying, playQueue, toggle } = usePlayer();
  const intent = useWarm(track);
  const active = !!current && trackKey(current) === trackKey(track);
  const unavailable = !music.isTrackPlayable(track);
  return (
    <button
      type="button"
      {...intent}
      onClick={() => (active ? toggle() : playQueue(list, index))}
      aria-label={active && isPlaying ? `Pause ${track.title}` : `Play ${track.title}`}
      // w-full min-w-0: a <button> is as wide as its text by default; a long title would push the whole page sideways on a phone
      className={`surface surface-hover group flex w-full min-w-0 items-center gap-3 overflow-hidden rounded-2xl p-1.5 pr-3 text-left ${active ? '!bg-white/[0.08] !ring-dyn/50' : ''} ${unavailable ? 'opacity-50' : ''}`}
    >
      <Artwork mirrors={track.artworkMirrors} src={track.artwork} alt="" size="sm" rounded="rounded-xl" className="h-12 w-12 shrink-0 md:h-14 md:w-14" />
      <span className="min-w-0 flex-1">
        <span className={`block truncate text-sm font-semibold ${active ? 'text-dyn' : 'text-white'}`}>{track.title}</span>
        <span className="block truncate text-xs text-white/55">{track.artist}</span>
      </span>
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-ink transition duration-300 ${active ? 'opacity-100' : 'scale-90 opacity-0 group-hover:scale-100 group-hover:opacity-100 group-focus-visible:opacity-100'}`}>
        {active && isPlaying ? <Equalizer dark /> : <Icon name="play" size={16} />}
      </span>
    </button>
  );
}

/** Row used in lists. `onRemove` adds a remove action (playlists, queue). */
export function TrackRow({
  track,
  list,
  index,
  showIndex = true,
  onRemove,
  onPlay,
}: {
  track: Track;
  list: Track[];
  index: number;
  showIndex?: boolean;
  onRemove?: () => void;
  onPlay?: () => void;
}) {
  const { current, isPlaying, playQueue, toggle } = usePlayer();
  const intent = useWarm(track);
  const [menu, setMenu] = useState(false);
  const active = !!current && trackKey(current) === trackKey(track);
  const play = () => (onPlay ? onPlay() : active ? toggle() : playQueue(list, index));
  const unavailable = !music.isTrackPlayable(track);

  return (
    <div {...intent} className={`group relative flex items-center gap-3 rounded-2xl px-2 py-1.5 transition duration-200 hover:bg-white/[0.05] ${active ? 'bg-white/[0.06]' : ''} ${unavailable ? 'opacity-60' : ''}`}>
      {active && <span className="absolute left-0 top-1/2 h-7 w-[3px] -translate-y-1/2 rounded-full bg-dyn shadow-glow" aria-hidden="true" />}
      {showIndex && (
        <span className="hidden w-6 shrink-0 justify-center text-sm font-semibold tabular-nums text-white/40 sm:flex">
          {active && isPlaying ? <Equalizer /> : index + 1}
        </span>
      )}
      <button type="button" onClick={play} className="relative shrink-0" aria-label={active && isPlaying ? `Pause ${track.title}` : `Play ${track.title}`}>
        <Artwork mirrors={track.artworkMirrors} src={track.artwork} alt="" size="sm" rounded="rounded-xl" className="h-12 w-12" />
        <span className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/50 text-white opacity-0 transition group-hover:opacity-100 focus-visible:opacity-100">
          <Icon name={active && isPlaying ? 'pause' : 'play'} size={18} />
        </span>
      </button>
      <div className="min-w-0 flex-1">
        <span className="flex min-w-0 items-center gap-2">
          <button type="button" onClick={play} className={`block min-w-0 truncate text-left text-sm font-semibold ${active ? 'text-dyn' : 'text-white'}`}>
            {track.title}
          </button>
          <SourceBadge track={track} />
        </span>
        {track.artistId ? (
          <Link href={`/artist?p=${track.provider}&id=${track.artistId}`} className="block truncate text-xs text-white/55 hover:text-white">
            {track.artist}
          </Link>
        ) : (
          <p className="truncate text-xs text-white/55">{track.artist}</p>
        )}
      </div>
      {/* no album/genre column in compact lists (the queue panel) so the title keeps its room */}
      {showIndex && (track.album || track.genre) && (
        <span className="hidden max-w-[14rem] truncate text-xs text-muted lg:block" title={track.album || undefined}>
          {track.album ? `${track.album}${track.year ? ` · ${track.year}` : ''}` : track.genre}
        </span>
      )}
      {/* compact lists (the queue) leave the room to the title */}
      <span className={`hidden w-12 text-right text-xs tabular-nums text-white/45 ${showIndex ? 'sm:block' : ''}`}>{unavailable ? '—' : track.live ? '' : formatDuration(track.duration)}</span>
      <FavoriteButton track={track} size={18} />
      {onRemove && (
        <button type="button" onClick={onRemove} className="icon-btn text-muted hover:text-red-400" aria-label={`Remove ${track.title}`}>
          <Icon name="close" size={18} />
        </button>
      )}
      <button type="button" onClick={() => setMenu(true)} className="icon-btn text-muted hover:text-white" aria-label={`More options for ${track.title}`} aria-haspopup="dialog">
        <Icon name="more" size={18} />
      </button>
      {menu && <TrackMenu track={track} onClose={() => setMenu(false)} />}
    </div>
  );
}

export function TrackList({ tracks, onRemove }: { tracks: Track[]; onRemove?: (t: Track) => void }) {
  return (
    <div className="stagger">
      {tracks.map((t, i) => (
        <TrackRow key={trackKey(t)} track={t} list={tracks} index={i} onRemove={onRemove ? () => onRemove(t) : undefined} />
      ))}
    </div>
  );
}

export function LoadMore({ hasMore, loading, onClick }: { hasMore: boolean; loading: boolean; onClick: () => void }) {
  if (!hasMore) return null;
  return (
    <div className="mt-6 flex justify-center">
      <button type="button" onClick={onClick} disabled={loading} className="btn-outline">
        {loading ? 'Loading…' : 'Load more'}
      </button>
    </div>
  );
}

/** Action sheet for a track: queue, playlists, artist, share, rights info. */
export function TrackMenu({ track, onClose }: { track: Track; onClose: () => void }) {
  const { addToQueue, playNext } = usePlayer();
  const { playlists, addToPlaylist, createPlaylist } = useLibrary();
  const toast = useToast();
  const [view, setView] = useState<'main' | 'playlists' | 'info'>('main');
  const [newTitle, setNewTitle] = useState('');

  const done = (fn: () => void) => () => {
    fn();
    onClose();
  };

  const share = async () => {
    const url = track.permalink || `${window.location.origin}/search/?q=${encodeURIComponent(track.title)}`;
    try {
      if (navigator.share) await navigator.share({ title: track.title, text: `${track.title} – ${track.artist}`, url });
      else {
        await navigator.clipboard.writeText(url);
        toast('Link copied');
      }
    } catch {
      /* user cancelled */
    }
    onClose();
  };

  const item = 'flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-medium text-white hover:bg-white/[0.07]';
  const perm = (p: string) => (p === 'allowed' ? 'Allowed' : p === 'not_allowed' ? 'Not allowed' : 'Unconfirmed');

  return (
    <div className="fixed inset-0 z-[60] flex animate-fade-in items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-4" onClick={onClose} role="dialog" aria-modal="true" aria-label={`Options for ${track.title}`}>
      <div className="max-h-[80dvh] w-full max-w-md animate-slide-up overflow-y-auto rounded-t-3xl bg-coal p-3 pb-[max(env(safe-area-inset-bottom),12px)] ring-1 ring-white/10 sm:animate-pop-in sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
        <span className="mx-auto mb-2 block h-1 w-10 rounded-full bg-white/20 sm:hidden" aria-hidden="true" />
        <div className="mb-2 flex items-center gap-3 border-b border-coal-line p-2 pb-3">
          <Artwork mirrors={track.artworkMirrors} src={track.artwork} alt="" size="sm" rounded="rounded-md" className="h-12 w-12" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-white">{track.title}</p>
            <p className="truncate text-xs text-muted">{track.artist}</p>
          </div>
          <button type="button" onClick={onClose} className="icon-btn text-muted hover:text-white" aria-label="Close">
            <Icon name="close" size={20} />
          </button>
        </div>

        {view === 'main' && (
          <>
            <button type="button" className={item} onClick={done(() => playNext(track))}>
              <Icon name="next" size={18} /> Play next
            </button>
            <button type="button" className={item} onClick={done(() => addToQueue(track))}>
              <Icon name="queue" size={18} /> Add to queue
            </button>
            <button type="button" className={item} onClick={() => setView('playlists')}>
              <Icon name="plus" size={18} /> Add to playlist
            </button>
            {track.artistId && (
              <Link className={item} href={`/artist?p=${track.provider}&id=${track.artistId}`} onClick={onClose}>
                <Icon name="user" size={18} /> Go to artist
              </Link>
            )}
            {track.preview && track.permalink && (
              <a className={item} href={track.permalink} target="_blank" rel="noopener noreferrer" onClick={onClose}>
                <Icon name="external" size={18} /> Full song on Apple Music
              </a>
            )}
            {track.preview && (
              <a className={item} href={youtubeSearchUrl(track)} target="_blank" rel="noopener noreferrer" onClick={onClose}>
                <Icon name="external" size={18} /> Find full song on YouTube
              </a>
            )}
            <button type="button" className={item} onClick={share}>
              <Icon name="share" size={18} /> Share
            </button>
            <button type="button" className={item} onClick={() => setView('info')}>
              <Icon name="info" size={18} /> Source &amp; rights
            </button>
          </>
        )}

        {view === 'playlists' && (
          <div className="p-1">
            <form
              className="mb-2 flex gap-2"
              onSubmit={async (e) => {
                e.preventDefault();
                const id = await createPlaylist(newTitle);
                if (id) {
                  addToPlaylist(id, track);
                  onClose();
                }
              }}
            >
              <input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} maxLength={80} placeholder="New playlist name" aria-label="New playlist name" className="input flex-1" />
              <button type="submit" className="btn-gold" disabled={!newTitle.trim()}>
                Create
              </button>
            </form>
            {playlists.length === 0 && <p className="px-2 py-3 text-sm text-muted">No playlists yet. Create your first one above.</p>}
            {playlists.map((p) => (
              <button key={p.id} type="button" className={item} onClick={done(() => addToPlaylist(p.id, track))}>
                <Icon name="library" size={18} />
                <span className="min-w-0 flex-1 truncate">{p.title}</span>
                <span className="text-xs text-muted">{p.tracks.length}</span>
              </button>
            ))}
            <button type="button" className="mt-1 px-3 py-2 text-sm text-gold" onClick={() => setView('main')}>
              ← Back
            </button>
          </div>
        )}

        {view === 'info' && (
          <div className="space-y-2 p-3 text-sm">
            <dl className="grid grid-cols-[auto,1fr] gap-x-4 gap-y-2">
              <dt className="text-muted">Provider</dt>
              <dd className="text-white">{providerName(track.provider)}</dd>
              <dt className="text-muted">Track ID</dt>
              <dd className="break-all text-white">{track.providerTrackId}</dd>
              {track.album && (
                <>
                  <dt className="text-muted">Album</dt>
                  <dd className="text-white">{track.album}{track.year ? ` (${track.year})` : ''}</dd>
                </>
              )}
              <dt className="text-muted">Streaming</dt>
              <dd className="text-white">
                {!track.rights.streamingPermitted ? 'Not permitted' : track.preview ? '30-second preview clip only (not a full song)' : 'Full-length stream confirmed by provider'}
              </dd>
              <dt className="text-muted">Licence</dt>
              <dd className="text-white">{track.rights.license || 'Not stated by provider'}</dd>
              <dt className="text-muted">Commercial use</dt>
              <dd className="text-white">{perm(track.rights.commercialUse)}</dd>
              <dt className="text-muted">Advertising</dt>
              <dd className="text-white">{perm(track.rights.advertising)}</dd>
            </dl>
            <p className="text-xs text-muted">{track.rights.basis}</p>
            {track.permalink && (
              <a href={track.permalink} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-gold hover:text-gold-soft">
                View on provider <Icon name="external" size={14} />
              </a>
            )}
            <div>
              <button type="button" className="py-2 text-sm text-gold" onClick={() => setView('main')}>
                ← Back
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
