import type { Artist, Collection, Track } from '@sahu/models';
import type { MusicProvider } from './provider';

/**
 * DEMO PROVIDER – original sample audio.
 *
 * Used only when the live catalogue is unreachable or NEXT_PUBLIC_DEMO_MODE=true.
 * The audio is synthesized on the device from the note sequences below (simple
 * sine/triangle tones written for this project, released as CC0). Nothing here
 * imitates or contains third-party music, and every item is labelled "Demo".
 */

const SAMPLE_RATE = 16_000;

interface DemoSong {
  id: string;
  title: string;
  bpm: number;
  /** semitone offsets from the root; null = rest */
  notes: (number | null)[];
  root: number;
  wave: 'sine' | 'triangle';
  hue: string;
}

const SONGS: DemoSong[] = [
  { id: 'demo-1', title: 'Demo Tone – Subah (Morning Sketch)', bpm: 96, root: 261.63, wave: 'sine', hue: '#D7AE55',
    notes: [0, 2, 4, 7, 9, 7, 4, 2, 0, null, 4, 7, 9, 12, 9, 7, 4, 2, 4, null, 7, 9, 7, 4, 2, 0, 2, 4, 0, null, 0, null] },
  { id: 'demo-2', title: 'Demo Tone – Shaam (Evening Sketch)', bpm: 72, root: 220.0, wave: 'triangle', hue: '#B9783F',
    notes: [0, 3, 5, 7, 10, 7, 5, 3, 0, null, 7, 10, 12, 10, 7, 5, 3, 5, 7, null, 3, 0, 3, 5, 3, 0, -2, 0, null, 0, null, null] },
  { id: 'demo-3', title: 'Demo Tone – Raat (Night Sketch)', bpm: 120, root: 196.0, wave: 'sine', hue: '#7C6AD9',
    notes: [0, 7, 12, 7, 0, 7, 12, 14, 12, 7, 5, 7, 0, null, 5, 12, 17, 12, 5, 12, 17, 19, 17, 12, 10, 12, 5, null, 0, 7, 12, null] },
];

export function synthWav(song: Pick<DemoSong, 'bpm' | 'notes' | 'root' | 'wave'>, repeats = 2): Uint8Array {
  const beat = 60 / song.bpm / 2; // eighth notes
  const perNote = Math.floor(beat * SAMPLE_RATE);
  const total = perNote * song.notes.length * repeats;
  const pcm = new Int16Array(total);
  for (let r = 0; r < repeats; r++) {
    song.notes.forEach((n, i) => {
      if (n === null) return;
      const freq = song.root * 2 ** (n / 12);
      const start = (r * song.notes.length + i) * perNote;
      const len = Math.floor(perNote * 1.6); // let notes ring into the next
      for (let s = 0; s < len && start + s < total; s++) {
        const t = s / SAMPLE_RATE;
        const env = Math.min(1, s / 200) * Math.exp(-3.2 * t);
        const ph = 2 * Math.PI * freq * t;
        const base = song.wave === 'sine' ? Math.sin(ph) : (2 / Math.PI) * Math.asin(Math.sin(ph));
        const v = (base + 0.3 * Math.sin(2 * ph) + 0.25 * Math.sin(ph / 2)) * env * 0.42;
        const idx = start + s;
        pcm[idx] = Math.max(-32767, Math.min(32767, pcm[idx] + Math.round(v * 32767)));
      }
    });
  }
  const bytes = new Uint8Array(44 + pcm.length * 2);
  const dv = new DataView(bytes.buffer);
  const str = (o: number, s: string) => [...s].forEach((c, i) => dv.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF');
  dv.setUint32(4, 36 + pcm.length * 2, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  dv.setUint32(16, 16, true);
  dv.setUint16(20, 1, true); // PCM
  dv.setUint16(22, 1, true); // mono
  dv.setUint32(24, SAMPLE_RATE, true);
  dv.setUint32(28, SAMPLE_RATE * 2, true);
  dv.setUint16(32, 2, true);
  dv.setUint16(34, 16, true);
  str(36, 'data');
  dv.setUint32(40, pcm.length * 2, true);
  for (let i = 0; i < pcm.length; i++) dv.setInt16(44 + i * 2, pcm[i], true);
  return bytes;
}

function demoArtwork(hue: string): string {
  const bars = [60, 110, 170, 120, 200, 140, 90, 150, 70]
    .map((h, i) => `<rect x="${70 + i * 42}" y="${256 - h / 2}" width="22" height="${h}" rx="11" fill="${hue}"/>`)
    .join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" fill="#141414"/>${bars}<text x="256" y="470" font-family="Arial,sans-serif" font-size="30" fill="#A3A3A3" text-anchor="middle">SAHU MUSIC DEMO</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export class DemoProvider implements MusicProvider {
  readonly id = 'demo' as const;
  readonly name = 'SAHU MUSIC Demo';
  readonly homepage = '';
  private cache: Track[] | null = null;

  isConfigured(): boolean {
    return true;
  }

  private all(): Track[] {
    if (this.cache) return this.cache;
    const canBlob = typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function' && typeof Blob !== 'undefined';
    this.cache = SONGS.map((s) => {
      const wav = synthWav(s);
      const streamUrl = canBlob ? URL.createObjectURL(new Blob([wav as BlobPart], { type: 'audio/wav' })) : '';
      const art = demoArtwork(s.hue);
      return {
        provider: 'demo',
        providerTrackId: s.id,
        title: s.title,
        artist: 'SAHU MUSIC Demo',
        artistId: 'sahu-demo',
        artwork: art,
        artworkLarge: art,
        streamUrl,
        duration: Math.round((wav.length - 44) / 2 / SAMPLE_RATE),
        genre: 'Demo',
        rights: {
          status: 'approved',
          streamingPermitted: true,
          commercialUse: 'allowed',
          advertising: 'allowed',
          license: 'CC0 1.0 (original SAHU MUSIC sample audio)',
          basis: 'Original audio synthesized by the SAHU MUSIC app itself; owned by the project and released as CC0.',
        },
      } satisfies Track;
    });
    return this.cache;
  }

  private artist(): Artist {
    return {
      provider: 'demo',
      providerArtistId: 'sahu-demo',
      name: 'SAHU MUSIC Demo',
      image: demoArtwork('#D7AE55'),
      bio: 'Original synthesized sample tones used when the live catalogue is unavailable.',
      trackCount: SONGS.length,
    };
  }

  private collection(withTracks: boolean): Collection {
    return {
      provider: 'demo',
      providerCollectionId: 'demo-playlist',
      kind: 'playlist',
      title: 'Demo Mode Samples',
      description: 'Original sample audio bundled with SAHU MUSIC.',
      artwork: demoArtwork('#D7AE55'),
      ownerName: 'SAHU MUSIC Demo',
      ownerId: 'sahu-demo',
      trackCount: SONGS.length,
      tracks: withTracks ? this.all() : undefined,
    };
  }

  async searchTracks(query: string): Promise<Track[]> {
    const q = query.toLowerCase();
    return this.all().filter((t) => t.title.toLowerCase().includes(q) || 'demo'.includes(q));
  }
  async searchArtists(): Promise<Artist[]> {
    return [this.artist()];
  }
  async searchCollections(): Promise<Collection[]> {
    return [this.collection(false)];
  }
  async getTrending(): Promise<Track[]> {
    return this.all();
  }
  async getTrendingCollections(): Promise<Collection[]> {
    return [this.collection(false)];
  }
  async getTrack(id: string): Promise<Track | null> {
    return this.all().find((t) => t.providerTrackId === id) ?? null;
  }
  async getArtist(): Promise<Artist | null> {
    return this.artist();
  }
  async getArtistTracks(): Promise<Track[]> {
    return this.all();
  }
  async getArtistAlbums(): Promise<Collection[]> {
    return [];
  }
  async getCollection(): Promise<Collection | null> {
    return this.collection(true);
  }
  async getGenres(): Promise<string[]> {
    return ['Demo'];
  }
}
