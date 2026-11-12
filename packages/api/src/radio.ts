import type { Artist, Collection, PageOpts, Track } from '@sahu/models';
import { fetchJson, RateLimiter } from './http';
import type { MusicProvider, TrendingOpts } from './provider';
import { evaluateRights } from './rights';

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Live radio – stations from the free, community-run Radio Browser directory (https://www.radio-browser.info).
 * No key needed. Stations broadcast full songs non-stop (Bollywood, 90s, old Hindi, devotional…).
 *
 * - Only stations the directory last checked as working, and only HTTPS streams (a secure site
 *   cannot play plain-HTTP audio), are listed.
 * - Every item is `live: true`: no length, no seeking, it never "ends".
 * - The station itself publishes the stream and holds its broadcast licences; SAHU MUSIC links to it.
 */

const API = 'https://de1.api.radio-browser.info/json';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const BASIS =
  'Live broadcast stream published by the radio station itself and listed in the Radio Browser directory. The station is responsible for its broadcast licences; SAHU MUSIC only plays the station’s public stream.';

export class RadioProvider implements MusicProvider {
  readonly id = 'radio' as const;
  readonly name = 'Live radio (Radio Browser)';
  readonly homepage = 'https://www.radio-browser.info';
  /** Stations are an extra in search results: the songs never wait longer than this for them. */
  readonly answerWithinMs = 2_500;
  private readonly limiter = new RateLimiter(10, 5_000);

  constructor(private readonly enabled = true) {}

  isConfigured(): boolean {
    return this.enabled;
  }

  private async stations(params: Record<string, string | number>): Promise<Track[]> {
    const q = Object.entries({ hidebroken: 'true', order: 'clickcount', reverse: 'true', ...params })
      .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
      .join('&');
    const rows = await fetchJson<any[]>(`${API}/stations/search?${q}`, { provider: this.id, limiter: this.limiter, cacheTtlMs: 30 * 60_000 });
    return (Array.isArray(rows) ? rows : []).map(this.map).filter((t): t is Track => !!t);
  }

  private map = (r: any): Track | null => {
    const id = String(r?.stationuuid ?? '');
    const url = typeof r?.url_resolved === 'string' ? r.url_resolved.trim() : '';
    if (!UUID.test(id) || !r.name) return null;
    if (!url.startsWith('https://') || r.hls === 1 || r.hls === true) return null; // secure, plain audio only
    const ok = r.lastcheckok === 1 || r.lastcheckok === true;
    const rights = evaluateRights({ providerSaysStreamable: ok, restricted: false, license: null, basis: BASIS });
    const favicon = typeof r.favicon === 'string' && r.favicon.startsWith('https://') ? r.favicon : null;
    const place = [r.state, r.country].filter((x: unknown) => typeof x === 'string' && x).join(', ');
    return {
      provider: 'radio',
      providerTrackId: id.toLowerCase(),
      title: String(r.name).trim().slice(0, 120),
      artist: place ? `Live radio · ${place}` : 'Live radio',
      artwork: favicon,
      artworkLarge: favicon,
      streamUrl: rights.streamingPermitted ? url : '',
      duration: 0,
      live: true,
      genre: 'Radio',
      tags: typeof r.tags === 'string' ? r.tags.slice(0, 160) : null,
      playCount: Number(r.clickcount) || 0,
      permalink: typeof r.homepage === 'string' && /^https?:\/\//.test(r.homepage) ? r.homepage : null,
      rights,
    };
  };

  private dedupe(lists: Track[][], limit: number): Track[] {
    const seen = new Set<string>();
    const names = new Set<string>();
    const out: Track[] = [];
    for (const t of lists.flat()) {
      const name = t.title.toLowerCase();
      if (seen.has(t.providerTrackId) || names.has(name)) continue;
      seen.add(t.providerTrackId);
      names.add(name);
      out.push(t);
    }
    return out.sort((a, b) => (b.playCount ?? 0) - (a.playCount ?? 0)).slice(0, limit);
  }

  /** Stations tagged with, or named after, any of the given terms (e.g. bollywood, bhajan, kishore). */
  async getStations(terms: string[], page: PageOpts = {}): Promise<Track[]> {
    if (!this.enabled || (page.offset ?? 0) > 0) return [];
    const lists = await Promise.all(
      terms.flatMap((term) => [
        this.stations({ tag: term.toLowerCase(), limit: 40 }).catch(() => [] as Track[]),
        this.stations({ name: term, limit: 20 }).catch(() => [] as Track[]),
      ]),
    );
    return this.dedupe(lists, page.limit ?? 30);
  }

  /** Station names and tags that match what was typed. */
  async searchTracks(query: string, page: PageOpts = {}): Promise<Track[]> {
    const q = query.trim();
    if (!this.enabled || q.length < 3 || (page.offset ?? 0) > 0) return [];
    const [byName, byTag] = await Promise.all([
      this.stations({ name: q, limit: 15 }).catch(() => [] as Track[]),
      this.stations({ tag: q.toLowerCase(), limit: 15 }).catch(() => [] as Track[]),
    ]);
    return this.dedupe([byName, byTag], 12);
  }

  /** Radio is not a chart; Bollywood radio rows use getStations() instead. */
  async getTrending(_opts?: TrendingOpts): Promise<Track[]> {
    return [];
  }
  async getTrack(id: string): Promise<Track | null> {
    if (!UUID.test(id)) return null;
    const rows = await fetchJson<any[]>(`${API}/stations/byuuid/${id}`, { provider: this.id, limiter: this.limiter });
    return (Array.isArray(rows) ? rows : []).map(this.map).find((t): t is Track => !!t) ?? null;
  }
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
