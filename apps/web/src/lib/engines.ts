'use client';

import { trackKey, type Track } from '@sahu/models';

/**
 * Playback engines. The player drives exactly one at a time:
 *  - AudioEngine:   an <audio> element (Audius, Jamendo, Internet Archive, live radio, demo)
 *  - YouTubeEngine: YouTube's official IFrame player, shown in a visible frame (original film songs)
 */

export interface EngineEvents {
  play(): void;
  pause(): void;
  waiting(): void;
  playing(): void;
  time(position: number, duration: number): void;
  ended(): void;
  /** `skip` = this item can never play here (e.g. embedding disabled), move on. */
  error(message: string | null, skip: boolean): void;
  /** The browser refused to start playback without a tap. */
  blocked(): void;
}

export interface Engine {
  load(track: Track, autoplay: boolean): void;
  play(): void;
  pause(): void;
  seek(seconds: number): void;
  time(): number;
  duration(): number;
  isPaused(): boolean;
  hasError(): boolean;
  setVolume(v: number): void;
  stop(): void;
  /** Key of the track currently loaded, if any. */
  loadedKey(): string | null;
}

// ── <audio> ──────────────────────────────────────────────────────────
export class AudioEngine implements Engine {
  readonly el: HTMLAudioElement;
  private key: string | null = null;

  constructor(private readonly on: EngineEvents) {
    this.el = new Audio();
    this.el.preload = 'metadata';
    const el = this.el;
    el.addEventListener('play', () => on.play());
    el.addEventListener('pause', () => on.pause());
    el.addEventListener('waiting', () => on.waiting());
    el.addEventListener('playing', () => on.playing());
    const t = () => on.time(el.currentTime, Number.isFinite(el.duration) ? el.duration : 0);
    el.addEventListener('timeupdate', t);
    el.addEventListener('durationchange', t);
    el.addEventListener('ended', () => on.ended());
    el.addEventListener('error', () => {
      if (el.getAttribute('src')) on.error(null, false);
    });
  }

  load(track: Track, autoplay: boolean): void {
    this.key = trackKey(track);
    this.el.src = track.streamUrl;
    if (autoplay) this.play();
  }
  play(): void {
    this.el.play().catch((e: Error) => {
      if (e?.name === 'NotAllowedError') this.on.blocked();
      // AbortError: superseded by another track – nothing to do
    });
  }
  pause(): void {
    this.el.pause();
  }
  seek(seconds: number): void {
    if (!Number.isFinite(this.el.duration)) return; // live radio
    this.el.currentTime = Math.max(0, Math.min(seconds, this.el.duration));
  }
  time(): number {
    return this.el.currentTime;
  }
  duration(): number {
    return Number.isFinite(this.el.duration) ? this.el.duration : 0;
  }
  isPaused(): boolean {
    return this.el.paused;
  }
  hasError(): boolean {
    return !!this.el.error;
  }
  setVolume(v: number): void {
    this.el.volume = v;
  }
  stop(): void {
    this.el.pause();
    this.el.removeAttribute('src');
    this.el.load();
    this.key = null;
  }
  loadedKey(): string | null {
    return this.key;
  }
}

// ── YouTube IFrame player ────────────────────────────────────────────
/* Minimal typing of the parts of the IFrame API we use. */
interface YTPlayer {
  loadVideoById(id: string): void;
  cueVideoById(id: string): void;
  playVideo(): void;
  pauseVideo(): void;
  stopVideo(): void;
  seekTo(s: number, allowSeekAhead: boolean): void;
  getCurrentTime(): number;
  getDuration(): number;
  getPlayerState(): number;
  setVolume(v: number): void;
  destroy(): void;
}
interface YTNamespace {
  Player: new (el: HTMLElement, opts: Record<string, unknown>) => YTPlayer;
}
declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

/** Element id the VideoStage component renders; the player lives inside it. */
export const YT_HOST_ID = 'sahu-yt-host';

let apiPromise: Promise<YTNamespace> | null = null;
function loadApi(): Promise<YTNamespace> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (apiPromise) return apiPromise;
  apiPromise = new Promise<YTNamespace>((resolve, reject) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      if (window.YT) resolve(window.YT);
    };
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    s.async = true;
    s.onerror = () => {
      apiPromise = null;
      reject(new Error('YouTube player could not be loaded.'));
    };
    document.head.appendChild(s);
  });
  return apiPromise;
}

const S = { UNSTARTED: -1, ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5 } as const;

export class YouTubeEngine implements Engine {
  private player: YTPlayer | null = null;
  private ready = false;
  private key: string | null = null;
  private pendingId: string | null = null;
  private pendingAutoplay = false;
  private poll: ReturnType<typeof setInterval> | null = null;
  private startGuard: ReturnType<typeof setTimeout> | null = null;
  private volume = 100;
  private failed = false;

  constructor(private readonly on: EngineEvents) {}

  private async ensure(): Promise<void> {
    if (this.player) return;
    const YT = await loadApi();
    const host = document.getElementById(YT_HOST_ID);
    if (!host) throw new Error('Video area missing.');
    const mount = document.createElement('div');
    host.querySelector('[data-yt-mount]')?.replaceChildren(mount);
    this.player = new YT.Player(mount, {
      width: '100%',
      height: '100%',
      playerVars: { playsinline: 1, rel: 0, modestbranding: 1, origin: window.location.origin },
      events: {
        onReady: () => {
          this.ready = true;
          this.player?.setVolume(this.volume);
          if (this.pendingId) {
            const id = this.pendingId;
            this.pendingId = null;
            this.start(id, this.pendingAutoplay);
          }
        },
        onStateChange: (e: { data: number }) => this.onState(e.data),
        onError: (e: { data: number }) => {
          this.failed = true;
          this.stopPolling();
          const embed = e.data === 101 || e.data === 150 || e.data === 100;
          this.on.error(embed ? 'The owner of this video does not allow it to play outside YouTube.' : 'This video could not be played.', true);
        },
      },
    });
  }

  private onState(state: number): void {
    switch (state) {
      case S.PLAYING:
        this.clearGuard();
        this.on.play();
        this.on.playing();
        this.startPolling();
        break;
      case S.PAUSED:
        this.on.pause();
        this.tick();
        this.stopPolling();
        break;
      case S.BUFFERING:
        this.on.waiting();
        break;
      case S.ENDED:
        this.stopPolling();
        this.on.pause();
        this.on.ended();
        break;
      default:
        break;
    }
  }

  private tick(): void {
    if (!this.player) return;
    this.on.time(this.player.getCurrentTime() || 0, this.player.getDuration() || 0);
  }
  private startPolling(): void {
    this.stopPolling();
    this.poll = setInterval(() => this.tick(), 500);
  }
  private stopPolling(): void {
    if (this.poll) clearInterval(this.poll);
    this.poll = null;
  }
  private clearGuard(): void {
    if (this.startGuard) clearTimeout(this.startGuard);
    this.startGuard = null;
  }

  private start(id: string, autoplay: boolean): void {
    if (!this.player || !this.ready) {
      this.pendingId = id;
      this.pendingAutoplay = autoplay;
      return;
    }
    this.failed = false;
    if (autoplay) {
      this.player.loadVideoById(id);
      this.on.waiting();
      // Some browsers (iOS) only start a video after a tap on the video itself.
      this.clearGuard();
      this.startGuard = setTimeout(() => {
        const st = this.player?.getPlayerState();
        if (st === S.UNSTARTED || st === S.CUED) this.on.blocked();
      }, 6000);
    } else {
      this.player.cueVideoById(id);
    }
  }

  load(track: Track, autoplay: boolean): void {
    this.key = trackKey(track);
    this.pendingId = track.providerTrackId;
    this.pendingAutoplay = autoplay;
    this.ensure()
      .then(() => {
        if (this.key !== trackKey(track)) return; // another track was chosen meanwhile
        this.start(track.providerTrackId, autoplay);
      })
      .catch((e: Error) => this.on.error(e.message, false));
  }
  play(): void {
    this.player?.playVideo();
  }
  pause(): void {
    this.player?.pauseVideo();
  }
  seek(seconds: number): void {
    this.player?.seekTo(Math.max(0, seconds), true);
    this.tick();
  }
  time(): number {
    return this.player?.getCurrentTime() ?? 0;
  }
  duration(): number {
    return this.player?.getDuration() ?? 0;
  }
  isPaused(): boolean {
    const st = this.player?.getPlayerState();
    return st !== S.PLAYING && st !== S.BUFFERING;
  }
  hasError(): boolean {
    return this.failed;
  }
  setVolume(v: number): void {
    this.volume = Math.round(v * 100);
    if (this.ready) this.player?.setVolume(this.volume);
  }
  stop(): void {
    this.clearGuard();
    this.stopPolling();
    this.pendingId = null;
    if (this.ready) this.player?.stopVideo();
    this.key = null;
  }
  loadedKey(): string | null {
    return this.key;
  }
}
