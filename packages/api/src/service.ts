import type { Artist, Collection, PageOpts, ProviderId, Track } from '@sahu/models';
import { ArchiveProvider } from './archive';
import { AudiusProvider } from './audius';
import { DemoProvider } from './demo';
import { ItunesProvider } from './itunes';
import { JamendoProvider } from './jamendo';
import type { MusicProvider, TrendingOpts } from './provider';
import { RadioProvider } from './radio';
import { hindiFirst, rankSearch } from './rank';
import { filterPlayable, unavailableReason } from './rights';
import { YoutubeProvider } from './youtube';

export type CategoryStrategyInput =
  | { kind: 'genre'; genre: string }
  /** `years` keeps only tracks released in that inclusive range (tracks without a known year are dropped). */
  | { kind: 'search'; queries: string[]; years?: readonly [number, number] }
  | { kind: 'trending' }
  /** Live radio stations tagged with any of these tags. */
  | { kind: 'radio'; tags: string[] }
  /** The YouTube music chart for the region (original film songs, official player). */
  | { kind: 'youtube-chart' };

export interface SearchOpts {
  /** The listener typed this search: providers with a daily quota (YouTube) take part too. */
  userSearch?: boolean;
  /** Leave these providers out (e.g. slow ones for background rows). */
  exclude?: ProviderId[];
}

/** Per-query fetch size for year-filtered categories (most results fall outside the era). */
const ERA_FETCH = 50;

export interface MusicServiceConfig {
  audiusAppName?: string;
  jamendoClientId?: string;
  /**
   * Apple Music 30-SECOND PREVIEW CLIPS (mainstream/Bollywood catalogue). OFF by default:
   * SAHU MUSIC plays complete songs only. When off, the preview provider is not queried and
   * any preview-only track (e.g. one saved earlier) is refused with a clear message.
   */
  itunesPreviews?: boolean;
  /** iTunes storefront, default `IN`. */
  itunesCountry?: string;
  /** YouTube Data API key: enables original film songs in YouTube's official player. */
  youtubeApiKey?: string;
  /** YouTube region for search and the chart, default `IN`. */
  youtubeRegion?: string;
  /** Live radio from the Radio Browser directory. Default on. */
  radio?: boolean;
  /** Openly licensed audio from the Internet Archive. Default on. */
  archive?: boolean;
  forceDemo?: boolean;
  /** Extra providers (modular architecture – plug in more authorised sources here). */
  extraProviders?: MusicProvider[];
}

export interface ProviderStatus {
  id: ProviderId;
  name: string;
  homepage: string;
  configured: boolean;
  configHint?: string;
}

/**
 * Aggregates every configured provider behind one API, applies rights
 * verification to every track, and falls back to demo mode when no live
 * provider can be reached.
 */
export class MusicService {
  private readonly providers: MusicProvider[];
  private readonly demo = new DemoProvider();
  private blocklist: ReadonlySet<string> = new Set();
  private disabled: ReadonlySet<string> = new Set();
  private demoMode: boolean;
  private listeners = new Set<(demo: boolean) => void>();

  /** True only when the operator explicitly opted in to 30-second preview clips. */
  readonly previewsAllowed: boolean;

  constructor(private readonly cfg: MusicServiceConfig = {}) {
    this.previewsAllowed = cfg.itunesPreviews === true;
    this.providers = [
      new AudiusProvider({ appName: cfg.audiusAppName }),
      new JamendoProvider(cfg.jamendoClientId),
      new ItunesProvider({ enabled: cfg.itunesPreviews === true, country: cfg.itunesCountry }),
      new YoutubeProvider({ apiKey: cfg.youtubeApiKey, region: cfg.youtubeRegion }),
      new RadioProvider(cfg.radio !== false),
      new ArchiveProvider(cfg.archive !== false),
      ...(cfg.extraProviders ?? []),
    ];
    this.demoMode = !!cfg.forceDemo;
  }

  /** Admin-blocked tracks (`provider:id` keys from the `music_rights` table). */
  setBlocklist(keys: Iterable<string>): void {
    this.blocklist = new Set(keys);
  }
  /** Providers switched off by an admin in `music_providers`. */
  setDisabledProviders(ids: Iterable<string>): void {
    this.disabled = new Set(ids);
  }

  isDemoMode(): boolean {
    return this.demoMode;
  }
  onDemoModeChange(fn: (demo: boolean) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  private setDemo(v: boolean): void {
    if (this.demoMode === v) return;
    this.demoMode = v;
    this.listeners.forEach((l) => l(v));
  }

  status(): ProviderStatus[] {
    return this.providers.map((p) => ({
      id: p.id,
      name: p.name,
      homepage: p.homepage,
      configured: p.isConfigured() && !this.disabled.has(p.id),
      configHint: p.isConfigured() ? undefined : p.configHint,
    }));
  }

  private active(): MusicProvider[] {
    return this.providers.filter((p) => p.isConfigured() && !this.disabled.has(p.id));
  }

  /** True when a provider is configured and not switched off by an admin. */
  isActive(id: ProviderId): boolean {
    return this.active().some((p) => p.id === id);
  }

  private provider(id: string): MusicProvider | null {
    if (id === 'demo') return this.demo;
    return this.active().find((p) => p.id === id) ?? null;
  }

  /** Query all active providers; interleave results; demo fallback if every provider failed. */
  private async fanOut<T>(fn: (p: MusicProvider) => Promise<T[]>, pick: (p: MusicProvider) => boolean = () => true): Promise<T[]> {
    const active = this.cfg.forceDemo ? [] : this.active().filter(pick);
    if (active.length === 0) {
      this.setDemo(true);
      return fn(this.demo);
    }
    const settled = await Promise.allSettled(active.map((p) => withinBudget(fn(p), p.answerWithinMs)));
    const ok = settled.filter((s): s is PromiseFulfilledResult<T[]> => s.status === 'fulfilled').map((s) => s.value);
    // Some sources answer [] without asking anyone (radio has no chart). So: demo mode when
    // nothing came back at all and at least one source actually failed.
    const failed = settled.some((s) => s.status === 'rejected');
    if (ok.length === 0 || (failed && ok.every((l) => l.length === 0))) {
      this.setDemo(true);
      return fn(this.demo);
    }
    this.setDemo(false);
    return interleave(ok);
  }

  /** Final gate used by players right before audio starts (covers saved/library tracks too). */
  isTrackPlayable(track: Track): boolean {
    return this.unavailableReason(track) === null;
  }

  /** Listener-facing reason a track cannot be played in full, or null when it can. */
  unavailableReason(track: Track): string | null {
    return unavailableReason(track, this.blocklist, { allowPreviews: this.previewsAllowed });
  }

  private playable(tracks: Track[]): Track[] {
    return filterPlayable(tracks, this.blocklist, { allowPreviews: this.previewsAllowed });
  }

  /** Best title match first, Hindi/Indian music ahead of the rest (see rank.ts). */
  async searchTracks(query: string, page?: PageOpts, opts: SearchOpts = {}): Promise<Track[]> {
    const pick = (p: MusicProvider) => (opts.userSearch || !p.onDemandSearch) && !opts.exclude?.includes(p.id);
    return rankSearch(query, this.playable(await this.fanOut((p) => p.searchTracks(query, page), pick)));
  }

  /** Live radio stations for the given tags (e.g. bollywood, 90s, bhajan). */
  async getRadio(tags: string[], page: PageOpts = {}): Promise<Track[]> {
    const radio = this.provider('radio') as RadioProvider | null;
    return radio ? this.playable(await radio.getStations(tags, page)) : [];
  }

  /** YouTube's music chart for the region: the current original film songs. [] when YouTube is not set up. */
  async getYoutubeChart(page: PageOpts = {}): Promise<Track[]> {
    const yt = this.provider('youtube');
    return yt ? this.playable(await yt.getTrending(page)) : [];
  }
  searchArtists(query: string, page?: PageOpts): Promise<Artist[]> {
    return this.fanOut((p) => p.searchArtists(query, page));
  }
  searchCollections(query: string, page?: PageOpts): Promise<Collection[]> {
    return this.fanOut((p) => p.searchCollections(query, page));
  }
  async getTrending(opts?: TrendingOpts): Promise<Track[]> {
    return this.playable(await this.fanOut((p) => p.getTrending(opts)));
  }
  /**
   * "Hindi hits": the most played full-length Hindi/Indian tracks across several Hindi searches.
   * Used for the home page so Hindi music leads instead of the global chart.
   */
  async getHindiHits(limit = 20): Promise<Track[]> {
    const lists = await Promise.all(
      // the Archive is slow and has no play counts, radio has no songs: both stay out of this row
      ['hindi', 'bollywood', 'hindi song', 'arijit singh'].map((q) =>
        this.searchTracks(q, { limit: 50 }, { exclude: ['archive', 'radio'] }).catch(() => [] as Track[]),
      ),
    );
    const seen = new Set<string>();
    const pool = interleave(lists).filter((t) => t.duration >= 90 && t.duration <= 600 && !seen.has(t.providerTrackId) && !!seen.add(t.providerTrackId));
    return hindiFirst(pool.sort((a, b) => (b.playCount ?? 0) - (a.playCount ?? 0))).slice(0, limit);
  }
  getTrendingCollections(page?: PageOpts): Promise<Collection[]> {
    return this.fanOut((p) => p.getTrendingCollections(page));
  }
  async getGenres(): Promise<string[]> {
    const all = await this.fanOut((p) => p.getGenres());
    return [...new Set(all)];
  }

  /** Fill a SAHU MUSIC category from live provider data only. */
  async getCategoryTracks(strategy: CategoryStrategyInput, page: PageOpts = {}): Promise<Track[]> {
    if (strategy.kind === 'trending') return this.getTrending(page);
    if (strategy.kind === 'radio') return this.getRadio(strategy.tags, page);
    if (strategy.kind === 'youtube-chart') return this.getYoutubeChart(page);
    if (strategy.kind === 'genre') return this.getTrending({ ...page, genre: strategy.genre, time: 'month' });
    const years = strategy.years;
    if (!years) {
      const lists = await Promise.all(strategy.queries.map((q) => this.searchTracks(q, page).catch(() => [] as Track[])));
      return this.playable(interleave(lists));
    }
    // Era category: page through bigger provider pages, keep only the requested years.
    const size = page.limit ?? 20;
    const eraPage = { limit: ERA_FETCH, offset: Math.floor((page.offset ?? 0) / size) * ERA_FETCH };
    const lists = await Promise.all(
      strategy.queries.map((q) =>
        this.searchTracks(q, eraPage).then(
          (ts) => ts.filter((t) => t.year !== undefined && t.year >= years[0] && t.year <= years[1]),
          () => [] as Track[],
        ),
      ),
    );
    return this.playable(interleave(lists));
  }

  async getTrack(provider: string, id: string): Promise<Track | null> {
    const t = await this.provider(provider)?.getTrack(id);
    return t && this.playable([t]).length ? t : null;
  }
  async getArtist(provider: string, id: string): Promise<Artist | null> {
    return (await this.provider(provider)?.getArtist(id)) ?? null;
  }
  async getArtistTracks(provider: string, id: string, page?: PageOpts): Promise<Track[]> {
    return this.playable((await this.provider(provider)?.getArtistTracks(id, page)) ?? []);
  }
  async getArtistAlbums(provider: string, id: string, page?: PageOpts): Promise<Collection[]> {
    return (await this.provider(provider)?.getArtistAlbums(id, page)) ?? [];
  }
  async getCollection(provider: string, id: string): Promise<Collection | null> {
    const c = await this.provider(provider)?.getCollection(id);
    if (!c) return null;
    c.tracks = this.playable(c.tracks ?? []);
    return c;
  }
}

/** Resolve with [] when a slow provider misses its budget (its request continues and fills the cache). */
function withinBudget<T>(work: Promise<T[]>, ms?: number): Promise<T[]> {
  if (!ms) return work;
  return new Promise<T[]>((resolve, reject) => {
    const timer = setTimeout(() => resolve([]), ms);
    work.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

function interleave<T>(lists: T[][]): T[] {
  if (lists.length === 1) return lists[0];
  const out: T[] = [];
  const max = Math.max(0, ...lists.map((l) => l.length));
  for (let i = 0; i < max; i++) for (const l of lists) if (i < l.length) out.push(l[i]);
  return out;
}

export function createMusicService(cfg: MusicServiceConfig = {}): MusicService {
  return new MusicService(cfg);
}
