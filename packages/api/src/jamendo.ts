import type { Artist, Collection, PageOpts, Track } from '@sahu/models';
import { fetchJson, RateLimiter } from './http';
import type { MusicProvider, TrendingOpts } from './provider';
import { evaluateRights } from './rights';

/* eslint-disable @typescript-eslint/no-explicit-any */

const idOk = (id: string) => /^\d{1,12}$/.test(id);

/**
 * Jamendo – Creative Commons music with a free API (client_id required).
 * IMPORTANT: Jamendo's free API tier is for NON-COMMERCIAL apps. Every Jamendo
 * track is therefore reported with commercialUse = not_allowed unless its CC
 * licence itself allows commercial use, and advertising stays unconfirmed.
 * Docs: https://developer.jamendo.com/v3.0
 */
export class JamendoProvider implements MusicProvider {
  readonly id = 'jamendo' as const;
  readonly name = 'Jamendo';
  readonly homepage = 'https://www.jamendo.com';
  readonly configHint = 'Set NEXT_PUBLIC_JAMENDO_CLIENT_ID (free at devportal.jamendo.com) to enable Jamendo.';
  private readonly base = 'https://api.jamendo.com/v3.0';
  private readonly limiter = new RateLimiter(10, 5_000);

  constructor(private readonly clientId?: string) {}

  isConfigured(): boolean {
    return !!this.clientId && /^[A-Za-z0-9]{6,40}$/.test(this.clientId);
  }

  private async get(path: string, params: Record<string, string | number | undefined>): Promise<any[]> {
    if (!this.isConfigured()) return [];
    const q = Object.entries({ client_id: this.clientId, format: 'json', ...params })
      .filter(([, v]) => v !== undefined && v !== '')
      .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
      .join('&');
    const json = await fetchJson<{ results?: any[] }>(`${this.base}${path}?${q}`, { provider: this.id, limiter: this.limiter });
    return Array.isArray(json?.results) ? json.results : [];
  }

  private mapTrack = (t: any, fallback: any = {}): Track | null => {
    const id = String(t?.id ?? '');
    if (!idOk(id) || !t.name) return null;
    const audio: string = typeof t.audio === 'string' ? t.audio : '';
    const rights = evaluateRights({
      providerSaysStreamable: audio.startsWith('https://'),
      restricted: false,
      license: t.license_ccurl || null,
      basis: 'Jamendo API returned a stream URL for this Creative Commons track (free API tier: non-commercial use).',
    });
    return {
      provider: 'jamendo',
      providerTrackId: id,
      title: String(t.name),
      artist: t.artist_name || fallback.artist_name || 'Unknown artist',
      artistId: String(t.artist_id ?? fallback.artist_id ?? '') || undefined,
      artwork: t.image || t.album_image || fallback.image || null,
      artworkLarge: t.image || t.album_image || fallback.image || null,
      streamUrl: rights.streamingPermitted ? audio : '',
      duration: Number(t.duration) || 0,
      genre: null,
      permalink: t.shareurl || null,
      rights,
    };
  };

  private tracks(rows: any[]): Track[] {
    return rows.map((r) => this.mapTrack(r)).filter((t): t is Track => !!t);
  }

  private page(p: PageOpts = {}, def = 20) {
    return { limit: p.limit ?? def, offset: p.offset ?? 0 };
  }

  async searchTracks(query: string, page?: PageOpts): Promise<Track[]> {
    return this.tracks(await this.get('/tracks/', { search: query, audioformat: 'mp32', ...this.page(page) }));
  }
  async searchArtists(query: string, page?: PageOpts): Promise<Artist[]> {
    const rows = await this.get('/artists/', { namesearch: query, ...this.page(page, 12) });
    return rows.map(this.mapArtist).filter((a): a is Artist => !!a);
  }
  async searchCollections(): Promise<Collection[]> {
    return [];
  }
  async getTrending(opts: TrendingOpts = {}): Promise<Track[]> {
    return this.tracks(
      await this.get('/tracks/', {
        order: 'popularity_week',
        tags: opts.genre ? opts.genre.toLowerCase().replace(/[^a-z0-9]/g, '') : undefined,
        audioformat: 'mp32',
        ...this.page(opts),
      }),
    );
  }
  async getTrendingCollections(): Promise<Collection[]> {
    return [];
  }
  async getTrack(id: string): Promise<Track | null> {
    if (!idOk(id)) return null;
    return this.tracks(await this.get('/tracks/', { id, audioformat: 'mp32' }))[0] ?? null;
  }
  private mapArtist = (a: any): Artist | null => {
    const id = String(a?.id ?? '');
    if (!idOk(id)) return null;
    return {
      provider: 'jamendo',
      providerArtistId: id,
      name: a.name || 'Unknown artist',
      image: a.image || null,
      permalink: a.shareurl || null,
    };
  };
  async getArtist(id: string): Promise<Artist | null> {
    if (!idOk(id)) return null;
    return this.mapArtist((await this.get('/artists/', { id }))[0]);
  }
  async getArtistTracks(id: string, page?: PageOpts): Promise<Track[]> {
    if (!idOk(id)) return [];
    const rows = await this.get('/artists/tracks/', { id, audioformat: 'mp32', ...this.page(page) });
    const a = rows[0];
    if (!a || !Array.isArray(a.tracks)) return [];
    return a.tracks
      .map((t: any) => this.mapTrack(t, { artist_name: a.name, artist_id: a.id, image: a.image }))
      .filter((t: Track | null): t is Track => !!t);
  }
  async getArtistAlbums(): Promise<Collection[]> {
    return [];
  }
  async getCollection(id: string): Promise<Collection | null> {
    if (!idOk(id)) return null;
    const a = (await this.get('/albums/tracks/', { id, audioformat: 'mp32' }))[0];
    if (!a) return null;
    const tracks: Track[] = (Array.isArray(a.tracks) ? a.tracks : [])
      .map((t: any) => this.mapTrack(t, { artist_name: a.artist_name, artist_id: a.artist_id, image: a.image }))
      .filter((t: Track | null): t is Track => !!t);
    return {
      provider: 'jamendo',
      providerCollectionId: id,
      kind: 'album',
      title: a.name || 'Untitled',
      artwork: a.image || null,
      ownerName: a.artist_name || 'Unknown',
      ownerId: String(a.artist_id ?? '') || undefined,
      trackCount: tracks.length,
      tracks,
    };
  }
  async getGenres(): Promise<string[]> {
    return [];
  }
}
