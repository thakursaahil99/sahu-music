import type { Collection, Track } from '@sahu/models';
import { getCatalogue } from './catalogue-build';
import { HOME_RADIO_ROW, HOME_ROW_SIZE, HOME_ROWS } from './home-rows';

/**
 * The home page's rows, written into the page when the site is built (see catalogue-build.ts).
 * A visitor sees songs the moment the page appears; scrolling never waits for a row.
 */
export interface HomeSnapshot {
  at: number;
  hits: Track[];
  playlists: Collection[];
  rows: Record<string, Track[]>;
}

export async function loadHomeSnapshot(): Promise<HomeSnapshot | null> {
  const c = await getCatalogue();
  if (!c) return null;
  const rows: Record<string, Track[]> = {};
  for (const slug of [HOME_RADIO_ROW, ...HOME_ROWS]) if (c.rows[slug]?.length) rows[slug] = c.rows[slug].slice(0, HOME_ROW_SIZE);
  return { at: c.at, hits: c.hits, playlists: c.playlists, rows };
}
