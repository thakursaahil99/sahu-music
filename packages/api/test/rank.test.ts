import { describe, expect, it } from 'vitest';
import type { Track } from '@sahu/models';
import { hindiFirst, isHindiLeaning, normalizeText, rankSearch } from '../src';

let n = 0;
const t = (title: string, over: Partial<Track> = {}): Track => ({
  provider: 'audius',
  providerTrackId: `id${++n}`,
  title,
  artist: 'Someone',
  artwork: null,
  streamUrl: 'https://api.audius.co/v1/tracks/x/stream',
  duration: 240,
  playCount: 100,
  rights: { status: 'approved', streamingPermitted: true, commercialUse: 'unconfirmed', advertising: 'unconfirmed', license: null, basis: 'test' },
  ...over,
});
const titles = (list: Track[]) => list.map((x) => x.title);

describe('search ranking', () => {
  it('puts the song whose full name was typed at the top, wherever the provider placed it', () => {
    const provider = [
      t('Hold Me Now'),
      t('Galaxy Lag Test'),
      t('Random EDM Banger', { playCount: 90_000 }),
      t('Lag Ja Gale'),
      t('Lag_Jaa_Gale_ke_Phir_Ye_Haseen_Raat'),
    ];
    const ranked = titles(rankSearch('lag ja gale', provider));
    expect(ranked[0]).toBe('Lag Ja Gale');
    expect(ranked[1]).toBe('Lag_Jaa_Gale_ke_Phir_Ye_Haseen_Raat'); // "jaa" matches "ja"
    expect(ranked).not.toContain('Random EDM Banger'); // unrelated fuzzy results are dropped
    expect(ranked).not.toContain('Hold Me Now');
  });

  it('does not treat short words as substrings of unrelated words', () => {
    const ranked = titles(rankSearch('kal ho na ho', [t('Hologram Nation Kalimba'), t('Kal Ho Na Ho')]));
    expect(ranked).toEqual(['Kal Ho Na Ho']);
  });

  it('ranks Hindi music ahead of an equally good non-Hindi match', () => {
    const ranked = titles(rankSearch('love song', [t('Love Song', { genre: 'Pop' }), t('Love Song', { tags: 'hindi,romantic', artist: 'Desi Artist' })]));
    expect(ranked.length).toBe(2);
    expect(rankSearch('love song', [t('Love Song', { genre: 'Pop' }), t('Love Song', { tags: 'hindi,romantic' })])[0].tags).toBe('hindi,romantic');
  });

  it('sinks ringtone-length clips below full songs', () => {
    const ranked = rankSearch('tum hi ho', [t('Tum Hi Ho', { duration: 28 }), t('Tum Hi Ho', { duration: 262 })]);
    expect(ranked[0].duration).toBe(262);
  });

  it('keeps the provider results when nothing matches the typed words', () => {
    expect(rankSearch('zzzz', [t('Alpha'), t('Beta')])).toHaveLength(2);
  });

  it('recognises Hindi / Indian music from tags, names and script', () => {
    expect(isHindiLeaning(t('Dil', { tags: 'Hindi,Bollywood' }))).toBe(true);
    expect(isHindiLeaning(t('तुम ही हो'))).toBe(true);
    expect(isHindiLeaning(t('Shayad', { artist: 'Arijit Singh cover' }))).toBe(true);
    expect(isHindiLeaning(t('Summer Nights', { genre: 'House' }))).toBe(false);
    expect(titles(hindiFirst([t('House Track'), t('Punjabi Beat')]))).toEqual(['Punjabi Beat', 'House Track']);
  });

  it('normalises punctuation and doubled letters', () => {
    expect(normalizeText('Lag_Jaa-Gale!!')).toBe('lag ja gale');
  });
});
