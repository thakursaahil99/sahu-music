import type { Artist, Collection, PageOpts, Track } from '@sahu/models';
import { fetchJson, RateLimiter } from './http';
import type { MusicProvider, TrendingOpts } from './provider';
import { evaluateRights } from './rights';

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Genres officially supported by Audius' trending/search filters. */
export const AUDIUS_GENRES = [
  'Electronic', 'Rock', 'Metal', 'Alternative', 'Hip-Hop/Rap', 'Experimental', 'Punk', 'Folk', 'Pop',
  'Ambient', 'Soundtrack', 'World', 'Jazz', 'Acoustic', 'Funk', 'R&B/Soul', 'Devotional', 'Classical',
  'Reggae', 'Country', 'Blues', 'Latin', 'Lo-Fi', 'Dancehall', 'House', 'Techno', 'Trap', 'Dubstep',
  'Drum & Bass', 'Trance', 'Deep House', 'Downtempo',
];

const idOk = (id: string) => /^[A-Za-z0-9]{1,32}$/.test(id);

export interface AudiusOptions {
  appName?: string;
  baseUrl?: string;
}

/**
 * Audius – open music platform with a free public API (no key required).
 * Tracks are uploaded by their creators; the API tells us per track whether it
 * is streamable and whether access is gated. Docs: https://docs.audius.org
 */
export class AudiusProvider implements MusicProvider {
  readonly id = 'audius' as const;
  readonly name = 'Audius';
  readonly homepage = 'https://audius.co';
  private readonly base: string;
  private readonly app: string;
  private readonly limiter = new RateLimiter(20, 5_000);

  constructor(opts: AudiusOptions = {}) {
    this.base = (opts.baseUrl || 'https://api.audius.co/v1').replace(/\/$/, '');
    this.app = encodeURIComponent(opts.appName || 'SAHU_MUSIC');
  }

  isConfigured(): boolean {
    return true;
  }

  private url(path: string, params: Record<string, string | number | undefined> = {}): string {
    const q = Object.entries(params)
      .filter(([, v]) => v !== undefined && v !== '')
      .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`);
    q.push(`app_name=${this.app}`);
    return `${this.base}${path}?${q.join('&')}`;
  }

  private async get(path: string, params?: Record<string, string | number | undefined>): Promise<any> {
    const json = await fetchJson<{ data?: unknown }>(this.url(path, params), {
      provider: this.id,
      limiter: this.limiter,
    });
    return json?.data ?? null;
  }

  streamUrl(trackId: string): string {
    return `${this.base}/tracks/${trackId}/stream?app_name=${this.app}`;
  }

  mapTrack = (t: any): Track | null => {
    if (!t || typeof t.id !== 'string' || !idOk(t.id) || !t.title) return null;
    const restricted =
      t.is_stream_gated === true ||
      t.is_delete === true ||
      t.is_unlisted === true ||
      t.is_available === false ||
      (t.stream_conditions != null && typeof t.stream_conditions === 'object');
    const rights = evaluateRights({
      providerSaysStreamable: t.is_streamable === true,
      restricted,
      license: t.license,
      basis:
        'Audius public API marks this track as streamable and not access-gated; it was published to Audius by its uploader for free streaming via the Audius API.',
    });
    return {
      provider: 'audius',
      providerTrackId: t.id,
      title: String(t.title),
      artist: t.user?.name || t.user?.handle || 'Unknown artist',
      artistId: typeof t.user?.id === 'string' ? t.user.id : undefined,
      artwork: t.artwork?.['480x480'] || t.artwork?.['150x150'] || null,
      artworkLarge: t.artwork?.['1000x1000'] || t.artwork?.['480x480'] || null,
      streamUrl: rights.streamingPermitted ? this.streamUrl(t.id) : '',
      duration: Number(t.duration) || 0,
      genre: t.genre || null,
      mood: t.mood || null,
      tags: typeof t.tags === 'string' && t.tags ? t.tags.slice(0, 160) : null,
      playCount: Number(t.play_count) || 0,
      permalink: t.permalink ? `https://audius.co${t.permalink}` : null,
      rights,
    };
  };

  mapArtist = (u: any): Artist | null => {
    if (!u || typeof u.id !== 'string' || !idOk(u.id) || u.is_deactivated) return null;
    return {
      provider: 'audius',
      providerArtistId: u.id,
      name: u.name || u.handle || 'Unknown artist',
      handle: u.handle,
      image: u.profile_picture?.['480x480'] || u.profile_picture?.['150x150'] || null,
      cover: u.cover_photo?.['2000x'] || u.cover_photo?.['640x'] || null,
      bio: u.bio || null,
      followerCount: Number(u.follower_count) || 0,
      trackCount: Number(u.track_count) || 0,
      verified: !!u.is_verified,
      permalink: u.handle ? `https://audius.co/${u.handle}` : null,
    };
  };

  mapCollection = (p: any): Collection | null => {
    if (!p || typeof p.id !== 'string' || !idOk(p.id) || p.is_private || p.is_delete || p.is_stream_gated) return null;
    return {
      provider: 'audius',
      providerCollectionId: p.id,
      kind: p.is_album ? 'album' : 'playlist',
      title: p.playlist_name || 'Untitled',
      description: p.description || null,
      artwork: p.artwork?.['480x480'] || p.artwork?.['150x150'] || null,
      ownerName: p.user?.name || p.user?.handle || 'Unknown',
      ownerId: typeof p.user?.id === 'string' ? p.user.id : undefined,
      trackCount: Number(p.track_count) || 0,
      permalink: p.permalink ? `https://audius.co${p.permalink}` : null,
    };
  };

  private tracks(data: any): Track[] {
    return (Array.isArray(data) ? data : []).map(this.mapTrack).filter((t): t is Track => !!t);
  }
  private artists(data: any): Artist[] {
    return (Array.isArray(data) ? data : []).map(this.mapArtist).filter((a): a is Artist => !!a);
  }
  private collections(data: any): Collection[] {
    return (Array.isArray(data) ? data : []).map(this.mapCollection).filter((c): c is Collection => !!c);
  }

  /**
   * Audius' own ordering is weak, so the first page asks for both its "relevant" and its
   * "popular" ordering and merges them; MusicService then re-ranks the pool (see rank.ts).
   */
  async searchTracks(query: string, page: PageOpts = {}): Promise<Track[]> {
    const params = { query, limit: page.limit ?? 20, offset: page.offset ?? 0 };
    if (params.offset > 0) return this.tracks(await this.get('/tracks/search', params));
    const [relevant, popular] = await Promise.allSettled([
      this.get('/tracks/search', params),
      this.get('/tracks/search', { ...params, sort_method: 'popular' }),
    ]);
    if (relevant.status === 'rejected' && popular.status === 'rejected') throw relevant.reason;
    const seen = new Set<string>();
    return [...(relevant.status === 'fulfilled' ? this.tracks(relevant.value) : []), ...(popular.status === 'fulfilled' ? this.tracks(popular.value) : [])].filter(
      (t) => !seen.has(t.providerTrackId) && !!seen.add(t.providerTrackId),
    );
  }
  async searchArtists(query: string, page: PageOpts = {}): Promise<Artist[]> {
    return this.artists(await this.get('/users/search', { query, limit: page.limit ?? 12, offset: page.offset ?? 0 }));
  }
  async searchCollections(query: string, page: PageOpts = {}): Promise<Collection[]> {
    return this.collections(await this.get('/playlists/search', { query, limit: page.limit ?? 12, offset: page.offset ?? 0 }));
  }
  async getTrending(opts: TrendingOpts = {}): Promise<Track[]> {
    // A genre from another provider's taxonomy (e.g. "Bollywood") is not an Audius genre.
    if (opts.genre && !AUDIUS_GENRES.includes(opts.genre)) return [];
    return this.tracks(
      await this.get('/tracks/trending', {
        genre: opts.genre,
        time: opts.time ?? 'week',
        limit: opts.limit ?? 20,
        offset: opts.offset ?? 0,
      }),
    );
  }
  async getTrendingCollections(page: PageOpts = {}): Promise<Collection[]> {
    return this.collections(await this.get('/playlists/trending', { limit: page.limit ?? 12, offset: page.offset ?? 0 }));
  }
  async getTrack(id: string): Promise<Track | null> {
    if (!idOk(id)) return null;
    return this.mapTrack(await this.get(`/tracks/${id}`));
  }
  async getArtist(id: string): Promise<Artist | null> {
    if (!idOk(id)) return null;
    return this.mapArtist(await this.get(`/users/${id}`));
  }
  async getArtistTracks(id: string, page: PageOpts = {}): Promise<Track[]> {
    if (!idOk(id)) return [];
    return this.tracks(await this.get(`/users/${id}/tracks`, { limit: page.limit ?? 20, offset: page.offset ?? 0, sort: 'plays' }));
  }
  async getArtistAlbums(id: string, page: PageOpts = {}): Promise<Collection[]> {
    if (!idOk(id)) return [];
    return this.collections(await this.get(`/users/${id}/albums`, { limit: page.limit ?? 12, offset: page.offset ?? 0 }));
  }
  async getCollection(id: string): Promise<Collection | null> {
    if (!idOk(id)) return null;
    const [meta, tracks] = await Promise.all([this.get(`/playlists/${id}`), this.get(`/playlists/${id}/tracks`)]);
    const col = this.mapCollection(Array.isArray(meta) ? meta[0] : meta);
    if (!col) return null;
    col.tracks = this.tracks(tracks);
    return col;
  }
  async getGenres(): Promise<string[]> {
    return AUDIUS_GENRES;
  }
}
