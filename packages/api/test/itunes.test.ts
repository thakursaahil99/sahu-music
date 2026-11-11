import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearApiCache, createMusicService, ItunesProvider } from '../src';

const PREVIEW = 'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview/v4/aa/bb/clip.plus.aac.p.m4a';

const song = (id: number, over: Record<string, unknown> = {}) => ({
  wrapperType: 'track',
  kind: 'song',
  trackId: id,
  trackName: `Song ${id}`,
  artistName: 'Kumar Sanu',
  artistId: 17731266,
  collectionName: 'Film (Original Motion Picture Soundtrack)',
  artworkUrl100: 'https://is1-ssl.mzstatic.com/image/thumb/Music/v4/aa/cover.jpg/100x100bb.jpg',
  previewUrl: PREVIEW,
  primaryGenreName: 'Bollywood',
  releaseDate: '1994-03-24T12:00:00Z',
  trackViewUrl: `https://music.apple.com/in/album/x/1?i=${id}&uo=4`,
  trackTimeMillis: 400_000,
  ...over,
});
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
/** Apple answers; every other host (Audius) answers with an empty list. */
const stubApple = (results: unknown[]) => {
  const f = vi.fn(async (url: string) => (String(url).includes('itunes.apple.com') ? json({ resultCount: results.length, results }) : json({ data: [] })));
  vi.stubGlobal('fetch', f);
  return f;
};

afterEach(() => {
  vi.unstubAllGlobals();
  clearApiCache();
});

describe('ItunesProvider', () => {
  it('maps a song to a playable 30-second preview with album, year and Apple Music link', async () => {
    stubApple([song(1)]);
    const [t] = await new ItunesProvider({ enabled: true }).searchTracks('kumar sanu');
    expect(t).toMatchObject({
      provider: 'itunes',
      providerTrackId: '1',
      preview: true,
      duration: 30,
      year: 1994,
      album: 'Film (Original Motion Picture Soundtrack)',
      streamUrl: PREVIEW,
      artistId: '17731266',
    });
    expect(t.artwork).toMatch(/\/480x480bb\.jpg$/);
    expect(t.permalink).toMatch(/^https:\/\/music\.apple\.com\//);
    expect(t.rights.streamingPermitted).toBe(true);
    expect(t.rights.basis).toMatch(/30-second preview/);
    // a preview clip never implies commercial or advertising permission
    expect(t.rights.commercialUse).toBe('unconfirmed');
    expect(t.rights.advertising).toBe('unconfirmed');
  });

  it('searches the India storefront by default with the query URL-encoded', async () => {
    const f = stubApple([]);
    await new ItunesProvider({ enabled: true }).searchTracks('r.d. burman & co', { limit: 5, offset: 10 });
    const url = String(f.mock.calls[0][0]);
    expect(url).toContain('https://itunes.apple.com/search?term=r.d.%20burman%20%26%20co');
    expect(url).toContain('country=IN');
    expect(url).toContain('limit=5');
    expect(url).toContain('offset=10');
  });

  it('never plays a song without a preview clip or with a clip from a foreign host', async () => {
    stubApple([song(1, { previewUrl: undefined }), song(2, { previewUrl: 'https://evil.example.com/a.m4a' }), song(3)]);
    const list = await createMusicService({ itunesPreviews: true }).searchTracks('x');
    expect(list.map((t) => t.providerTrackId)).toEqual(['3']);
  });

  it('reads the chart feed (preview link, artist id) and ignores genres it does not know', async () => {
    const entry = {
      id: { attributes: { 'im:id': '77' } },
      'im:name': { label: 'Chart Song' },
      'im:artist': { label: 'A.R. Rahman', attributes: { href: 'https://music.apple.com/in/artist/a-r-rahman/3249567?uo=2' } },
      'im:image': [{ label: 'https://is1-ssl.mzstatic.com/image/thumb/x/cover.jpg/55x55bb.png' }, { label: 'https://is1-ssl.mzstatic.com/image/thumb/x/cover.jpg/170x170bb.png' }],
      link: [
        { attributes: { type: 'text/html', href: 'https://music.apple.com/in/album/chart-song/1?i=77' } },
        { attributes: { type: 'audio/x-m4a', 'im:assetType': 'preview', href: PREVIEW } },
      ],
      category: { attributes: { label: 'Bollywood' } },
      'im:releaseDate': { label: '2026-09-14T05:00:00-07:00' },
    };
    const f = vi.fn(async () => json({ feed: { entry: [entry] } }));
    vi.stubGlobal('fetch', f);
    const p = new ItunesProvider({ enabled: true });
    const [t] = await p.getTrending({ genre: 'Bollywood', limit: 20 });
    expect(String(f.mock.calls[0][0])).toBe('https://itunes.apple.com/in/rss/topsongs/limit=50/genre=1263/json');
    expect(t).toMatchObject({ providerTrackId: '77', title: 'Chart Song', artistId: '3249567', year: 2026, streamUrl: PREVIEW, preview: true });
    expect(await p.getTrending({ genre: 'Deep House' })).toEqual([]);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('is off unless the operator opts in', async () => {
    const f = stubApple([song(1)]);
    const music = createMusicService();
    expect(music.status().find((p) => p.id === 'itunes')?.configured).toBe(false);
    await music.searchTracks('x');
    expect(f.mock.calls.some(([u]) => String(u).includes('apple.com'))).toBe(false);
  });
});

describe('era categories', () => {
  it('keep only tracks released inside the requested years', async () => {
    stubApple([song(1, { releaseDate: '1994-01-01T00:00:00Z' }), song(2, { releaseDate: '2004-01-01T00:00:00Z' }), song(3, { releaseDate: undefined }), song(4, { releaseDate: '1999-12-31T00:00:00Z' })]);
    const list = await createMusicService({ itunesPreviews: true }).getCategoryTracks({ kind: 'search', queries: ['kumar sanu'], years: [1990, 1999] }, { limit: 20 });
    expect(list.map((t) => t.providerTrackId)).toEqual(['1', '4']);
  });
});
