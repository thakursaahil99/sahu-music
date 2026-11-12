import { createMusicService } from '@sahu/api';
import { CATEGORIES, type Category } from '@sahu/shared';
import { env } from '@/lib/config';

/**
 * /category-art.json — one cover per category, picked from the category's own live songs while
 * the site is built. Category tiles read this file instead of asking the music servers from
 * every visitor's browser.
 */
export const dynamic = 'force-static';

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

export async function GET() {
  const art: Record<string, string> = {};
  // `next dev` would run this on every request; there the tiles simply show their colours.
  if (process.env.NODE_ENV === 'production' && !env.demoMode) {
    const music = createMusicService({ audiusAppName: env.audiusAppName, radio: env.radio, archive: false });
    const used = new Set<string>();
    const todo: Category[] = CATEGORIES.filter((c) => c.needs !== 'youtube');
    const covers = new Map<string, string[]>();
    // a few at a time: polite to the providers, and the build stays quick
    for (let i = 0; i < todo.length; i += 4) {
      await Promise.all(
        todo.slice(i, i + 4).map(async (c) => {
          const tracks = (await within(music.getCategoryTracks(c.strategy, { limit: 8 }), 20_000)) ?? [];
          covers.set(c.slug, tracks.map((t) => t.artwork).filter((u): u is string => !!u && u.startsWith('https://')));
        }),
      );
    }
    // in category order, preferring a cover no earlier tile uses, so neighbours look different
    for (const c of todo) {
      const list = covers.get(c.slug) ?? [];
      const url = list.find((u) => !used.has(u)) ?? list[0];
      if (url) {
        art[c.slug] = url;
        used.add(url);
      }
    }
  }
  return Response.json({ at: Date.now(), art });
}
