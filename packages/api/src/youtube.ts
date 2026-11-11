import type { Artist, Collection, PageOpts, Track } from '@sahu/models';
import { ApiError, fetchJson, RateLimiter } from './http';
import type { MusicProvider, TrendingOpts } from './provider';
import { evaluateRights } from './rights';

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * YouTube – original film songs, played in YouTube's OFFICIAL embedded player.
 *
 * - Search and metadata: YouTube Data API v3 (free key from Google Cloud).
 * - Playback: the official IFrame player only. The audio is never extracted or downloaded.
 * - Only videos whose owner allows embedding, that are public and not age-restricted, are listed.
 * - YouTube's terms apply: the video stays visible while it plays and playback stops when the
 *   app goes to the background. Tracks are flagged `video: true` so the player respects that.
 *
 * QUOTA: the free quota is 10,000 units a day. A search costs 100 units (≈100 searches a day per
 * key); the chart costs 1. So YouTube is used only for searches the listener types and for the
 * chart, never to fill category rows, and every answer is cached for hours (memory + browser).
 */

const API = 'https://www.googleapis.com/youtube/v3';
const idOk = (id: string) => /^[A-Za-z0-9_-]{11}$/.test(id);

/** Music labels' own channels: ranked first because they carry the original film songs. */
const OFFICIAL_CHANNELS = [
  't-series', 'sony music india', 'zee music company', 'saregama music', 'saregama', 'tips official', 'tips music', 'yrf',
  'speed records', 'times music', 'venus', 'shemaroo filmi gaane', 'eros now music', 'white hill music', 'desi music factory',
  'aditya music', 'lahari music', 'saavn', 'goldmines gaane sune ansune', 'ultra bollywood', 'pen music', 'junglee music',
  'universal music india', 'warner music india', 'geet mp3', 'saga music', 'jass records', 'brown boys records',
];

const PAGE_SIZE = 50;
const MIN_SECONDS = 60; // shorts and teasers are not songs
const MAX_SECONDS = 20 * 60; // hour-long compilations are not songs either
const CACHE_MS = 6 * 60 * 60 * 1000;
const STORE_KEY = 'sahu.yt.cache.v1';
const STORE_MAX = 60;

const BASIS =
  'Played in YouTube’s official embedded player. The video’s owner allows embedding and YouTube’s Terms of Service apply; SAHU MUSIC never stores or extracts the audio.';

/** ISO-8601 duration (PT1H2M3S) → seconds. */
export function parseIsoDuration(iso: unknown): number {
  const m = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(typeof iso === 'string' ? iso : '');
  if (!m) return 0;
  const [, d, h, mi, s] = m.map((x) => Number(x) || 0);
  return d * 86400 + h * 3600 + mi * 60 + s;
}

/** YouTube titles arrive HTML-escaped. */
function unescapeHtml(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

export function isOfficialChannel(channel: string): boolean {
  const c = channel.toLowerCase().trim();
  return c.endsWith(' - topic') || c.endsWith('vevo') || OFFICIAL_CHANNELS.some((o) => c === o || c.startsWith(`${o} `));
}

export interface YoutubeOptions {
  apiKey?: string;
  /** Two-letter region for search ranking and the chart. Default IN. */
  region?: string;
}

/** Small persistent cache so reloads do not spend quota again (browser only; ignored elsewhere). */
const store = {
  read(key: string): unknown | undefined {
    try {
      const all = JSON.parse(globalThis.localStorage?.getItem(STORE_KEY) ?? '{}') as Record<string, { at: number; v: unknown }>;
      const hit = all[key];
      return hit && Date.now() - hit.at < CACHE_MS ? hit.v : undefined;
    } catch {
      return undefined;
    }
  },
  write(key: string, v: unknown): void {
    try {
      const ls = globalThis.localStorage;
      if (!ls) return;
      const all = JSON.parse(ls.getItem(STORE_KEY) ?? '{}') as Record<string, { at: number; v: unknown }>;
      all[key] = { at: Date.now(), v };
      const keys = Object.keys(all).sort((a, b) => all[a].at - all[b].at);
      for (const k of keys.slice(0, Math.max(0, keys.length - STORE_MAX))) delete all[k];
      ls.setItem(STORE_KEY, JSON.stringify(all));
    } catch {
      /* storage full or blocked */
    }
  },
};

export class YoutubeProvider implements MusicProvider {
  readonly id = 'youtube' as const;
  readonly name = 'YouTube (official player)';
  readonly homepage = 'https://www.youtube.com';
  readonly configHint = 'Set NEXT_PUBLIC_YOUTUBE_API_KEY (free YouTube Data API key) to play original film songs.';
  /** Searches cost quota, so MusicService only asks YouTube for searches the listener typed. */
  readonly onDemandSearch = true;
  private readonly key: string;
  private readonly region: string;
  private readonly limiter = new RateLimiter(10, 10_000);
  /** query → YouTube page tokens ('' = first page), so "Load more" can continue a search. */
  private readonly pageTokens = new Map<string, string[]>();

  constructor(opts: YoutubeOptions = {}) {
    this.key = opts.apiKey?.trim() ?? '';
    this.region = /^[A-Za-z]{2}$/.test(opts.region ?? '') ? opts.region!.toUpperCase() : 'IN';
  }

  isConfigured(): boolean {
    return /^[A-Za-z0-9_-]{20,60}$/.test(this.key);
  }

  private async get(path: string, params: Record<string, string | number>): Promise<any> {
    const q = Object.entries({ ...params, key: this.key })
      .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
      .join('&');
    const cacheKey = `${path}?${Object.entries(params).map(([k, v]) => `${k}=${v}`).join('&')}`;
    const cached = store.read(cacheKey);
    if (cached !== undefined) return cached;
    try {
      const data = await fetchJson<any>(`${API}${path}?${q}`, { provider: this.id, limiter: this.limiter, cacheTtlMs: CACHE_MS, retries: 1 });
      store.write(cacheKey, data);
      return data;
    } catch (e) {
      if (e instanceof ApiError && e.status === 403) {
        throw new ApiError('The YouTube daily quota is used up or the key is restricted. Try again tomorrow.', this.id, e.endpoint, 403);
      }
      throw e;
    }
  }

  /** Turn videos.list items into playable tracks (embeddable, public, not age-restricted, song length). */
  private mapVideos(items: any[]): Track[] {
    const out: Track[] = [];
    for (const v of Array.isArray(items) ? items : []) {
      const id = typeof v?.id === 'string' ? v.id : '';
      if (!idOk(id)) continue;
      const sn = v.snippet ?? {};
      const duration = parseIsoDuration(v.contentDetails?.duration);
      if (duration < MIN_SECONDS || duration > MAX_SECONDS) continue;
      if (sn.liveBroadcastContent && sn.liveBroadcastContent !== 'none') continue;
      const embeddable = v.status?.embeddable === true && v.status?.privacyStatus === 'public';
      const ageRestricted = v.contentDetails?.contentRating?.ytRating === 'ytAgeRestricted';
      const rights = evaluateRights({ providerSaysStreamable: embeddable, restricted: ageRestricted, license: null, basis: BASIS });
      const thumbs = sn.thumbnails ?? {};
      const art = thumbs.high?.url || thumbs.medium?.url || thumbs.default?.url || null;
      const channel = typeof sn.channelTitle === 'string' ? sn.channelTitle : '';
      out.push({
        provider: 'youtube',
        providerTrackId: id,
        title: unescapeHtml(String(sn.title ?? 'Untitled')),
        artist: channel.replace(/ - Topic$/, '') || 'YouTube',
        artwork: art,
        artworkLarge: thumbs.maxres?.url || thumbs.standard?.url || art,
        streamUrl: rights.streamingPermitted ? `https://www.youtube.com/watch?v=${id}` : '',
        duration,
        video: true,
        official: isOfficialChannel(channel),
        tags: Array.isArray(sn.tags) ? sn.tags.slice(0, 12).join(',').slice(0, 160) : null,
        playCount: Number(v.statistics?.viewCount) || 0,
        year: typeof sn.publishedAt === 'string' ? Number(sn.publishedAt.slice(0, 4)) || undefined : undefined,
        permalink: `https://www.youtube.com/watch?v=${id}`,
        rights,
      });
    }
    return out;
  }

  private async details(ids: string[]): Promise<Track[]> {
    const ok = ids.filter(idOk);
    if (ok.length === 0) return [];
    const data = await this.get('/videos', { part: 'snippet,contentDetails,status,statistics', id: ok.join(','), maxResults: 50 });
    // keep the search order
    const byId = new Map(this.mapVideos(data?.items).map((t) => [t.providerTrackId, t]));
    return ok.map((id) => byId.get(id)).filter((t): t is Track => !!t);
  }

  /** One page per query (a second page would cost another 100 units). */
  /**
   * 50 songs per page (the most YouTube allows for the same 100-unit cost). "Load more" asks for
   * the next page with YouTube's page token; each further page costs another 100 units.
   */
  async searchTracks(query: string, page: PageOpts = {}): Promise<Track[]> {
    if (!this.isConfigured()) return [];
    const pageNo = Math.floor((page.offset ?? 0) / PAGE_SIZE);
    const tokens = this.pageTokens.get(query) ?? [''];
    const token = tokens[pageNo];
    if (token === undefined) return []; // earlier page not loaded, or no more pages
    const data = await this.get('/search', {
      part: 'snippet',
      type: 'video',
      videoEmbeddable: 'true',
      videoSyndicated: 'true',
      videoCategoryId: 10, // Music
      regionCode: this.region,
      relevanceLanguage: 'hi',
      safeSearch: 'moderate',
      maxResults: PAGE_SIZE,
      q: query,
      ...(token ? { pageToken: token } : {}),
    });
    if (typeof data?.nextPageToken === 'string' && /^[A-Za-z0-9_-]{1,200}$/.test(data.nextPageToken)) {
      tokens[pageNo + 1] = data.nextPageToken;
      this.pageTokens.set(query, tokens);
      if (this.pageTokens.size > 50) this.pageTokens.delete(this.pageTokens.keys().next().value as string);
    }
    const ids = (Array.isArray(data?.items) ? data.items : []).map((i: any) => i?.id?.videoId).filter((x: unknown): x is string => typeof x === 'string');
    return this.details(ids);
  }

  /** Most popular music videos in the region (1 quota unit): the current Bollywood chart in India. */
  async getTrending(opts: TrendingOpts = {}): Promise<Track[]> {
    if (!this.isConfigured() || opts.genre || (opts.offset ?? 0) > 0) return [];
    const data = await this.get('/videos', {
      part: 'snippet,contentDetails,status,statistics',
      chart: 'mostPopular',
      videoCategoryId: 10,
      regionCode: this.region,
      maxResults: 50,
    });
    return this.mapVideos(data?.items).slice(0, opts.limit ?? 50);
  }

  async getTrack(id: string): Promise<Track | null> {
    if (!this.isConfigured() || !idOk(id)) return null;
    return (await this.details([id]))[0] ?? null;
  }

  // Artist pages, albums and playlists would each cost quota; YouTube is used for songs only.
  async searchArtists(): Promise<Artist[]> {
    return [];
  }
  async searchCollections(): Promise<Collection[]> {
    return [];
  }
  async getTrendingCollections(): Promise<Collection[]> {
    return [];
  }
  async getArtist(): Promise<Artist | null> {
    return null;
  }
  async getArtistTracks(): Promise<Track[]> {
    return [];
  }
  async getArtistAlbums(): Promise<Collection[]> {
    return [];
  }
  async getCollection(): Promise<Collection | null> {
    return null;
  }
  async getGenres(): Promise<string[]> {
    return [];
  }
}
