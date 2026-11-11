import type { Artist, Collection, PageOpts, ProviderId, Track } from '@sahu/models';

export interface TrendingOpts extends PageOpts {
  genre?: string;
  time?: 'week' | 'month' | 'year' | 'allTime';
}

/**
 * Common interface every music source implements.
 * Add a provider by implementing this and registering it in `createMusicService`.
 * Providers must only return data from legitimately free, authorised APIs –
 * never scrape Spotify, YouTube, JioSaavn or similar. (YouTube is used only through its
 * official Data API and official embedded player.)
 */
export interface MusicProvider {
  readonly id: ProviderId;
  readonly name: string;
  /** Website for attribution. */
  readonly homepage: string;
  /** False when required credentials are missing. */
  isConfigured(): boolean;
  /** Shown to the user/admin when `isConfigured()` is false. */
  readonly configHint?: string;
  /**
   * Searches cost a limited daily quota (YouTube): only searches the listener typed are sent,
   * never the automatic searches that fill category rows.
   */
  readonly onDemandSearch?: boolean;
  /**
   * Longest time (ms) the app waits for this provider before showing the other providers'
   * results. The request keeps running and its (cached) answer is used next time.
   */
  readonly answerWithinMs?: number;

  searchTracks(query: string, page?: PageOpts): Promise<Track[]>;
  searchArtists(query: string, page?: PageOpts): Promise<Artist[]>;
  searchCollections(query: string, page?: PageOpts): Promise<Collection[]>;

  getTrending(opts?: TrendingOpts): Promise<Track[]>;
  getTrendingCollections(page?: PageOpts): Promise<Collection[]>;

  getTrack(id: string): Promise<Track | null>;
  getArtist(id: string): Promise<Artist | null>;
  getArtistTracks(id: string, page?: PageOpts): Promise<Track[]>;
  getArtistAlbums(id: string, page?: PageOpts): Promise<Collection[]>;
  /** Playlist or album, with its tracks. */
  getCollection(id: string): Promise<Collection | null>;

  getGenres(): Promise<string[]>;
}
