import { createMusicService } from '@sahu/api';
import type { Collection, Track } from '@sahu/models';
import { getCategory } from '@sahu/shared';
import { env } from './config';

/**
 * The home page's first rows, fetched once while the site is built and written into the page
 * itself. A visitor sees songs the moment the page appears instead of waiting for the music
 * servers; the rows are then refreshed in the background (see `useAsync`).
 */
export interface HomeSnapshot {
  at: number;
  hits: Track[];
  playlists: Collection[];
  radio: Track[];
}

/** Resolve with null after `ms` (and leave no timer behind to hold up the build). */
function within<T>(work: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), ms);
    work.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      () => {
        clearTimeout(timer);
        resolve(null);
      },
    );
  });
}

export async function loadHomeSnapshot(): Promise<HomeSnapshot | null> {
  // `next dev` renders the page on every request: no snapshot there, it would slow every reload.
  if (process.env.NODE_ENV !== 'production' || env.demoMode) return null;
  const music = createMusicService({
    audiusAppName: env.audiusAppName,
    jamendoClientId: env.jamendoClientId || undefined,
    radio: env.radio,
    archive: false,
  });
  const radioRow = getCategory('bollywood-radio');
  const [hits, playlists, radio] = await Promise.all([
    within(music.getHindiHits(20), 20_000),
    within(music.getTrendingCollections({ limit: 12 }), 20_000),
    radioRow ? within(music.getCategoryTracks(radioRow.strategy, { limit: 12 }), 20_000) : Promise.resolve(null),
  ]);
  // never bake the offline demo tracks into the page
  if (music.isDemoMode() || !hits?.length) return null;
  return { at: Date.now(), hits, playlists: playlists ?? [], radio: radio ?? [] };
}
