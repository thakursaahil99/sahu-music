/** Shared domain models for every SAHU MUSIC platform. */

export type ProviderId = 'audius' | 'jamendo' | 'itunes' | 'youtube' | 'radio' | 'archive' | 'demo' | 'catalogue';

/** Display names (the raw id is not always presentable, e.g. `itunes`). */
export const PROVIDER_NAMES: Record<ProviderId, string> = {
  audius: 'Audius',
  jamendo: 'Jamendo',
  itunes: 'Apple Music',
  youtube: 'YouTube',
  radio: 'Live radio',
  archive: 'Internet Archive',
  demo: 'SAHU MUSIC demo',
  catalogue: 'SAHU MUSIC',
};
export const providerName = (id: string): string => PROVIDER_NAMES[id as ProviderId] ?? id;

/** Result of rights verification for a single track. */
export type RightsStatus = 'approved' | 'pending' | 'rejected' | 'blocked';

/** Tri-state permission. `unconfirmed` is never treated as permission. */
export type Permission = 'allowed' | 'not_allowed' | 'unconfirmed';

export interface TrackRights {
  status: RightsStatus;
  /** True only when the provider explicitly confirms the track may be streamed. */
  streamingPermitted: boolean;
  commercialUse: Permission;
  advertising: Permission;
  /** Licence string as reported by the provider, if any. */
  license: string | null;
  /** Human readable reason for the decision (shown in admin + track info). */
  basis: string;
}

export interface Track {
  provider: ProviderId;
  providerTrackId: string;
  title: string;
  artist: string;
  artistId?: string;
  artwork: string | null;
  artworkLarge?: string | null;
  /**
   * Other servers holding the same cover (origins, e.g. "https://node.example"). The cover's path
   * is the same on each; the app tries them in order when the main one fails.
   */
  artworkMirrors?: string[];
  streamUrl: string;
  /** seconds (for a preview clip: the length of the clip, not of the full song) */
  duration: number;
  /**
   * True when `streamUrl` is a short promotional preview clip, not the full song
   * (label-owned music that cannot be streamed in full for free).
   */
  preview?: boolean;
  /** A live radio stream: no fixed length, cannot be seeked, never ends by itself. */
  live?: boolean;
  /**
   * Played in the provider's official embedded VIDEO player (YouTube). The player must stay
   * visible and stops when the app is in the background, as the provider's terms require.
   */
  video?: boolean;
  /** From the artist's or label's own official channel. */
  official?: boolean;
  /** Album / film soundtrack the track belongs to. */
  album?: string | null;
  /** Release year, when the provider reports one. */
  year?: number;
  genre?: string | null;
  mood?: string | null;
  /** Uploader's tags (comma separated), used to rank search results. */
  tags?: string | null;
  playCount?: number;
  /** Link to the track on the provider's own site (attribution). */
  permalink?: string | null;
  rights: TrackRights;
}

export interface Artist {
  provider: ProviderId;
  providerArtistId: string;
  name: string;
  handle?: string;
  image: string | null;
  cover?: string | null;
  bio?: string | null;
  followerCount?: number;
  trackCount?: number;
  verified?: boolean;
  permalink?: string | null;
}

export interface Collection {
  provider: ProviderId;
  providerCollectionId: string;
  kind: 'playlist' | 'album';
  title: string;
  description?: string | null;
  artwork: string | null;
  /** Other servers holding the same cover (see Track.artworkMirrors). */
  artworkMirrors?: string[];
  ownerName: string;
  ownerId?: string;
  trackCount: number;
  tracks?: Track[];
  permalink?: string | null;
}

export interface PageOpts {
  limit?: number;
  offset?: number;
  /** Ask only for the most played results (providers that can sort by plays; others ignore it). */
  sort?: 'popular';
}

/** A playlist owned by a SAHU MUSIC user (local guest storage or Supabase). */
export interface UserPlaylist {
  id: string;
  title: string;
  description?: string;
  isPublic: boolean;
  tracks: Track[];
  createdAt: string;
}

export interface HistoryEntry {
  track: Track;
  playedAt: string;
}

export const trackKey = (t: Pick<Track, 'provider' | 'providerTrackId'>): string =>
  `${t.provider}:${t.providerTrackId}`;
