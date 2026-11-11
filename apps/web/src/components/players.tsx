'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { providerName, trackKey } from '@sahu/models';
import { formatDuration } from '@sahu/shared';
import { usePlayer, useProgress } from '@/lib/player';
import { Artwork } from './Artwork';
import { Icon } from './icons';
import { FavoriteButton, TrackMenu, TrackRow, youtubeSearchUrl } from './tracks';

function SeekBar({ showTimes = true }: { showTimes?: boolean }) {
  const { seek, current } = usePlayer();
  const { position, duration } = useProgress();
  const [drag, setDrag] = useState<number | null>(null);
  const total = duration || current?.duration || 0;
  if (current?.live) {
    return (
      <div className="flex w-full items-center justify-center gap-2 py-1 text-xs font-bold uppercase tracking-widest text-red-400" aria-label="Live broadcast">
        <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" /> Live
      </div>
    );
  }
  const value = drag ?? Math.min(position, total || position);
  const pct = total > 0 ? (value / total) * 100 : 0;
  return (
    <div className="flex w-full items-center gap-3">
      {showTimes && <span className="w-10 text-right text-xs tabular-nums text-muted">{formatDuration(value)}</span>}
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
        onPointerUp={() => {
          if (drag !== null) seek(drag);
          setDrag(null);
        }}
        onKeyUp={() => {
          if (drag !== null) seek(drag);
          setDrag(null);
        }}
        className="range flex-1"
        style={{ ['--pct' as string]: `${pct}%` }}
      />
      {showTimes && <span className="w-10 text-xs tabular-nums text-muted">{formatDuration(total)}</span>}
    </div>
  );
}

function Transport({ big = false }: { big?: boolean }) {
  const { isPlaying, isLoading, toggle, next, prev, shuffle, repeat, toggleShuffle, cycleRepeat } = usePlayer();
  const s = big ? 26 : 20;
  return (
    <div className={`flex items-center justify-center ${big ? 'gap-5 sm:gap-7' : 'gap-3'}`}>
      <button type="button" onClick={toggleShuffle} aria-label="Shuffle" aria-pressed={shuffle} className={`icon-btn ${shuffle ? 'text-gold' : 'text-muted hover:text-white'}`}>
        <Icon name="shuffle" size={s - 2} />
      </button>
      <button type="button" onClick={prev} aria-label="Previous" className="icon-btn text-white hover:text-gold">
        <Icon name="prev" size={s} />
      </button>
      <button
        type="button"
        onClick={toggle}
        aria-label={isPlaying ? 'Pause' : 'Play'}
        className={`flex items-center justify-center rounded-full bg-gold text-ink transition duration-200 hover:scale-110 hover:bg-gold-soft active:scale-95 ${big ? 'h-16 w-16' : 'h-10 w-10'} ${isPlaying && big ? 'animate-pulse-ring' : ''}`}
      >
        {isLoading ? (
          <span className={`animate-spin rounded-full border-2 border-ink/30 border-t-ink ${big ? 'h-7 w-7' : 'h-5 w-5'}`} aria-label="Buffering" />
        ) : (
          <Icon name={isPlaying ? 'pause' : 'play'} size={big ? 30 : 20} />
        )}
      </button>
      <button type="button" onClick={next} aria-label="Next" className="icon-btn text-white hover:text-gold">
        <Icon name="next" size={s} />
      </button>
      <button
        type="button"
        onClick={cycleRepeat}
        aria-label={`Repeat: ${repeat}`}
        className={`icon-btn relative ${repeat !== 'off' ? 'text-gold' : 'text-muted hover:text-white'}`}
      >
        <Icon name="repeat" size={s - 2} />
        {repeat === 'one' && <span className="absolute -right-0.5 -top-0.5 rounded-full bg-gold px-1 text-[9px] font-bold leading-4 text-ink">1</span>}
      </button>
    </div>
  );
}

/** Persistent bar above the bottom navigation (mobile) / at the bottom of the window (desktop). */
export function MiniPlayer() {
  const { current, isPlaying, isLoading, toggle, next, setFullOpen, volume, setVolume, error } = usePlayer();
  const { position, duration } = useProgress();
  if (!current) return null;
  const total = duration || current.duration || 0;
  const pct = total > 0 ? Math.min(100, (position / total) * 100) : 0;

  return (
    <div className="glass relative z-30 mx-2 mb-2 animate-slide-up overflow-hidden rounded-2xl shadow-lift ring-1 ring-white/10 md:mx-0 md:mb-0 md:rounded-3xl" role="region" aria-label="Player">
      {/* thin progress line (mobile) */}
      <div className="absolute inset-x-0 top-0 h-0.5 bg-coal-line md:hidden">
        <div className="h-full bg-gradient-to-r from-gold-deep via-gold to-gold-soft shadow-glow transition-[width] duration-300" style={{ width: `${pct}%` }} />
      </div>
      <div className="flex items-center gap-3 px-3 py-2 md:grid md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_minmax(0,1fr)] md:gap-6 md:px-5 md:py-3">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <button type="button" onClick={() => setFullOpen(true)} className="flex min-w-0 flex-1 items-center gap-3 text-left md:flex-none" aria-label="Open full player">
            <Artwork src={current.artwork} alt="" size="sm" rounded="rounded-xl" className={`h-11 w-11 shrink-0 transition md:h-14 md:w-14 ${isPlaying ? 'shadow-glow ring-1 ring-gold/50' : ''}`} />
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold text-white">{current.title}</span>
              <span className={`block truncate text-xs ${error ? 'text-red-400' : 'text-muted'}`}>
                {error || (current.preview ? `Preview · ${current.artist}` : current.live ? `● Live · ${current.artist}` : current.artist)}
              </span>
            </span>
          </button>
          <span className="hidden md:block">
            <FavoriteButton track={current} />
          </span>
        </div>

        <div className="hidden flex-col items-center gap-1 md:flex">
          <Transport />
          <SeekBar />
        </div>

        <div className="flex items-center justify-end gap-1 md:gap-2">
          <span className="md:hidden">
            <FavoriteButton track={current} />
          </span>
          <button type="button" onClick={toggle} aria-label={isPlaying ? 'Pause' : 'Play'} className="icon-btn text-white md:hidden">
            {isLoading ? <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" /> : <Icon name={isPlaying ? 'pause' : 'play'} size={24} />}
          </button>
          <button type="button" onClick={next} aria-label="Next" className="icon-btn text-white md:hidden">
            <Icon name="next" size={22} />
          </button>
          <div className="hidden items-center gap-2 md:flex">
            <Icon name="volume" size={18} className="text-muted" />
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
            <button type="button" onClick={() => setFullOpen(true)} aria-label="Open queue and full player" className="icon-btn text-muted hover:text-white">
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
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-bold uppercase tracking-widest text-gold">Queue · {queue.length}</h3>
        {queue.length > 1 && (
          <button type="button" onClick={clearQueue} className="text-xs text-muted hover:text-white">
            Clear upcoming
          </button>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        {queue.map((t, i) => (
          <div key={trackKey(t)} className={i < index ? 'opacity-50' : ''}>
            <TrackRow track={t} list={queue} index={i} showIndex={false} onPlay={i === index ? undefined : () => jumpTo(i)} onRemove={() => removeFromQueue(i)} />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Full-screen player overlay. */
export function FullPlayer() {
  const { current, fullOpen, setFullOpen, error, isPlaying, setVideoSlot } = usePlayer();
  const [showQueue, setShowQueue] = useState(false);
  const [menu, setMenu] = useState(false);

  useEffect(() => {
    if (!fullOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setFullOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [fullOpen, setFullOpen]);

  if (!fullOpen || !current) return null;

  return (
    <div className="fixed inset-0 z-50 flex animate-slide-up flex-col bg-ink" role="dialog" aria-modal="true" aria-label="Now playing">
      <div className="pointer-events-none absolute inset-0 opacity-40" aria-hidden="true">
        {current.artwork && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={current.artwork} alt="" className="h-full w-full scale-125 object-cover blur-3xl" />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-ink/60 via-ink/85 to-ink" />
      </div>

      <header className="relative flex items-center justify-between px-4 py-3 md:px-8">
        <button type="button" onClick={() => setFullOpen(false)} className="icon-btn text-white" aria-label="Close player">
          <Icon name="chevronDown" size={26} />
        </button>
        <p className="text-xs font-bold uppercase tracking-[0.25em] text-gold">Now Playing</p>
        <div className="flex items-center">
          <button type="button" onClick={() => setShowQueue((v) => !v)} className={`icon-btn lg:hidden ${showQueue ? 'text-gold' : 'text-white'}`} aria-label="Toggle queue" aria-pressed={showQueue}>
            <Icon name="queue" size={22} />
          </button>
          <button type="button" onClick={() => setMenu(true)} className="icon-btn text-white" aria-label="More options">
            <Icon name="more" size={22} />
          </button>
        </div>
      </header>

      <div className="relative mx-auto flex min-h-0 w-full max-w-6xl flex-1 gap-10 px-5 pb-6 md:px-8">
        <div className={`min-h-0 flex-1 flex-col items-center justify-center ${showQueue ? 'hidden lg:flex' : 'flex'}`}>
          {current.video ? (
            // YouTube's player is drawn over this slot by <VideoStage/> (it must stay visible while it plays)
            <div ref={setVideoSlot} className="aspect-video min-h-[200px] w-full max-w-[min(40rem,52dvh*16/9)]" aria-label="Video" />
          ) : (
            <div className={`w-full max-w-[min(22rem,42dvh)] transition-transform duration-700 md:max-w-[min(26rem,46dvh)] ${isPlaying ? 'animate-breathe' : 'scale-[0.94]'}`}>
              <Artwork src={current.artworkLarge || current.artwork} alt={`${current.title} artwork`} size="lg" rounded="rounded-2xl" className={`ring-1 ring-white/10 transition-shadow duration-700 ${isPlaying ? 'shadow-glow-lg' : 'shadow-glow'}`} />
            </div>
          )}
          {/* decorative level bars that move while music plays */}
          <div className="mt-5 flex h-6 items-end gap-1" aria-hidden="true">
            {Array.from({ length: 24 }, (_, i) => (
              <span
                key={i}
                className={`w-1 origin-bottom rounded-full bg-gold/70 ${isPlaying ? 'animate-eq' : ''}`}
                style={{ height: `${30 + ((i * 37) % 70)}%`, animationDelay: `${(i % 7) * 0.11}s`, animationDuration: `${0.7 + (i % 5) * 0.12}s`, transform: isPlaying ? undefined : 'scaleY(0.25)' }}
              />
            ))}
          </div>
          <div className="mt-4 flex w-full max-w-xl items-center gap-3">
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-xl font-bold text-white md:text-2xl">{current.title}</h2>
              {current.artistId ? (
                <Link href={`/artist?p=${current.provider}&id=${current.artistId}`} onClick={() => setFullOpen(false)} className="block truncate text-sm text-muted hover:text-gold">
                  {current.artist}
                </Link>
              ) : (
                <p className="truncate text-sm text-muted">{current.artist}</p>
              )}
            </div>
            <FavoriteButton track={current} size={26} />
          </div>
          <div className="mt-4 w-full max-w-xl">
            <SeekBar />
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
            <p className="mt-4 text-center text-xs text-muted">
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
            <p className="mt-4 text-center text-[11px] text-muted">
              Playing in YouTube&apos;s official player · the video stays on screen and pauses when the app is closed, as YouTube requires
            </p>
          ) : current.live ? (
            <p className="mt-4 text-center text-[11px] text-muted">Live broadcast from the station · songs play in full, one after another</p>
          ) : (
            <p className="mt-4 text-center text-[11px] text-muted">
              Streaming from <span className="text-white/80">{providerName(current.provider)}</span> · full-length stream confirmed by provider
            </p>
          )}
        </div>

        <aside className={`min-h-0 w-full flex-col rounded-2xl bg-white/5 p-4 ring-1 ring-white/10 backdrop-blur-xl lg:flex lg:w-[26rem] ${showQueue ? 'flex' : 'hidden'}`}>
          <QueuePanel />
        </aside>
      </div>
      {menu && <TrackMenu track={current} onClose={() => setMenu(false)} />}
    </div>
  );
}
