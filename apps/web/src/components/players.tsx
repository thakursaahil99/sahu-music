'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { providerName, trackKey, type Track } from '@sahu/models';
import { formatDuration } from '@sahu/shared';
import { usePlayer, useProgress } from '@/lib/player';
import { Artwork } from './Artwork';
import { Icon } from './icons';
import { FavoriteButton, TrackMenu, TrackRow, youtubeSearchUrl } from './tracks';

/** A song-shaped row of bar heights (%), the same every time for the same track. */
function waveShape(seed: string, n: number): number[] {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619) >>> 0;
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    h = (Math.imul(h, 1103515245) + 12345) >>> 0;
    const r = (h >>> 8) / 16777216;
    const envelope = 0.5 + 0.5 * Math.sin((Math.PI * (i + 0.5)) / n);
    out.push(Math.round((0.28 + 0.72 * r) * (0.45 + 0.55 * envelope) * 100));
  }
  return out;
}

function LiveLine({ className = '' }: { className?: string }) {
  return (
    <div className={`flex w-full items-center justify-center gap-2 py-1 text-xs font-bold uppercase tracking-[0.25em] text-rose ${className}`} aria-label="Live broadcast">
      <span className="h-2 w-2 animate-pulse rounded-full bg-rose" /> Live radio
    </div>
  );
}

/**
 * The seek bar: a waveform whose played part lights up in the song's colour. The drawing is
 * decoration; an invisible native slider on top does the work (keyboard, screen readers, touch).
 */
function WaveSeek({ bars = 56, height = 'h-8', showTimes = true }: { bars?: number; height?: string; showTimes?: boolean }) {
  const { seek, current } = usePlayer();
  const { position, duration } = useProgress();
  const [drag, setDrag] = useState<number | null>(null);
  const shape = useMemo(() => waveShape(current ? trackKey(current) : 'sahu', bars), [current, bars]);
  if (current?.live) return <LiveLine />;
  const total = duration || current?.duration || 0;
  const value = drag ?? Math.min(position, total || position);
  const pct = total > 0 ? Math.min(100, (value / total) * 100) : 0;
  const commit = () => {
    if (drag !== null) seek(drag);
    setDrag(null);
  };
  const drawing = shape.map((h, i) => <span key={i} style={{ height: `${h}%` }} />);
  return (
    <div className="flex w-full items-center gap-3">
      {showTimes && <span className="w-10 shrink-0 text-right text-[11px] font-medium tabular-nums text-white/60">{formatDuration(value)}</span>}
      <div className={`wave-wrap relative min-w-0 flex-1 ${height}`}>
        <div className="wave" aria-hidden="true">
          {drawing}
        </div>
        <div className="wave wave-played" style={{ clipPath: `inset(0 ${100 - pct}% 0 0)` }} aria-hidden="true">
          {drawing}
        </div>
        <input
          type="range"
          min={0}
          max={total || 0}
          step={1}
          value={value}
          disabled={!total}
          aria-label="Seek"
          aria-valuetext={`${formatDuration(value)} of ${formatDuration(total)}`}
          onChange={(e) => setDrag(Number(e.target.value))}
          onPointerUp={commit}
          onKeyUp={commit}
          onTouchEnd={commit}
          className="wave-input"
        />
      </div>
      {showTimes && <span className="w-10 shrink-0 text-[11px] font-medium tabular-nums text-white/60">{formatDuration(total)}</span>}
    </div>
  );
}

/** The glowing "now playing" line along the top edge of the player. */
function NowPlayingLine() {
  const { current } = usePlayer();
  const { position, duration } = useProgress();
  const total = duration || current?.duration || 0;
  const pct = total > 0 ? Math.min(100, (position / total) * 100) : 0;
  return (
    <div className={`np-line ${current?.live ? 'live' : ''}`} aria-hidden="true">
      <i style={{ width: `${pct}%` }} />
    </div>
  );
}

function PlayButton({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const { isPlaying, isLoading, toggle } = usePlayer();
  const box = size === 'lg' ? 'h-[4.5rem] w-[4.5rem]' : size === 'md' ? 'h-11 w-11' : 'h-9 w-9';
  const icon = size === 'lg' ? 32 : size === 'md' ? 22 : 18;
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isPlaying ? 'Pause' : 'Play'}
      className={`relative flex shrink-0 items-center justify-center rounded-full bg-white text-ink shadow-glow transition duration-200 hover:scale-105 active:scale-95 ${box} ${isPlaying && size === 'lg' ? 'animate-pulse-ring' : ''}`}
    >
      {isLoading ? (
        <span className={`animate-spin rounded-full border-2 border-ink/25 border-t-ink ${size === 'lg' ? 'h-8 w-8' : 'h-5 w-5'}`} aria-label="Loading" />
      ) : (
        <Icon name={isPlaying ? 'pause' : 'play'} size={icon} />
      )}
    </button>
  );
}

function Transport({ big = false }: { big?: boolean }) {
  const { next, prev, shuffle, repeat, toggleShuffle, cycleRepeat } = usePlayer();
  const s = big ? 28 : 20;
  return (
    <div className={`flex items-center justify-center ${big ? 'gap-4 xs:gap-6' : 'gap-2'}`}>
      <button type="button" onClick={toggleShuffle} aria-label="Shuffle" aria-pressed={shuffle} className={`icon-btn relative ${shuffle ? 'text-dyn' : 'text-white/55 hover:text-white'}`}>
        <Icon name="shuffle" size={s - 4} />
        {shuffle && <span className="absolute bottom-1 h-1 w-1 rounded-full bg-dyn" />}
      </button>
      <button type="button" onClick={prev} aria-label="Previous" className={`icon-btn text-white ${big ? '!h-12 !w-12' : ''}`}>
        <Icon name="prev" size={s} />
      </button>
      <PlayButton size={big ? 'lg' : 'md'} />
      <button type="button" onClick={next} aria-label="Next" className={`icon-btn text-white ${big ? '!h-12 !w-12' : ''}`}>
        <Icon name="next" size={s} />
      </button>
      <button type="button" onClick={cycleRepeat} aria-label={`Repeat: ${repeat}`} className={`icon-btn relative ${repeat !== 'off' ? 'text-dyn' : 'text-white/55 hover:text-white'}`}>
        <Icon name="repeat" size={s - 4} />
        {repeat === 'one' && <span className="absolute right-0.5 top-0.5 rounded-full bg-dyn px-1 text-[9px] font-bold leading-4 text-ink">1</span>}
        {repeat === 'all' && <span className="absolute bottom-1 h-1 w-1 rounded-full bg-dyn" />}
      </button>
    </div>
  );
}

/** Mini player's play button with the song's progress drawn as a ring around it. */
function RingPlayButton() {
  const { isPlaying, isLoading, toggle, current } = usePlayer();
  const { position, duration } = useProgress();
  const total = duration || current?.duration || 0;
  const frac = current?.live ? 1 : total > 0 ? Math.min(1, position / total) : 0;
  const r = 20;
  const c = 2 * Math.PI * r;
  return (
    <button type="button" onClick={toggle} aria-label={isPlaying ? 'Pause' : 'Play'} className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white active:scale-90">
      <svg className="ring-progress absolute inset-0" viewBox="0 0 44 44" aria-hidden="true">
        <circle cx="22" cy="22" r={r} fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth="2.5" />
        <circle cx="22" cy="22" r={r} fill="none" stroke="rgb(var(--dyn-r) var(--dyn-g) var(--dyn-b))" strokeWidth="2.5" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - frac)} />
      </svg>
      {isLoading ? <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/25 border-t-white" aria-label="Loading" /> : <Icon name={isPlaying ? 'pause' : 'play'} size={20} />}
    </button>
  );
}

function SubLine({ track, error }: { track: Track; error: string | null }) {
  return (
    <span className={`block truncate text-xs ${error ? 'text-red-400' : 'text-white/60'}`}>
      {error || (track.preview ? `Preview · ${track.artist}` : track.live ? `● Live · ${track.artist}` : track.artist)}
    </span>
  );
}

/** Player dock: floating card above the phone navigation; a full-width bar on tablet and desktop. */
export function MiniPlayer() {
  const { current, isPlaying, next, setFullOpen, volume, setVolume, error } = usePlayer();
  if (!current) return null;

  return (
    <div className="relative z-30 mx-3 animate-slide-up md:mx-0" role="region" aria-label="Player">
      <div className="glass-dyn relative overflow-hidden rounded-2xl shadow-dock ring-1 ring-white/10 md:rounded-3xl">
        <NowPlayingLine />

        {/* phones */}
        <div className="flex items-center gap-3 py-2 pl-2 pr-1.5 md:hidden">
          <button type="button" onClick={() => setFullOpen(true)} className="flex min-w-0 flex-1 items-center gap-3 text-left" aria-label="Open full player">
            <Artwork mirrors={current.artworkMirrors} src={current.artwork} alt="" size="sm" rounded="rounded-xl" className={`h-11 w-11 shrink-0 ${isPlaying ? 'shadow-glow' : ''}`} />
            <span className="min-w-0">
              <span className="block truncate text-sm font-bold text-white">{current.title}</span>
              <SubLine track={current} error={error} />
            </span>
          </button>
          <FavoriteButton track={current} size={20} />
          <RingPlayButton />
          <button type="button" onClick={next} aria-label="Next" className="icon-btn text-white">
            <Icon name="next" size={20} />
          </button>
        </div>

        {/* tablets and desktops */}
        <div className="hidden items-center gap-4 px-4 py-3 md:grid md:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)_auto] lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)_minmax(0,1fr)] lg:gap-6 lg:px-5">
          <div className="flex min-w-0 items-center gap-3">
            <button type="button" onClick={() => setFullOpen(true)} className="group relative shrink-0" aria-label="Open full player">
              <Artwork mirrors={current.artworkMirrors} src={current.artwork} alt="" size="sm" rounded="rounded-2xl" className={`h-14 w-14 ring-1 ring-white/10 transition ${isPlaying ? 'shadow-glow' : ''}`} />
              <span className="absolute inset-0 flex items-center justify-center rounded-2xl bg-black/50 text-white opacity-0 transition group-hover:opacity-100">
                <Icon name="chevronDown" size={20} className="rotate-180" />
              </span>
            </button>
            <div className="min-w-0">
              <button type="button" onClick={() => setFullOpen(true)} className="block max-w-full truncate text-left text-sm font-bold text-white hover:underline">
                {current.title}
              </button>
              <SubLine track={current} error={error} />
            </div>
            <span className="hidden shrink-0 lg:block">
              <FavoriteButton track={current} />
            </span>
          </div>

          <div className="flex min-w-0 flex-col items-center gap-0.5">
            <Transport />
            <WaveSeek bars={64} height="h-7" />
          </div>

          <div className="flex items-center justify-end gap-1">
            <span className="lg:hidden">
              <FavoriteButton track={current} />
            </span>
            <div className="hidden items-center gap-2 lg:flex">
              <Icon name="volume" size={18} className="text-white/55" />
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={volume}
                onChange={(e) => setVolume(Number(e.target.value))}
                aria-label="Volume"
                className="range w-24"
                style={{ ['--pct' as string]: `${volume * 100}%` }}
              />
            </div>
            <button type="button" onClick={() => setFullOpen(true)} aria-label="Open queue and full player" className="icon-btn text-white/60 hover:text-white">
              <Icon name="queue" size={20} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function QueuePanel() {
  const { queue, index, jumpTo, removeFromQueue, clearQueue } = usePlayer();
  const upcoming = Math.max(0, queue.length - index - 1);
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mb-3 flex items-end justify-between">
        <div>
          <h3 className="text-lg font-bold text-white">Up next</h3>
          <p className="text-xs text-white/50">{upcoming === 0 ? 'Nothing queued after this song' : `${upcoming} song${upcoming === 1 ? '' : 's'} in the queue`}</p>
        </div>
        {queue.length > 1 && (
          <button type="button" onClick={clearQueue} className="pill hover:text-white">
            Clear
          </button>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        {queue.map((t, i) => (
          <div key={trackKey(t)} className={i < index ? 'opacity-45' : ''}>
            <TrackRow track={t} list={queue} index={i} showIndex={false} onPlay={i === index ? undefined : () => jumpTo(i)} onRemove={() => removeFromQueue(i)} />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Marks the history entry the full player adds while it is open. */
const PLAYER_ENTRY = 'sahuFullPlayer';

/** Leaves the player's history entry (which closes it), or just closes it when there is none. */
function closeFullPlayer(setFullOpen: (open: boolean) => void) {
  if (window.history.state?.[PLAYER_ENTRY]) window.history.back();
  else setFullOpen(false);
}

/** Full-screen player overlay. */
export function FullPlayer() {
  const { current, fullOpen, setFullOpen, error, isPlaying, setVideoSlot } = usePlayer();
  const [showQueue, setShowQueue] = useState(false);
  const [menu, setMenu] = useState(false);

  // The phone's Back button / gesture closes the player instead of leaving the page: opening it
  // adds a history entry for the same address, and going back from that entry closes it.
  useEffect(() => {
    if (!fullOpen) return;
    if (!window.history.state?.[PLAYER_ENTRY]) window.history.pushState({ [PLAYER_ENTRY]: true }, '');
    const onPop = () => setFullOpen(false);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [fullOpen, setFullOpen]);

  const close = () => closeFullPlayer(setFullOpen);

  useEffect(() => {
    if (!fullOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeFullPlayer(setFullOpen);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [fullOpen, setFullOpen]);

  if (!fullOpen || !current) return null;

  return (
    <div className="fixed inset-0 z-50 flex animate-slide-up flex-col bg-ink" role="dialog" aria-modal="true" aria-label="Now playing">
      {/* backdrop: the cover, blurred, washed in the song's colour */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        {current.artwork && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={current.artwork} alt="" className="h-full w-full scale-150 object-cover opacity-45 blur-3xl" />
        )}
        <div className="absolute inset-0" style={{ background: 'radial-gradient(90% 60% at 50% 0%, rgb(var(--dyn-r) var(--dyn-g) var(--dyn-b) / 0.35), transparent 70%)' }} />
        <div className="absolute inset-0 bg-gradient-to-b from-ink/30 via-ink/75 to-ink" />
      </div>

      {/* below the status bar / notch when the app is drawn edge to edge */}
      <header className="relative flex items-center justify-between gap-2 px-3 pb-1 pt-[calc(env(safe-area-inset-top)+0.75rem)] md:px-8">
        <button type="button" onClick={close} className="flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-white/[0.08] pl-2.5 pr-3.5 text-sm font-semibold text-white ring-1 ring-white/10 transition hover:bg-white/15 active:scale-95" aria-label="Close player">
          <Icon name="back" size={20} />
          <span>Back</span>
        </button>
        <div className="min-w-0 text-center">
          <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-white/50">Now playing</p>
          <p className="text-xs font-semibold text-white/80">{current.live ? 'Live radio' : current.video ? 'YouTube' : providerName(current.provider)}</p>
        </div>
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => setShowQueue((v) => !v)} className={`icon-btn lg:hidden ${showQueue ? 'bg-white/15 text-dyn' : 'bg-white/[0.06] text-white'}`} aria-label="Toggle queue" aria-pressed={showQueue}>
            <Icon name="queue" size={20} />
          </button>
          <button type="button" onClick={() => setMenu(true)} className="icon-btn bg-white/[0.06] text-white" aria-label="More options">
            <Icon name="more" size={20} />
          </button>
        </div>
      </header>

      <div className="relative mx-auto flex min-h-0 w-full max-w-6xl flex-1 gap-10 px-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] md:px-8">
        {/* min-w-0: a long song title must not push the page wider than the phone.
            The inner m-auto centres the content, and on short screens lets it scroll instead of being cut off. */}
        <div className={`no-scrollbar min-h-0 min-w-0 flex-1 flex-col overflow-y-auto ${showQueue ? 'hidden lg:flex' : 'flex'}`}>
          <div className="m-auto flex w-full flex-col items-center py-2">
          {current.video ? (
            // YouTube's player is drawn over this slot by <VideoStage/> (it must stay visible while it plays)
            <div ref={setVideoSlot} className="aspect-video min-h-[200px] w-full max-w-[min(40rem,52dvh*16/9)]" aria-label="Video" />
          ) : (
            <div className={`relative w-full max-w-[min(24rem,44dvh)] transition-transform duration-700 md:max-w-[min(27rem,48dvh)] ${isPlaying ? 'animate-breathe' : 'scale-[0.95]'}`}>
              <Artwork mirrors={current.artworkMirrors} src={current.artworkLarge || current.artwork} alt={`${current.title} artwork`} size="lg" rounded="rounded-[28px]" className={`ring-1 ring-white/10 transition-shadow duration-700 ${isPlaying ? 'shadow-glow-lg' : 'shadow-lift'}`} />
            </div>
          )}

          <div className="mt-7 flex w-full max-w-xl items-center gap-3">
            <div className="min-w-0 flex-1">
              <h2 className="line-clamp-2 break-words text-xl font-bold leading-tight text-white sm:text-2xl md:text-3xl">{current.title}</h2>
              {current.artistId ? (
                <Link href={`/artist?p=${current.provider}&id=${current.artistId}`} onClick={() => setFullOpen(false)} className="mt-0.5 block truncate text-sm font-medium text-white/65 hover:text-white">
                  {current.artist}
                </Link>
              ) : (
                <p className="mt-0.5 truncate text-sm font-medium text-white/65">{current.artist}</p>
              )}
            </div>
            <FavoriteButton track={current} size={26} />
          </div>
          <div className="mt-5 w-full max-w-xl">
            <WaveSeek bars={52} height="h-12" />
          </div>
          <div className="mt-4 w-full max-w-xl">
            <Transport big />
          </div>
          {error && (
            <p className="mt-3 text-center text-sm text-red-400" role="alert">
              {error}
            </p>
          )}
          {current.preview ? (
            <p className="mt-5 text-center text-xs text-white/55">
              30-second preview from Apple Music. Full song:{' '}
              {current.permalink && (
                <>
                  <a href={current.permalink} target="_blank" rel="noopener noreferrer" className="text-gold hover:text-gold-soft">Apple Music</a>
                  {' · '}
                </>
              )}
              <a href={youtubeSearchUrl(current)} target="_blank" rel="noopener noreferrer" className="text-gold hover:text-gold-soft">YouTube</a>
            </p>
          ) : current.video ? (
            <p className="mt-5 max-w-sm text-balance text-center text-[11px] text-white/50">
              Playing in YouTube&apos;s official player. The video stays on screen and pauses when the app is closed, as YouTube requires.
            </p>
          ) : current.live ? (
            <p className="mt-5 text-center text-[11px] text-white/50">Live broadcast from the station · songs play in full, one after another</p>
          ) : (
            <p className="mt-5 inline-flex items-center gap-1.5 rounded-full bg-white/[0.06] px-3 py-1 text-[11px] text-white/60 ring-1 ring-white/10">
              <Icon name="check" size={12} className="text-dyn" /> Full song from <span className="text-white/85">{providerName(current.provider)}</span>
            </p>
          )}
          </div>
        </div>

        <aside className={`min-h-0 w-full flex-col rounded-3xl bg-white/[0.05] p-4 ring-1 ring-white/10 backdrop-blur-xl lg:flex lg:w-[26rem] ${showQueue ? 'flex' : 'hidden'}`}>
          <QueuePanel />
        </aside>
      </div>
      {menu && <TrackMenu track={current} onClose={() => setMenu(false)} />}
    </div>
  );
}
