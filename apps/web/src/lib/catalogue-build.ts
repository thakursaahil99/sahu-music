import { createMusicService } from '@sahu/api';
import type { Collection, Track } from '@sahu/models';
import { CATEGORIES } from '@sahu/shared';
import { env } from './config';

/**
 * Everything the browse pages show first, fetched ONCE while the site is built and written
 * into the pages themselves: the home rows, every category's first page, the Explore chart,
 * trending playlists and the category covers. A visitor sees music the moment a page appears
 * and scrolling never waits for the music servers. Pages refresh it in the background when it
 * is old (see `useAsync` / `usePaged`).
 *
 * Server-only (imported from server components and the root layout).
 */
export interface Catalogue {
  at: number;
  hits: Track[];
  playlists: Collection[];
  /** Explore: this week's chart, all genres. */
  chart: Track[];
  /** First page (ROW_SIZE songs) of every category, by slug. */
  rows: Record<string, Track[]>;
  /** One cover per category, by slug, different for neighbouring tiles. */
  art: Record<string, string>;
}

/** Same as the genre page's page size, so "Load more" continues where the built page ends. */
export const ROW_SIZE = 20;

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

async function build(): Promise<Catalogue | null> {
  if (env.demoMode) return null;
  const music = createMusicService({
    audiusAppName: env.audiusAppName,
    jamendoClientId: env.jamendoClientId || undefined,
    radio: env.radio,
    archive: env.archive,
    patient: true,
  });
  const [hits, playlists, chart] = await Promise.all([
    within(music.getHindiHits(20), 90_000),
    within(music.getTrendingCollections({ limit: 12 }), 90_000),
    within(music.getTrending({ time: 'week', limit: ROW_SIZE, offset: 0 }), 90_000),
  ]);
  // never bake the offline demo tracks into the site
  if (music.isDemoMode() || !hits?.length) return null;

  const rows: Record<string, Track[]> = {};
  const todo = CATEGORIES.filter((c) => c.needs !== 'youtube');
  // a few at a time: polite to the providers, and the build stays quick
  for (let i = 0; i < todo.length; i += 4) {
    await Promise.all(
      todo.slice(i, i + 4).map(async (c) => {
        const tracks = await within(music.getCategoryTracks(c.strategy, { limit: ROW_SIZE, offset: 0 }), 90_000);
        if (tracks?.length) rows[c.slug] = tracks;
      }),
    );
  }

  // Covers live on many volunteer-run servers; some are slow or down. Measure each server once
  // and serve every built-in cover from the fastest one that holds it.
  const everything: Array<Track | Collection> = [...hits, ...(playlists ?? []), ...(chart ?? []), ...Object.values(rows).flat()];
  const speed = await measureCoverServers(everything);
  const fast = <T extends Track | Collection>(x: T): T => fastestCover(x, speed);
  const fastRows: Record<string, Track[]> = {};
  for (const [slug, list] of Object.entries(rows)) fastRows[slug] = list.map(fast);

  // In category order, preferring a cover no earlier tile uses (neighbours look different) and
  // that really loads: a tile never shows a broken photo.
  const art: Record<string, string> = {};
  const used = new Set<string>();
  for (const c of todo) {
    const covers = [...new Set((fastRows[c.slug] ?? []).map((t) => t.artwork).filter((u): u is string => !!u && u.startsWith('https://')))];
    const ordered = [...covers.filter((u) => !used.has(u)), ...covers.filter((u) => used.has(u))].slice(0, 6);
    for (const url of ordered) {
      if ((await probeImage(url, 3_000)) === null) continue;
      art[c.slug] = url;
      used.add(url);
      break;
    }
  }
  return { at: Date.now(), hits: hits.map(fast), playlists: (playlists ?? []).map(fast), chart: (chart ?? []).map(fast), rows: fastRows, art };
}

/** Milliseconds until `url` answers with an image, or null when it fails or takes longer than `ms`. */
async function probeImage(url: string, ms = 4_000): Promise<number | null> {
  const started = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    const ms = Date.now() - started;
    const ok = res.ok && /^image\//.test(res.headers.get('content-type') ?? '');
    // read the (small) image to the end: the build's fetch cache expects complete answers
    await res.arrayBuffer();
    return ok ? ms : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

const originOf = (url: string): string => {
  try {
    return new URL(url).origin;
  } catch {
    return '';
  }
};
const onServer = (url: string, origin: string): string => {
  try {
    const u = new URL(url);
    return `${origin}${u.pathname}${u.search}`;
  } catch {
    return url;
  }
};
const smallCover = (url: string) => url.replace(/(480x480|1000x1000)(\.jpg)/, '150x150$2');

/** One small test image per cover server (a cover that server really holds); time to answer. */
async function measureCoverServers(items: Array<Track | Collection>): Promise<Map<string, number>> {
  const sample = new Map<string, string>();
  for (const x of items) {
    if (!x.artwork?.startsWith('https://')) continue;
    const main = originOf(x.artwork);
    if (main && !sample.has(main)) sample.set(main, smallCover(x.artwork));
    for (const m of x.artworkMirrors ?? []) if (!sample.has(m)) sample.set(m, smallCover(onServer(x.artwork, m)));
  }
  const speed = new Map<string, number>();
  const list = [...sample];
  for (let i = 0; i < list.length; i += 8) {
    await Promise.all(
      list.slice(i, i + 8).map(async ([origin, url]) => {
        speed.set(origin, (await probeImage(url)) ?? Number.POSITIVE_INFINITY);
      }),
    );
  }
  return speed;
}

/** The same item with its cover served from the fastest working server that holds it. */
function fastestCover<T extends Track | Collection>(x: T, speed: Map<string, number>): T {
  if (!x.artwork || !x.artworkMirrors?.length) return x;
  const main = originOf(x.artwork);
  const servers = [main, ...x.artworkMirrors];
  const best = servers.filter((s) => Number.isFinite(speed.get(s) ?? Number.POSITIVE_INFINITY)).sort((a, b) => speed.get(a)! - speed.get(b)!)[0];
  if (!best || best === main) return x;
  const out = { ...x, artwork: onServer(x.artwork, best), artworkMirrors: servers.filter((s) => s !== best) };
  if ('artworkLarge' in x && x.artworkLarge) (out as Track).artworkLarge = onServer(x.artworkLarge, best);
  return out;
}

/** Kept on globalThis so every page of one build (and dev reloads) share a single fetch. */
const holder = ((globalThis as Record<symbol, unknown>)[Symbol.for('sahu.catalogue')] ??= {}) as {
  job?: Promise<Catalogue | null>;
  value?: Catalogue | null;
  at?: number;
};

export function getCatalogue(): Promise<Catalogue | null> {
  if (process.env.NODE_ENV === 'production') {
    holder.job ??= (async () => {
      // one more try after a pause: a busy music server should not leave the site without music
      for (let attempt = 1; attempt <= 2; attempt++) {
        const started = Date.now();
        const c = await build().catch(() => null);
        if (c) {
          const songs = c.hits.length + c.chart.length + Object.values(c.rows).reduce((n, r) => n + r.length, 0);
          console.log(`[catalogue] ${songs} songs, ${Object.keys(c.rows).length} categories, ${Object.keys(c.art).length} covers in ${Math.round((Date.now() - started) / 1000)} s`);
          return c;
        }
        console.warn(`[catalogue] attempt ${attempt} got no music from the providers${attempt === 1 ? '; trying again' : '; pages will load their music in the browser'}`);
        if (attempt === 1) await new Promise((r) => setTimeout(r, 10_000));
      }
      return null;
    })();
    return holder.job;
  }
  // `next dev`: never make a page wait. Fetch in the background (at most every 30 minutes);
  // pages get it from the next reload on.
  if (!holder.job && (!holder.at || Date.now() - holder.at > 30 * 60_000)) {
    holder.job = build()
      .catch(() => null)
      .then((v) => {
        holder.value = v ?? holder.value ?? null;
        holder.at = Date.now();
        holder.job = undefined;
        return v;
      });
  }
  return Promise.resolve(holder.value ?? null);
}
