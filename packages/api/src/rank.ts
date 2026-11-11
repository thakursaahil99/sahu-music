import type { Track } from '@sahu/models';

/**
 * SEARCH RANKING
 *
 * Providers return fuzzy matches in a weak order (the song whose name was typed in full
 * can sit at position 40). We re-rank a larger pool of results ourselves:
 *   1. how well the title matches what the listener typed (exact > starts with > contains > words)
 *   2. Hindi / Indian music first – SAHU MUSIC's audience
 *   3. popularity
 *   4. very short uploads (ringtone-length clips) sink to the bottom
 * Results that match none of the typed words are dropped when better ones exist.
 */

const INDIC_SCRIPT = /[ऀ-ॿ਀-੿]/; // Devanagari, Gurmukhi

const HINDI_TERMS = new Set([
  'hindi', 'bollywood', 'punjabi', 'desi', 'india', 'indian', 'haryanvi', 'bhojpuri', 'urdu', 'ghazal', 'bhajan', 'qawwali', 'qawali',
  'sufi', 'filmi', 'hindustani', 'rajasthani', 'marathi', 'gujarati', 'bhangra', 'kirtan', 'aarti', 'mantra', 'chalisa', 'bhakti',
  'arijit', 'shreya', 'kishore', 'lata', 'rafi', 'atif', 'jubin', 'badshah', 'diljit', 'sidhu', 'udit', 'sanu', 'alka', 'sonu', 'neha',
  'kakkar', 'ghoshal', 'mangeshkar', 'nigam', 'pritam', 'rahman', 'hindisong', 'hindisongs', 'bollywoodsongs', 'lofihindi',
]);

/** Lower-case, strip punctuation, and fold doubled letters so "jaa" matches "ja" and "naa" matches "na". */
export function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/(\p{L})\1+/gu, '$1')
    .trim();
}

const tokens = (s: string): string[] => normalizeText(s).split(' ').filter(Boolean);

/** A typed word matches a token exactly, or as a prefix once it is long enough to be meaningful. */
function wordHits(word: string, bag: readonly string[]): boolean {
  return bag.some((t) => t === word || (word.length >= 4 && t.startsWith(word)) || (t.length >= 5 && word.length >= 5 && word.startsWith(t)));
}

export function isHindiLeaning(t: Track): boolean {
  const text = `${t.title} ${t.artist} ${t.album ?? ''} ${t.tags ?? ''} ${t.genre ?? ''}`;
  if (INDIC_SCRIPT.test(text)) return true;
  return tokens(text).some((w) => HINDI_TERMS.has(w));
}

export interface SearchScore {
  score: number;
  /** Share of the typed words found in the title, artist, album or tags (0–1). */
  matched: number;
}

export function scoreSearch(query: string, t: Track): SearchScore {
  const q = normalizeText(query);
  const words = q.split(' ').filter(Boolean);
  if (words.length === 0) return { score: 0, matched: 0 };

  const title = normalizeText(t.title);
  const titleBag = title.split(' ').filter(Boolean);
  const allBag = tokens(`${t.title} ${t.artist} ${t.album ?? ''} ${t.tags ?? ''}`);
  const inTitle = words.filter((w) => wordHits(w, titleBag)).length / words.length;
  const matched = words.filter((w) => wordHits(w, allBag)).length / words.length;

  let score = 0;
  if (title === q) score += 120;
  else if (title.startsWith(`${q} `)) score += 95;
  else if (` ${title} `.includes(` ${q} `)) score += 80;
  score += 60 * inTitle + 30 * matched;
  if (matched === 1) score += 25;
  if (isHindiLeaning(t)) score += 20;
  if (t.official) score += 30; // the label's or artist's own upload: the original song
  score += Math.min(20, Math.log10((t.playCount ?? 0) + 1) * 4);
  if (t.duration > 0 && t.duration < 45) score -= 50; // ringtone-length clip, not a song
  else if (t.duration > 0 && t.duration < 60) score -= 15;
  return { score, matched };
}

/** Best matches first; unrelated fuzzy results are removed when real matches exist. */
export function rankSearch(query: string, tracks: Track[]): Track[] {
  const scored = tracks.map((track, i) => ({ track, i, ...scoreSearch(query, track) }));
  const best = Math.max(0, ...scored.map((s) => s.matched));
  const keep = best >= 1 ? scored.filter((s) => s.matched >= 0.5) : best > 0 ? scored.filter((s) => s.matched > 0) : scored;
  return keep.sort((a, b) => b.score - a.score || a.i - b.i).map((s) => s.track);
}

/** Hindi / Indian tracks first, otherwise keeping the provider's order (used for charts). */
export function hindiFirst(tracks: Track[]): Track[] {
  return [...tracks.filter(isHindiLeaning), ...tracks.filter((t) => !isHindiLeaning(t))];
}
