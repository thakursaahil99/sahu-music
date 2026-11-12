'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { trackKey, type Track } from '@sahu/models';
import { AudioEngine, YouTubeEngine, type Engine, type EngineEvents } from './engines';
import { readLocal, writeLocal } from './hooks';
import { useLibrary } from './library';
import { music } from './music';
import { useSettings } from './settings';
import { useToast } from './toast';

export type RepeatMode = 'off' | 'all' | 'one';

interface PlayerValue {
  queue: Track[];
  index: number;
  current: Track | null;
  isPlaying: boolean;
  isLoading: boolean;
  shuffle: boolean;
  repeat: RepeatMode;
  volume: number;
  error: string | null;
  fullOpen: boolean;
  setFullOpen(open: boolean): void;
  /** Where the full player wants the YouTube video drawn (null = floating dock). */
  videoSlot: HTMLElement | null;
  setVideoSlot(el: HTMLElement | null): void;
  /** Replace the queue with `list` and start at `startIndex`. */
  playQueue(list: Track[], startIndex?: number): void;
  toggle(): void;
  next(): void;
  prev(): void;
  seek(seconds: number): void;
  toggleShuffle(): void;
  cycleRepeat(): void;
  setVolume(v: number): void;
  addToQueue(t: Track): void;
  playNext(t: Track): void;
  jumpTo(i: number): void;
  removeFromQueue(i: number): void;
  clearQueue(): void;
  /** Stop playback and close the player (and a YouTube video) completely. */
  stop(): void;
  /**
   * Prepare a song the listener will probably play: `intent` (pointer resting on it, finger down)
   * buffers it; `likely` (top search result, the #1 hit) only opens it, which costs ~100 KB.
   */
  warm(t: Track, how?: 'intent' | 'likely'): void;
}

interface Progress {
  position: number;
  duration: number;
}

/** A random queue position other than the current one. */
function shufflePick(length: number, current: number): number {
  let n: number;
  do n = Math.floor(Math.random() * length);
  while (n === current);
  return n;
}

const PlayerCtx = createContext<PlayerValue | null>(null);
const ProgressCtx = createContext<Progress>({ position: 0, duration: 0 });

export function usePlayer(): PlayerValue {
  const v = useContext(PlayerCtx);
  if (!v) throw new Error('usePlayer must be used inside PlayerProvider');
  return v;
}
/** Separate context so only progress bars re-render on every time update. */
export const useProgress = () => useContext(ProgressCtx);

const KEY = 'sahu.player.v1';
interface Saved {
  queue: Track[];
  index: number;
  shuffle: boolean;
  repeat: RepeatMode;
  volume: number;
}

export function PlayerProvider({ children }: { children: ReactNode }) {
  const toast = useToast();
  const { addHistory } = useLibrary();
  const { settings } = useSettings();

  const audioRef = useRef<AudioEngine | null>(null);
  const ytRef = useRef<YouTubeEngine | null>(null);
  const activeRef = useRef<Engine | null>(null);
  const [queue, setQueue] = useState<Track[]>([]);
  const [index, setIndex] = useState(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState<RepeatMode>('off');
  const [volume, setVolumeState] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [fullOpen, setFullOpen] = useState(false);
  const [videoSlot, setVideoSlot] = useState<HTMLElement | null>(null);
  const [progress, setProgress] = useState<Progress>({ position: 0, duration: 0 });

  // Latest values for event handlers that are registered once.
  const live = useRef({ queue, index, shuffle, repeat, autoplayNext: settings.autoplayNext, failures: 0 });
  live.current = { ...live.current, queue, index, shuffle, repeat, autoplayNext: settings.autoplayNext };
  const addHistoryRef = useRef(addHistory);
  addHistoryRef.current = addHistory;

  const engineFor = (t: Track): Engine | null => (t.video ? ytRef.current : audioRef.current);
  /** With shuffle on, the next pick is made early so that it can be buffered. */
  const upcomingRef = useRef<{ from: number; to: number } | null>(null);

  const startAt = useCallback(
    (q: Track[], i: number, autoplay = true) => {
      const t = q[i];
      const engine = t ? engineFor(t) : null;
      if (!t || !engine) return;
      // Rights gate: nothing without confirmed full-length streaming permission ever starts playing.
      const blocked = music.unavailableReason(t);
      if (blocked) {
        toast(blocked, 'error');
        return;
      }
      if (activeRef.current && activeRef.current !== engine) activeRef.current.stop();
      activeRef.current = engine;
      setQueue(q);
      setIndex(i);
      setError(null);
      setIsPlaying(false);
      setProgress({ position: 0, duration: t.duration || 0 });
      if (autoplay) setIsLoading(true);
      engine.load(t, autoplay);
      if (autoplay) addHistoryRef.current(t);
    },
    [toast],
  );

  const advance = useCallback(
    (auto: boolean) => {
      const { queue: q, index: i, shuffle: sh, repeat: rp } = live.current;
      const engine = activeRef.current;
      if (!engine || q.length === 0) return;
      if (auto && rp === 'one') {
        engine.seek(0);
        engine.play();
        return;
      }
      let ni: number;
      const planned = upcomingRef.current;
      upcomingRef.current = null;
      if (sh && q.length > 1 && planned && planned.from === i && planned.to < q.length) {
        ni = planned.to; // the shuffle pick that was already buffered
      } else if (sh && q.length > 1) {
        ni = shufflePick(q.length, i);
      } else {
        ni = i + 1;
      }
      if (ni >= q.length) {
        if (rp === 'all' || !auto) ni = 0;
        else {
          setIsPlaying(false);
          return;
        }
      }
      startAt(q, ni);
    },
    [startAt],
  );
  const advanceRef = useRef(advance);
  advanceRef.current = advance;
  const toastRef = useRef(toast);
  toastRef.current = toast;

  // Create both engines once + restore the last session (paused).
  useEffect(() => {
    /** Events from an engine that is not the active one are stale and ignored. */
    const events = (self: () => Engine | null): EngineEvents => {
      const mine = () => activeRef.current !== null && activeRef.current === self();
      return {
        play: () => mine() && setIsPlaying(true),
        pause: () => mine() && setIsPlaying(false),
        waiting: () => mine() && setIsLoading(true),
        playing: () => {
          if (!mine()) return;
          setIsLoading(false);
          setError(null);
          live.current.failures = 0;
        },
        time: (position, duration) => mine() && setProgress({ position, duration }),
        ended: () => {
          if (!mine()) return;
          if (live.current.autoplayNext || live.current.repeat !== 'off') advanceRef.current(true);
          else setIsPlaying(false);
        },
        blocked: () => {
          if (!mine()) return;
          setIsLoading(false);
          setError(self() === ytRef.current ? 'Tap play on the video to start.' : 'Tap play to start listening.');
        },
        error: (message, skip) => {
          if (!mine()) return;
          setIsLoading(false);
          setIsPlaying(false);
          live.current.failures += 1;
          const offline = typeof navigator !== 'undefined' && !navigator.onLine;
          if (offline) {
            setError('You are offline. Playback will resume when you reconnect.');
          } else if ((skip || live.current.failures <= 2) && live.current.failures <= 3 && live.current.queue.length > 1) {
            toastRef.current(`${message ?? 'Could not play this track.'} Skipping…`, 'error');
            advanceRef.current(false);
          } else {
            setError(message ?? 'The full-length stream for this track is unavailable right now.');
          }
        },
      };
    };
    const audio = new AudioEngine(events(() => audioRef.current));
    const yt = new YouTubeEngine(events(() => ytRef.current));
    audioRef.current = audio;
    ytRef.current = yt;

    const saved = readLocal<Saved | null>(KEY, null);
    if (saved) {
      const q = (saved.queue ?? []).filter((t) => t.provider !== 'demo' && music.isTrackPlayable(t));
      const i = Math.min(Math.max(saved.index ?? 0, 0), q.length - 1);
      setShuffle(!!saved.shuffle);
      setRepeat(saved.repeat ?? 'off');
      const vol = typeof saved.volume === 'number' ? Math.min(1, Math.max(0, saved.volume)) : 1;
      setVolumeState(vol);
      audio.setVolume(vol);
      yt.setVolume(vol);
      if (q.length) {
        setQueue(q);
        setIndex(i);
        setProgress({ position: 0, duration: q[i].duration || 0 });
        // Audio is prepared right away; a video is only created when play is pressed.
        if (!q[i].video) {
          audio.load(q[i], false);
          activeRef.current = audio;
        }
      }
    }

    // YouTube's terms: no background playback. On phones/tablets the video pauses when the app is hidden.
    const onHidden = () => {
      if (document.visibilityState === 'hidden' && activeRef.current === ytRef.current && window.matchMedia('(pointer: coarse)').matches) {
        ytRef.current?.pause();
      }
    };
    document.addEventListener('visibilitychange', onHidden);
    return () => {
      document.removeEventListener('visibilitychange', onHidden);
      audio.stop();
      yt.stop();
      activeRef.current = null;
    };
  }, []);

  const current = index >= 0 ? queue[index] ?? null : null;

  /** Buffering ahead costs data: not with Data saver on, nor when the browser asks to save data. */
  const mayPreload = useCallback((): boolean => {
    if (settings.dataSaver) return false;
    const conn = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
    return !conn?.saveData && !/(^|-)2g$/.test(conn?.effectiveType ?? '');
  }, [settings.dataSaver]);

  // Once a song is playing, buffer the one after it so that Next and the automatic move are instant.
  useEffect(() => {
    if (!isPlaying || index < 0 || queue.length < 2 || !mayPreload()) return;
    const timer = setTimeout(() => {
      let ni = index + 1;
      if (shuffle) {
        const planned = upcomingRef.current;
        ni = planned && planned.from === index && planned.to < queue.length ? planned.to : shufflePick(queue.length, index);
        upcomingRef.current = { from: index, to: ni };
      } else if (ni >= queue.length) {
        if (repeat !== 'all') return;
        ni = 0;
      }
      const t = queue[ni];
      if (t && !t.video && music.isTrackPlayable(t)) audioRef.current?.preload(t, 'next');
    }, 1500);
    return () => clearTimeout(timer);
  }, [isPlaying, index, queue, shuffle, repeat, mayPreload]);

  const warm = useCallback(
    (t: Track, how: 'intent' | 'likely' = 'intent') => {
      if (t.live || !mayPreload() || !music.isTrackPlayable(t)) return;
      // YouTube: get its player ready (no video is loaded or played until the tap)
      if (t.video) ytRef.current?.prepare();
      else audioRef.current?.preload(t, how);
    },
    [mayPreload],
  );

  // Persist queue (metadata only – audio is never stored).
  useEffect(() => {
    const t = setTimeout(
      () => writeLocal(KEY, { queue: queue.filter((x) => x.provider !== 'demo').slice(0, 200), index, shuffle, repeat, volume } satisfies Saved),
      300,
    );
    return () => clearTimeout(t);
  }, [queue, index, shuffle, repeat, volume]);

  const playQueue = useCallback((list: Track[], startIndex = 0) => startAt(list, startIndex), [startAt]);

  const toggle = useCallback(() => {
    const { queue: q, index: i } = live.current;
    const t = q[i];
    if (!t) return;
    const engine = activeRef.current;
    // nothing loaded yet (restored session, video) or failed earlier → (re)start this track
    if (!engine || engine.loadedKey() !== trackKey(t) || engine.hasError()) {
      startAt(q, i);
      return;
    }
    if (engine.isPaused()) {
      setError(null);
      engine.play();
      if (!isPlayingRef.current) addHistoryRef.current(t);
    } else engine.pause();
  }, [startAt]);
  const isPlayingRef = useRef(isPlaying);
  isPlayingRef.current = isPlaying;

  const next = useCallback(() => advance(false), [advance]);

  const prev = useCallback(() => {
    const engine = activeRef.current;
    const { queue: q, index: i } = live.current;
    if (!engine || q.length === 0) return;
    if (engine.time() > 3 || i <= 0) {
      engine.seek(0);
      if (engine.isPaused()) engine.play();
    } else startAt(q, i - 1);
  }, [startAt]);

  const seek = useCallback((seconds: number) => {
    const engine = activeRef.current;
    const { queue: q, index: i } = live.current;
    if (!engine || q[i]?.live) return;
    engine.seek(seconds);
    setProgress((p) => ({ ...p, position: Math.max(0, seconds) }));
  }, []);

  const toggleShuffle = useCallback(() => setShuffle((s) => !s), []);
  const cycleRepeat = useCallback(() => setRepeat((r) => (r === 'off' ? 'all' : r === 'all' ? 'one' : 'off')), []);
  const setVolume = useCallback((v: number) => {
    const vol = Math.min(1, Math.max(0, v));
    setVolumeState(vol);
    audioRef.current?.setVolume(vol);
    ytRef.current?.setVolume(vol);
  }, []);

  const addToQueue = useCallback(
    (t: Track) => {
      const { queue: q, index: i } = live.current;
      if (!music.isTrackPlayable(t)) return toast(music.unavailableReason(t) ?? 'This track is not available.', 'error');
      if (q.some((x) => trackKey(x) === trackKey(t))) return toast('Already in queue');
      if (i < 0 || q.length === 0) return startAt([t], 0);
      setQueue([...q, t]);
      toast('Added to queue');
    },
    [startAt, toast],
  );

  const playNext = useCallback(
    (t: Track) => {
      const { queue: q, index: i } = live.current;
      if (!music.isTrackPlayable(t)) return toast(music.unavailableReason(t) ?? 'This track is not available.', 'error');
      if (i < 0 || q.length === 0) return startAt([t], 0);
      const key = trackKey(t);
      if (trackKey(q[i]) === key) return;
      const before = q.slice(0, i + 1).filter((x) => trackKey(x) !== key);
      const after = q.slice(i + 1).filter((x) => trackKey(x) !== key);
      setQueue([...before, t, ...after]);
      setIndex(before.length - 1);
      toast('Playing next');
    },
    [startAt, toast],
  );

  const jumpTo = useCallback((i: number) => startAt(live.current.queue, i), [startAt]);

  const removeFromQueue = useCallback(
    (i: number) => {
      const { queue: q, index: cur } = live.current;
      if (i < 0 || i >= q.length) return;
      const nq = q.filter((_, k) => k !== i);
      if (i === cur) {
        if (nq.length === 0) {
          activeRef.current?.stop();
          activeRef.current = null;
          setQueue([]);
          setIndex(-1);
          setIsPlaying(false);
          setFullOpen(false);
        } else startAt(nq, Math.min(i, nq.length - 1), !(activeRef.current?.isPaused() ?? true));
      } else {
        setQueue(nq);
        if (i < cur) setIndex(cur - 1);
      }
    },
    [startAt],
  );

  const clearQueue = useCallback(() => {
    const { queue: q, index: i } = live.current;
    if (i >= 0 && q[i]) {
      setQueue([q[i]]);
      setIndex(0);
    }
  }, []);

  const stop = useCallback(() => {
    activeRef.current?.stop();
    activeRef.current = null;
    setQueue([]);
    setIndex(-1);
    setIsPlaying(false);
    setFullOpen(false);
  }, []);

  // Media Session → lock-screen / notification / hardware media-key controls.
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
    const ms = navigator.mediaSession;
    if (!current) {
      ms.metadata = null;
      return;
    }
    const art = current.artworkLarge || current.artwork;
    ms.metadata = new MediaMetadata({
      title: current.title,
      artist: current.artist,
      album: current.live ? 'SAHU MUSIC · Live radio' : 'SAHU MUSIC',
      artwork: art ? [{ src: art, sizes: '512x512' }] : [{ src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' }],
    });
    const set = (action: MediaSessionAction, handler: MediaSessionActionHandler | null) => {
      try {
        ms.setActionHandler(action, handler);
      } catch {
        /* action not supported by this browser */
      }
    };
    set('play', () => activeRef.current?.play());
    set('pause', () => activeRef.current?.pause());
    set('previoustrack', prev);
    set('nexttrack', next);
    const canSeek = !current.live;
    set('seekto', canSeek ? (d) => typeof d.seekTime === 'number' && seek(d.seekTime) : null);
    set('seekbackward', canSeek ? (d) => seek((activeRef.current?.time() ?? 0) - (d.seekOffset ?? 10)) : null);
    set('seekforward', canSeek ? (d) => seek((activeRef.current?.time() ?? 0) + (d.seekOffset ?? 10)) : null);
  }, [current, next, prev, seek]);

  useEffect(() => {
    if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
      navigator.mediaSession.playbackState = current ? (isPlaying ? 'playing' : 'paused') : 'none';
    }
  }, [isPlaying, current]);

  // Space bar toggles playback when not typing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (e.code !== 'Space' || !el || /^(INPUT|TEXTAREA|SELECT|BUTTON|A)$/.test(el.tagName) || el.isContentEditable) return;
      e.preventDefault();
      toggle();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggle]);

  const value = useMemo<PlayerValue>(
    () => ({
      queue, index, current, isPlaying, isLoading, shuffle, repeat, volume, error, fullOpen, setFullOpen, videoSlot, setVideoSlot,
      playQueue, toggle, next, prev, seek, toggleShuffle, cycleRepeat, setVolume, addToQueue, playNext, jumpTo, removeFromQueue, clearQueue, stop, warm,
    }),
    [queue, index, current, isPlaying, isLoading, shuffle, repeat, volume, error, fullOpen, videoSlot,
      playQueue, toggle, next, prev, seek, toggleShuffle, cycleRepeat, setVolume, addToQueue, playNext, jumpTo, removeFromQueue, clearQueue, stop, warm],
  );

  return (
    <PlayerCtx.Provider value={value}>
      <ProgressCtx.Provider value={progress}>{children}</ProgressCtx.Provider>
    </PlayerCtx.Provider>
  );
}
