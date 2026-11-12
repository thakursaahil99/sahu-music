import type { Metadata } from 'next';
import { getCatalogue } from '@/lib/catalogue-build';
import { ExploreView } from './ExploreView';

export const metadata: Metadata = {
  title: 'Explore',
  description: 'Categories, live charts and trending playlists on SAHU MUSIC.',
};

/** Rendered once at build time: this week's chart and the playlists are written into the page. */
export default async function ExplorePage() {
  const c = await getCatalogue();
  return <ExploreView built={c ? { at: c.at, chart: c.chart, playlists: c.playlists } : null} />;
}
