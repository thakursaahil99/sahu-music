/** Branding, categories and small utilities shared by web + admin. */

export const BRAND = {
  name: 'SAHU MUSIC',
  tagline: 'Har Gaana, Ek Jagah.',
  colors: {
    black: '#050505',
    charcoal: '#141414',
    charcoalLight: '#1E1E1E',
    gold: '#D7AE55',
    goldSoft: '#E8C97F',
    white: '#FFFFFF',
    muted: '#A3A3A3',
  },
} as const;

/**
 * How a category is filled from providers. Nothing is hard-coded:
 * - `genre`    → provider's own genre taxonomy (e.g. Audius "Devotional")
 * - `search`   → keyword search against the provider's live catalogue
 * - `trending` → the provider's trending chart
 * A category shows an empty state when the providers return nothing.
 */
export type CategoryStrategy =
  | { kind: 'genre'; genre: string }
  /** `years` = inclusive release-year range; only tracks with a known year in range are kept. */
  | { kind: 'search'; queries: string[]; years?: readonly [number, number] }
  | { kind: 'trending' }
  | { kind: 'radio'; tags: string[] }
  | { kind: 'youtube-chart' };

export interface Category {
  slug: string;
  name: string;
  blurb: string;
  /** two gradient stops for the tile */
  tint: [string, string];
  strategy: CategoryStrategy;
  /** Shown only when this provider is set up (e.g. YouTube needs an API key). */
  needs?: 'youtube';
}

export const CATEGORIES: Category[] = [
  // Every category is filled with COMPLETE songs from sources that authorise full streaming.
  // Queries were chosen by checking which ones return full-length playable tracks on Audius.
  { slug: 'bollywood-top', name: 'Bollywood Top Songs', blurb: 'Original film songs trending in India, in YouTube’s official player', tint: ['#B3122E', '#141414'], strategy: { kind: 'youtube-chart' }, needs: 'youtube' },
  { slug: 'bollywood-radio', name: 'Bollywood Radio', blurb: 'Live Bollywood stations playing full songs non-stop', tint: ['#7A1F5A', '#141414'], strategy: { kind: 'radio', tags: ['bollywood', 'hindi'] } },
  { slug: 'retro-radio', name: 'Retro Hindi Radio', blurb: 'Live stations for 90s and golden-era Hindi songs', tint: ['#5B3A12', '#141414'], strategy: { kind: 'radio', tags: ['bollywood 90s', 'retro bollywood', 'purane', 'old hindi', 'kishore', 'rafi', 'lata', 'mukesh'] } },
  { slug: 'bhakti-radio', name: 'Bhakti Radio', blurb: 'Live bhajan and devotional stations', tint: ['#8A5A0F', '#141414'], strategy: { kind: 'radio', tags: ['bhajan', 'devotional', 'hindu', 'bhakti'] } },
  { slug: 'hindi', name: 'Hindi', blurb: 'Hindi songs shared by independent creators', tint: ['#7A5A12', '#141414'], strategy: { kind: 'search', queries: ['hindi', 'hindi song'] } },
  { slug: 'bollywood', name: 'Bollywood', blurb: 'Bollywood-style originals, covers and remixes shared by their creators', tint: ['#7A1F3D', '#141414'], strategy: { kind: 'search', queries: ['bollywood', 'bollywood remix'] } },
  { slug: 'punjabi', name: 'Punjabi', blurb: 'Punjabi beats and bhangra', tint: ['#8A4B0F', '#141414'], strategy: { kind: 'search', queries: ['punjabi', 'bhangra'] } },
  { slug: 'haryanvi', name: 'Haryanvi', blurb: 'Haryanvi sounds', tint: ['#2F5D2A', '#141414'], strategy: { kind: 'search', queries: ['haryanvi'] } },
  { slug: 'english', name: 'English', blurb: 'Pop from around the world', tint: ['#1F3F7A', '#141414'], strategy: { kind: 'genre', genre: 'Pop' } },
  { slug: 'old-hindi', name: 'Old Hindi', blurb: 'Retro and classic Hindi flavours', tint: ['#5B4636', '#141414'], strategy: { kind: 'search', queries: ['old hindi', 'old hindi songs'] } },
  { slug: '90s-classics', name: '90s Classics', blurb: 'Tracks with the 90s sound', tint: ['#4A2B7A', '#141414'], strategy: { kind: 'search', queries: ['90s hindi', '90s'] } },
  { slug: '2000s-hits', name: '2000s Hits', blurb: 'Tracks with the 2000s sound', tint: ['#0F5B6B', '#141414'], strategy: { kind: 'search', queries: ['2000s'] } },
  { slug: 'romantic', name: 'Romantic', blurb: 'Love songs', tint: ['#8A1F4F', '#141414'], strategy: { kind: 'search', queries: ['romantic', 'love song'] } },
  { slug: 'sad', name: 'Sad', blurb: 'For the quiet hours', tint: ['#2B3A55', '#141414'], strategy: { kind: 'search', queries: ['sad'] } },
  { slug: 'party', name: 'Party', blurb: 'Turn it up', tint: ['#7A1F7A', '#141414'], strategy: { kind: 'search', queries: ['party'] } },
  { slug: 'devotional', name: 'Devotional', blurb: 'Bhajans, kirtan and spiritual music', tint: ['#8A6A0F', '#141414'], strategy: { kind: 'genre', genre: 'Devotional' } },
  { slug: 'lofi-hindi', name: 'Lo-fi Hindi', blurb: 'Slow, mellow Hindi lo-fi', tint: ['#1F5B4A', '#141414'], strategy: { kind: 'search', queries: ['lofi hindi'] } },
  { slug: 'ghazal-qawwali', name: 'Ghazal & Qawwali', blurb: 'Ghazals, qawwali and sufi sounds', tint: ['#7A3F12', '#141414'], strategy: { kind: 'search', queries: ['ghazal', 'qawwali'] } },
  { slug: 'independent-artists', name: 'Independent Artists', blurb: 'Trending right now from independent artists', tint: ['#D7AE55', '#141414'], strategy: { kind: 'trending' } },
];

export const getCategory = (slug: string): Category | undefined =>
  CATEGORIES.find((c) => c.slug === slug);

export function formatDuration(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return '0:00';
  const s = Math.floor(totalSeconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

export function formatCount(n: number | undefined | null): string {
  if (n == null) return '0';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
  return String(n);
}

/** Input validation helpers (used before anything reaches an API or the database). */
export function sanitizeQuery(input: string, maxLen = 80): string {
  return input
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen);
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) && email.length <= 254;
}

export function validatePassword(pw: string): string | null {
  if (pw.length < 8) return 'Password must be at least 8 characters.';
  if (pw.length > 72) return 'Password must be 72 characters or fewer.';
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) return 'Use at least one letter and one number.';
  return null;
}

export function validateTitle(title: string, maxLen = 80): string | null {
  const t = title.trim();
  if (!t) return 'Name is required.';
  if (t.length > maxLen) return `Name must be ${maxLen} characters or fewer.`;
  return null;
}

/** Only ids made of safe characters are ever interpolated into provider URLs. */
export function isSafeId(id: string | null | undefined): id is string {
  return !!id && /^[A-Za-z0-9_-]{1,64}$/.test(id);
}
