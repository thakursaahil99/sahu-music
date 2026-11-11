import type { Artist, Collection, PageOpts, Track } from '@sahu/models';
import { fetchJson, RateLimiter } from './http';
import type { MusicProvider, TrendingOpts } from './provider';
import { commercialUseFromLicense, evaluateRights } from './rights';

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Internet Archive (https://archive.org) – free, no key. Full-length audio files, including
 * Hindi songs, bhajans and old 78 rpm Indian records.
 *
 * Only items that carry an open licence (Creative Commons or public domain) are used, and only
 * when the item is not access-restricted. The licence is declared by the uploader, so the basis
 * says so and admins can block any item from the admin dashboard.
 */

const SEARCH = 'https://archive.org/advancedsearch.php';
const META = 'https://archive.org/metadata';
const ITEM_OK = /^[A-Za-z0-9._-]{1,100}$/;
const OPEN_LICENCE = /creativecommons\.org\/(licenses|publicdomain)\//i;
const ITEMS_PER_SEARCH = 6;
const FILES_PER_ITEM = 8;
const MAX_SECONDS = 25 * 60;

/** base64url so the id is safe in URLs and database keys. */
const encodeId = (s: string) => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const decodeId = (s: string) => {
  try {
    return decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/'))));
  } catch {
    return '';
  }
};

/** "285.64" or "04:45" → seconds. */
function seconds(len: unknown): number {
  if (typeof len !== 'string' && typeof len !== 'number') return 0;
  const s = String(len);
  if (s.includes(':')) return s.split(':').reduce((acc, p) => acc * 60 + (Number(p) || 0), 0);
  return Math.round(Number(s) || 0);
}

const text = (v: unknown): string => (Array.isArray(v) ? v.join(', ') : typeof v === 'string' ? v : '').trim();

export class ArchiveProvider implements MusicProvider {
  readonly id = 'archive' as const;
  readonly name = 'Internet Archive';
  readonly homepage = 'https://archive.org';
  readonly answerWithinMs = 4_500;
  private readonly limiter = new RateLimiter(12, 10_000);

  constructor(private readonly enabled = true) {}

  isConfigured(): boolean {
    return this.enabled;
  }

  private get<T>(url: string): Promise<T> {
    return fetchJson<T>(url, { provider: this.id, limiter: this.limiter, cacheTtlMs: 60 * 60_000, timeoutMs: 15_000, retries: 1 });
  }

  /** Tracks of one item (its original MP3 files), or [] when it has no open licence. */
  private async itemTracks(identifier: string): Promise<Track[]> {
    if (!ITEM_OK.test(identifier)) return [];
    const j = await this.get<any>(`${META}/${identifier}`);
    const md = j?.metadata ?? {};
    const licence = text(md.licenseurl);
    if (!OPEN_LICENCE.test(licence) || md['access-restricted-item'] === 'true' || md.mediatype !== 'audio') return [];
    const files: any[] = Array.isArray(j?.files) ? j.files : [];
    const mp3 = files.filter((f) => typeof f?.name === 'string' && /mp3/i.test(String(f.format ?? '')) && f.source === 'original');
    const pick = (mp3.length ? mp3 : files.filter((f) => typeof f?.name === 'string' && /mp3/i.test(String(f.format ?? '')))).slice(0, FILES_PER_ITEM);
    const album = text(md.title) || identifier;
    const creator = text(md.creator);
    const rights = (ok: boolean) =>
      evaluateRights({
        providerSaysStreamable: ok,
        restricted: false,
        license: licence,
        basis: `Uploaded to the Internet Archive with an open licence declared by the uploader (${licence}). Admins can block any item.`,
      });
    const seenTitles = new Set<string>();
    return pick
      .map((f): Track | null => {
        const duration = seconds(f.length);
        if (duration < 45 || duration > MAX_SECONDS) return null; // fragments, ringtones, hour-long recordings
        const r = rights(true);
        r.commercialUse = commercialUseFromLicense(licence);
        const title = (text(f.title) || String(f.name).replace(/\.[a-z0-9]+$/i, '').replace(/[_-]+/g, ' ')).replace(/\s+vbr$/i, '').trim();
        const titleKey = title.toLowerCase();
        if (!title || seenTitles.has(titleKey)) return null; // the same recording in another bitrate
        seenTitles.add(titleKey);
        // the item's creator is reliable; per-file "artist" tags are often junk, so they are a last resort
        const fileArtist = text(f.artist);
        const artist = creator && creator.toLowerCase() !== album.toLowerCase() ? creator : fileArtist && !/^(artist|unknown)/i.test(fileArtist) && fileArtist.toLowerCase() !== titleKey ? fileArtist : 'Internet Archive';
        return {
          provider: 'archive',
          providerTrackId: encodeId(`${identifier}/${f.name}`),
          title: title.slice(0, 160),
          artist: artist.slice(0, 80),
          artwork: `https://archive.org/services/img/${identifier}`,
          artworkLarge: `https://archive.org/services/img/${identifier}`,
          streamUrl: `https://archive.org/download/${identifier}/${String(f.name).split('/').map(encodeURIComponent).join('/')}`,
          duration,
          album,
          tags: text(md.subject).slice(0, 160) || null,
          year: Number(String(md.year ?? md.date ?? '').slice(0, 4)) || undefined,
          permalink: `https://archive.org/details/${identifier}`,
          rights: r,
        };
      })
      .filter((t): t is Track => !!t);
  }

  async searchTracks(query: string, page: PageOpts = {}): Promise<Track[]> {
    // Lucene syntax is not exposed to the listener: keep letters, digits and spaces only.
    const q = query.replace(/[^\p{L}\p{N} ]+/gu, ' ').replace(/\s+/g, ' ').trim();
    if (!this.enabled || q.length < 2) return [];
    const rows = Math.max(1, Math.round((page.limit ?? 20) / FILES_PER_ITEM)) || ITEMS_PER_SEARCH;
    const start = Math.floor((page.offset ?? 0) / FILES_PER_ITEM);
    const lucene = `(title:(${q}) OR subject:(${q}) OR creator:(${q})) AND mediatype:audio AND licenseurl:*creativecommons.org*`;
    const params = [
      `q=${encodeURIComponent(lucene)}`,
      'fl[]=identifier',
      `rows=${Math.min(rows, ITEMS_PER_SEARCH)}`,
      `start=${start}`,
      'sort[]=downloads+desc',
      'output=json',
    ].join('&');
    const j = await this.get<any>(`${SEARCH}?${params}`);
    const ids: string[] = (j?.response?.docs ?? []).map((d: any) => String(d?.identifier ?? '')).filter((id: string) => ITEM_OK.test(id));
    const lists = await Promise.all(ids.map((id) => this.itemTracks(id).catch(() => [] as Track[])));
    return lists.flat();
  }

  async getTrack(id: string): Promise<Track | null> {
    const [identifier] = decodeId(id).split('/');
    if (!identifier) return null;
    return (await this.itemTracks(identifier)).find((t) => t.providerTrackId === id) ?? null;
  }

  /** No chart: the Archive is used for searches and Hindi category rows. */
  async getTrending(_opts?: TrendingOpts): Promise<Track[]> {
    return [];
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
