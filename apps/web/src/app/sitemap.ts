import type { MetadataRoute } from 'next';
import { CATEGORIES } from '@sahu/shared';

export const dynamic = 'force-static';

export default function sitemap(): MetadataRoute.Sitemap {
  const base = (process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000').replace(/\/$/, '');
  const pages = ['', 'explore', 'search', 'about', 'privacy', 'terms', ...CATEGORIES.map((c) => `genre/${c.slug}`)];
  return pages.map((p) => ({ url: `${base}/${p}${p ? '/' : ''}`, changeFrequency: p.startsWith('genre') || p === '' ? 'daily' : 'monthly' }));
}
