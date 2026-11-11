import type { Artist, Collection, PageOpts, Track } from '@sahu/models';
import { fetchJson, RateLimiter } from './http';
import type { MusicProvider, TrendingOpts } from './provider';
import { evaluateRights } from './rights';

/* eslint-disable @typescript-eslint/no-explicit-any */

const idOk = (id: string) => /^\d{1,15}$/.test(id);

/** Preview clips are only ever played from Apple's own audio hosts. */
const PREVIEW_OK = /^https:\/\/[a-z0-9-]+(\.[a-z0-9-]+)*\.(apple\.com|mzstatic\.com)\//;
const APPLE_LINK_OK = /^https:\/\/(music|itunes|geo\.music)\.apple\.com\//;

/** Seconds. Apple's preview clips are 30 s (a few are longer; the player reads the real length). */
const PREVIEW_SECONDS = 30;

/** iTunes genre ids for the chart feed. Only ids confirmed against the live API are listed. */
const CHART_GENRES: Record<string, number> = {
  Bollywood: 1263,
};

const BASIS =
  'Apple’s iTunes Search API supplies this 30-second preview clip for promotional listening. The full song is owned by its label and is not available for free streaming – use the Apple Music link to hear it in full.';

export interface ItunesOptions {
  /** Two-letter storefront. Default `IN` (India) so Bollywood/regional catalogues rank first. */
  country?: string;
  enabled?: boolean;
}

/**
 * Apple iTunes Search API – free, official, no key (https://performance-partners.apple.com/search-api).
 * It covers the mainstream catalogue (Bollywood film soundtracks of every era, Punjabi, pop…)
 * but only as 30-SECOND PREVIEW CLIPS. Full label-owned songs cannot be streamed for free by
 * any authorised API, so every track from this provider is flagged `preview: true` and links
 * out to Apple Music for the full song.
 *
 * Apple asks for roughly ≤ 20 calls/minute per client; responses are long-cached by the browser.
 */
export class ItunesProvider implements MusicProvider {
  readonly id = 'itunes' as const;
  readonly name = 'Apple Music previews';
  readonly homepage = 'https://music.apple.com';
  readonly configHint = 'Off by default (30-second clips only). Set NEXT_PUBLIC_ITUNES_PREVIEWS=true to opt in.';
  private readonly country: string;
  private readonly enabled: boolean;
  private readonly limiter = new RateLimiter(18, 60_000);

  constructor(opts: ItunesOptions = {}) {
    this.country = /^[A-Za-z]{2}$/.test(opts.country ?? '') ? opts.country!.toUpperCase() : 'IN';
    this.enabled = opts.enabled === true;
  }

  isConfigured(): boolean {
    return this.enabled;
  }

  private fetch(url: string): Promise<any> {
    return fetchJson<any>(url, { provider: this.id, limiter: this.limiter, limiterMaxWaitMs: 4_000, cacheTtlMs: 600_000, retries: 1 });
  }

  private async api(path: 'search' | 'lookup', params: Record<string, string | number | undefined>): Promise<any[]> {
    const q = Object.entries({ ...params, country: this.country, media: 'music' })
      .filter(([, v]) => v !== undefined && v !== '')
      .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
      .join('&');
    const json = await this.fetch(`https://itunes.apple.com/${path}?${q}`);
    return Array.isArray(json?.results) ? json.results : [];
  }

  private art(url: unknown, size: number): string | null {
    if (typeof url !== 'string' || !url.startsWith('https://')) return null;
    return url.replace(/\/\d+x\d+(bb)?\.(jpg|png|webp)$/, `/${size}x${size}bb.jpg`);
  }

  private build(f: {
    id: string;
    title: unknown;
    artist: unknown;
    artistId?: string;
    artwork: unknown;
    preview: unknown;
    genre?: unknown;
    album?: unknown;
    released?: unknown;
    link?: unknown;
  }): Track | null {
    if (!idOk(f.id) || !f.title) return null;
    const preview = typeof f.preview === 'string' && PREVIEW_OK.test(f.preview) ? f.preview : '';
    const rights = evaluateRights({ providerSaysStreamable: !!preview, restricted: false, license: null, basis: BASIS });
    const year = typeof f.released === 'string' ? Number(f.released.slice(0, 4)) : NaN;
    return {
      provider: 'itunes',
      providerTrackId: f.id,
      title: String(f.title),
      artist: typeof f.artist === 'string' && f.artist ? f.artist : 'Unknown artist',
      artistId: f.artistId && idOk(f.artistId) ? f.artistId : undefined,
      artwork: this.art(f.artwork, 480),
      artworkLarge: this.art(f.artwork, 1000),
      streamUrl: preview,
      duration: PREVIEW_SECONDS,
      preview: true,
      album: typeof f.album === 'string' ? f.album : null,
      year: Number.isFinite(year) && year > 1900 ? year : undefined,
      genre: typeof f.genre === 'string' ? f.genre : null,
      permalink: typeof f.link === 'string' && APPLE_LINK_OK.test(f.link) ? f.link : null,
      rights,
    };
  }

  private mapTrack = (r: any): Track | null => {
    if (!r || r.wrapperType !== 'track' || r.kind !== 'song') return null;
    return this.build({
      id: String(r.trackId ?? ''),
      title: r.trackName,
      artist: r.artistName,
      artistId: String(r.artistId ?? ''),
      artwork: r.artworkUrl100,
      preview: r.previewUrl,
      genre: r.primaryGenreName,
      album: r.collectionName,
      released: r.releaseDate,
      link: r.trackViewUrl,
    });
  };

  /** Entry of the legacy chart feed (the only Apple chart feed that includes preview clips). */
  private mapChartEntry = (e: any): Track | null => {
    if (!e) return null;
    const links: any[] = [].concat(e.link ?? []);
    const preview = links.find((l) => l?.attributes?.['im:assetType'] === 'preview')?.attributes?.href;
    const page = links.find((l) => l?.attributes?.type === 'text/html')?.attributes?.href;
    const images: any[] = [].concat(e['im:image'] ?? []);
    const artistHref: string = e['im:artist']?.attributes?.href ?? '';
    return this.build({
      id: String(e.id?.attributes?.['im:id'] ?? ''),
      title: e['im:name']?.label,
      artist: e['im:artist']?.label,
      artistId: /\/artist\/[^/]*\/(\d+)/.exec(artistHref)?.[1],
      artwork: images[images.length - 1]?.label,
      preview,
      genre: e.category?.attributes?.label,
      album: e['im:collection']?.['im:name']?.label,
      released: e['im:releaseDate']?.label,
      link: page,
    });
  };

  private mapArtist = (r: any): Artist | null => {
    const id = String(r?.artistId ?? '');
    if (!r || r.wrapperType !== 'artist' || !idOk(id)) return null;
    return {
      provider: 'itunes',
      providerArtistId: id,
      name: r.artistName || 'Unknown artist',
      image: null, // the Search API does not return artist photos
      bio: r.primaryGenreName ? `${r.primaryGenreName} · previews via Apple Music` : null,
      permalink: typeof r.artistLinkUrl === 'string' && APPLE_LINK_OK.test(r.artistLinkUrl) ? r.artistLinkUrl : null,
    };
  };

  private mapCollection = (r: any): Collection | null => {
    const id = String(r?.collectionId ?? '');
    if (!r || r.wrapperType !== 'collection' || !idOk(id)) return null;
    const ownerId = String(r.artistId ?? '');
    return {
      provider: 'itunes',
      providerCollectionId: id,
      kind: 'album',
      title: r.collectionName || 'Untitled',
      description: [r.primaryGenreName, typeof r.releaseDate === 'string' ? r.releaseDate.slice(0, 4) : null, '30-second previews']
        .filter(Boolean)
        .join(' · '),
      artwork: this.art(r.artworkUrl100, 480),
      ownerName: r.artistName || 'Various artists',
      ownerId: idOk(ownerId) ? ownerId : undefined,
      trackCount: Number(r.trackCount) || 0,
      permalink: typeof r.collectionViewUrl === 'string' && APPLE_LINK_OK.test(r.collectionViewUrl) ? r.collectionViewUrl : null,
    };
  };

  private tracks(rows: any[]): Track[] {
    return rows.map(this.mapTrack).filter((t): t is Track => !!t);
  }
  private collections(rows: any[]): Collection[] {
    return rows.map(this.mapCollection).filter((c): c is Collection => !!c);
  }

  async searchTracks(query: string, page: PageOpts = {}): Promise<Track[]> {
    return this.tracks(await this.api('search', { term: query, entity: 'song', limit: page.limit ?? 20, offset: page.offset ?? 0 }));
  }
  async searchArtists(query: string, page: PageOpts = {}): Promise<Artist[]> {
    const rows = await this.api('search', { term: query, entity: 'musicArtist', limit: page.limit ?? 12, offset: page.offset ?? 0 });
    return rows.map(this.mapArtist).filter((a): a is Artist => !!a);
  }
  async searchCollections(query: string, page: PageOpts = {}): Promise<Collection[]> {
    return this.collections(await this.api('search', { term: query, entity: 'album', limit: page.limit ?? 12, offset: page.offset ?? 0 }));
  }

  /** "Most played" chart of the storefront (optionally one genre). The feed has no offset, so we slice. */
  async getTrending(opts: TrendingOpts = {}): Promise<Track[]> {
    let genrePath = '';
    if (opts.genre) {
      const gid = CHART_GENRES[opts.genre];
      if (!gid) return []; // a genre from another provider's taxonomy
      genrePath = `/genre=${gid}`;
    }
    const limit = opts.limit ?? 20;
    const offset = opts.offset ?? 0;
    const want = Math.min(100, Math.ceil((offset + limit) / 50) * 50); // 50 or 100 → few distinct URLs → good caching
    if (offset >= want) return [];
    const json = await this.fetch(`https://itunes.apple.com/${this.country.toLowerCase()}/rss/topsongs/limit=${want}${genrePath}/json`);
    const entries: any[] = [].concat(json?.feed?.entry ?? []);
    return entries
      .map(this.mapChartEntry)
      .filter((t): t is Track => !!t)
      .slice(offset, offset + limit);
  }
  async getTrendingCollections(): Promise<Collection[]> {
    return [];
  }

  async getTrack(id: string): Promise<Track | null> {
    if (!idOk(id)) return null;
    return this.tracks(await this.api('lookup', { id }))[0] ?? null;
  }
  async getArtist(id: string): Promise<Artist | null> {
    if (!idOk(id)) return null;
    return (await this.api('lookup', { id })).map(this.mapArtist).find((a): a is Artist => !!a) ?? null;
  }
  /** `lookup` has no offset either: fetch up to the requested window and slice. */
  async getArtistTracks(id: string, page: PageOpts = {}): Promise<Track[]> {
    if (!idOk(id)) return [];
    const limit = page.limit ?? 20;
    const offset = page.offset ?? 0;
    const want = Math.min(200, Math.ceil((offset + limit) / 100) * 100);
    if (offset >= want) return [];
    return this.tracks(await this.api('lookup', { id, entity: 'song', limit: want })).slice(offset, offset + limit);
  }
  async getArtistAlbums(id: string, page: PageOpts = {}): Promise<Collection[]> {
    if (!idOk(id)) return [];
    return this.collections(await this.api('lookup', { id, entity: 'album', limit: page.limit ?? 12 }));
  }
  async getCollection(id: string): Promise<Collection | null> {
    if (!idOk(id)) return null;
    const rows = await this.api('lookup', { id, entity: 'song', limit: 200 });
    const col = rows.map(this.mapCollection).find((c): c is Collection => !!c);
    if (!col) return null;
    col.tracks = this.tracks(rows);
    return col;
  }
  async getGenres(): Promise<string[]> {
    return Object.keys(CHART_GENRES);
  }
}
