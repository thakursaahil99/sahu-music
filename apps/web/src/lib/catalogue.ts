import type { Permission, ProviderId, Track } from '@sahu/models';
import { api } from './backend';

/** A row of the public_songs view. */
interface PublicSong {
  provider: string;
  provider_track_id: string;
  title: string;
  artist_name: string | null;
  provider_artist_id: string | null;
  artwork_url: string | null;
  stream_url: string;
  duration: number | null;
  genre: string | null;
  permalink: string | null;
  commercial_use: string | null;
  advertising: string | null;
  license: string | null;
  evidence: string | null;
}

/**
 * Admin-verified catalogue ("Verified by SAHU MUSIC").
 * The backend reads the `public_songs` view, which only exposes songs whose rights record
 * is approved with streaming permission – enforced in the database by a trigger.
 */
export async function fetchVerifiedSongs(limit = 20): Promise<Track[]> {
  let data: PublicSong[];
  try {
    data = (await api<{ songs: PublicSong[] }>('GET', `catalogue?limit=${limit}`)).songs;
  } catch {
    return [];
  }
  return data
    .filter((r) => typeof r.stream_url === 'string' && r.stream_url.startsWith('https://'))
    .map((r) => ({
      provider: r.provider as ProviderId,
      providerTrackId: String(r.provider_track_id),
      title: String(r.title),
      artist: String(r.artist_name ?? 'Unknown artist'),
      artistId: r.provider_artist_id ?? undefined,
      artwork: r.artwork_url ?? null,
      artworkLarge: r.artwork_url ?? null,
      streamUrl: r.stream_url as string,
      duration: Number(r.duration) || 0,
      genre: r.genre ?? null,
      permalink: r.permalink ?? null,
      rights: {
        status: 'approved' as const,
        streamingPermitted: true,
        commercialUse: (r.commercial_use ?? 'unconfirmed') as Permission,
        advertising: (r.advertising ?? 'unconfirmed') as Permission,
        license: r.license ?? null,
        basis: r.evidence || 'Rights verified by a SAHU MUSIC administrator.',
      },
    }));
}
