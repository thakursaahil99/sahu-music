import { loadHomeSnapshot } from '@/lib/snapshot';
import { HomeView } from './HomeView';

/** Rendered once at build time: the first rows are written into the page (see lib/snapshot.ts). */
export default async function HomePage() {
  return <HomeView snapshot={await loadHomeSnapshot()} />;
}
