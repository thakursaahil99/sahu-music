import { describe, expect, it } from 'vitest';
import { CATEGORIES, formatCount, formatDuration, getCategory, isSafeId, isValidEmail, sanitizeQuery, validatePassword, validateTitle } from '../src';

describe('categories', () => {
  it('contains every required category', () => {
    const names = CATEGORIES.map((c) => c.name);
    for (const n of ['Hindi', 'Bollywood', 'Punjabi', 'Haryanvi', 'English', 'Old Hindi', '90s Classics', '2000s Hits', 'Romantic', 'Sad', 'Party', 'Devotional', 'Independent Artists']) {
      expect(names).toContain(n);
    }
  });

  it('has unique slugs and a live-data strategy for each', () => {
    expect(new Set(CATEGORIES.map((c) => c.slug)).size).toBe(CATEGORIES.length);
    expect(getCategory('devotional')?.strategy).toEqual({ kind: 'genre', genre: 'Devotional' });
    expect(getCategory('nope')).toBeUndefined();
  });
});

describe('validation', () => {
  it('sanitizes search input', () => {
    expect(sanitizeQuery('  hindi \n\t songs\u0000 ')).toBe('hindi songs');
    expect(sanitizeQuery('x'.repeat(200))).toHaveLength(80);
  });

  it('validates email, password, titles and ids', () => {
    expect(isValidEmail('a@b.co')).toBe(true);
    expect(isValidEmail('a@b')).toBe(false);
    expect(validatePassword('short1')).toBeTruthy();
    expect(validatePassword('longenough')).toBeTruthy();
    expect(validatePassword('longenough1')).toBeNull();
    expect(validateTitle('   ')).toBeTruthy();
    expect(validateTitle('My playlist')).toBeNull();
    expect(isSafeId('AbC_12-3')).toBe(true);
    expect(isSafeId('../x')).toBe(false);
    expect(isSafeId('')).toBe(false);
  });
});

describe('formatting', () => {
  it('formats durations and counts', () => {
    expect(formatDuration(0)).toBe('0:00');
    expect(formatDuration(65)).toBe('1:05');
    expect(formatDuration(3725)).toBe('1:02:05');
    expect(formatDuration(NaN)).toBe('0:00');
    expect(formatCount(999)).toBe('999');
    expect(formatCount(1500)).toBe('1.5K');
    expect(formatCount(2_000_000)).toBe('2M');
  });
});
