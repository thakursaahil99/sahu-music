import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CATEGORIES, getCategory } from '@sahu/shared';
import { getCatalogue } from '@/lib/catalogue-build';
import { GenreView } from './GenreView';

export function generateStaticParams() {
  return CATEGORIES.map((c) => ({ slug: c.slug }));
}

export const dynamicParams = false;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const cat = getCategory(slug);
  return cat ? { title: `${cat.name} songs`, description: `${cat.blurb}. Stream free on SAHU MUSIC.` } : {};
}

export default async function GenrePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!getCategory(slug)) notFound();
  const catalogue = await getCatalogue();
  const first = catalogue?.rows[slug];
  return <GenreView slug={slug} initial={first?.length ? { at: catalogue!.at, items: first } : null} />;
}
