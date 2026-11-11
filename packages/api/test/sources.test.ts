import { afterEach, describe, expect, it, vi } from 'vitest';
import { ArchiveProvider, clearApiCache, createMusicService, isOfficialChannel, parseIsoDuration, RadioProvider, rankSearch, YoutubeProvider } from '../src';

const KEY = 'AIzaTESTKEY_0123456789abcdefghij';
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

afterEach(() => {
  vi.unstubAllGlobals();
  clearApiCache();
});

// ── YouTube ──────────────────────────────────────────────────────────
const video = (id: string, over: Record<string, any> = {}) => ({
  id,
  snippet: { title: `Song &amp; ${id}`, channelTitle: 'T-Series', thumbnails: { high: { url: `https://i.ytimg.com/vi/${id}/hqdefault.jpg` } }, liveBroadcastContent: 'none', publishedAt: '2013-01-01T00:00:00Z', ...over.snippet },
  contentDetails: { duration: 'PT4M22S', ...over.contentDetails },
  status: { embeddable: true, privacyStatus: 'public', ...over.status },
  statistics: { viewCount: '1000000' },
});

function stubYoutube(searchIds: string[], videos: any[]) {
  const f = vi.fn(async (url: string) => {
    const u = String(url);
    if (u.includes('googleapis.com/youtube/v3/search')) return json({ items: searchIds.map((videoId) => ({ id: { kind: 'youtube#video', videoId } })) });
    if (u.includes('googleapis.com/youtube/v3/videos')) return json({ items: videos });
    return json({ data: [] }); // every other provider: nothing
  });
  vi.stubGlobal('fetch', f);
  return f;
}

describe('YouTube provider', () => {
  it('is off without a key, and never called', async () => {
    const f = stubYoutube([], []);
    const music = createMusicService({ radio: false, archive: false });
    expect(music.isActive('youtube')).toBe(false);
    await music.searchTracks('tum hi ho', {}, { userSearch: true });
    expect(f.mock.calls.some(([u]) => String(u).includes('googleapis'))).toBe(false);
  });

  it('maps embeddable song-length videos into full-length video tracks', async () => {
    stubYoutube(['aaaaaaaaaaa', 'bbbbbbbbbbb', 'ccccccccccc', 'ddddddddddd', 'eeeeeeeeeee'], [
      video('aaaaaaaaaaa'),
      video('bbbbbbbbbbb', { status: { embeddable: false } }),
      video('ccccccccccc', { contentDetails: { duration: 'PT45S' } }), // a short
      video('ddddddddddd', { contentDetails: { contentRating: { ytRating: 'ytAgeRestricted' } } }),
      video('eeeeeeeeeee', { snippet: { channelTitle: 'Random Uploader' } }),
    ]);
    const yt = new YoutubeProvider({ apiKey: KEY });
    const list = await yt.searchTracks('song');
    expect(list.map((t) => t.providerTrackId)).toEqual(['aaaaaaaaaaa', 'bbbbbbbbbbb', 'ddddddddddd', 'eeeeeeeeeee']);
    const [ok, noEmbed, age, other] = list;
    expect(ok).toMatchObject({ provider: 'youtube', video: true, duration: 262, official: true, title: 'Song & aaaaaaaaaaa', streamUrl: 'https://www.youtube.com/watch?v=aaaaaaaaaaa' });
    expect(ok.rights.streamingPermitted).toBe(true);
    expect(noEmbed.rights.streamingPermitted).toBe(false);
    expect(noEmbed.streamUrl).toBe('');
    expect(age.rights.streamingPermitted).toBe(false);
    expect(other.official).toBe(false);
  });

  it('takes part only in searches the listener typed (quota), and ranks the label’s upload first', async () => {
    const f = stubYoutube(['aaaaaaaaaaa'], [video('aaaaaaaaaaa', { snippet: { title: 'Tum Hi Ho | Aashiqui 2 | Arijit Singh' } })]);
    const music = createMusicService({ youtubeApiKey: KEY, radio: false, archive: false });
    expect(music.isActive('youtube')).toBe(true);

    await music.searchTracks('tum hi ho'); // background row: no YouTube call
    expect(f.mock.calls.some(([u]) => String(u).includes('/youtube/v3/search'))).toBe(false);

    const typed = await music.searchTracks('tum hi ho', {}, { userSearch: true });
    expect(typed[0]).toMatchObject({ provider: 'youtube', official: true });
    // the category strategy for original songs uses the cheap chart
    await music.getCategoryTracks({ kind: 'youtube-chart' });
    expect(f.mock.calls.some(([u]) => String(u).includes('chart=mostPopular'))).toBe(true);
  });

  it('asks for 50 songs and continues with YouTube page tokens on Load more', async () => {
    const urls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      const u = String(url);
      urls.push(u);
      if (u.includes('/youtube/v3/search')) return json({ nextPageToken: u.includes('pageToken=') ? undefined : 'CDIQAA', items: [{ id: { videoId: u.includes('pageToken=') ? 'bbbbbbbbbbb' : 'aaaaaaaaaaa' } }] });
      if (u.includes('/youtube/v3/videos')) return json({ items: [video(u.includes('bbbbbbbbbbb') ? 'bbbbbbbbbbb' : 'aaaaaaaaaaa')] });
      return json({});
    }));
    const yt = new YoutubeProvider({ apiKey: KEY });
    expect((await yt.searchTracks('arijit', { offset: 0, limit: 50 }))[0].providerTrackId).toBe('aaaaaaaaaaa');
    expect(urls[0]).toContain('maxResults=50');
    expect((await yt.searchTracks('arijit', { offset: 50, limit: 50 }))[0].providerTrackId).toBe('bbbbbbbbbbb');
    expect(urls.some((u) => u.includes('pageToken=CDIQAA'))).toBe(true);
    // no third page: YouTube sent no further token
    expect(await yt.searchTracks('arijit', { offset: 100, limit: 50 })).toEqual([]);
  });

  it('turns a used-up quota into a clear message without breaking other sources', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => (String(url).includes('googleapis') ? json({ error: { code: 403 } }, 403) : json({ data: [] }))));
    const yt = new YoutubeProvider({ apiKey: KEY });
    await expect(yt.searchTracks('x')).rejects.toThrow(/quota/i);
    const music = createMusicService({ youtubeApiKey: KEY, radio: false, archive: false });
    await expect(music.searchTracks('x', {}, { userSearch: true })).resolves.toEqual([]);
  });

  it('parses durations and recognises official channels', () => {
    expect(parseIsoDuration('PT1H2M3S')).toBe(3723);
    expect(parseIsoDuration('PT4M')).toBe(240);
    expect(parseIsoDuration('bogus')).toBe(0);
    expect(isOfficialChannel('T-Series')).toBe(true);
    expect(isOfficialChannel('Arijit Singh - Topic')).toBe(true);
    expect(isOfficialChannel('SonyMusicIndiaVEVO')).toBe(true);
    expect(isOfficialChannel('Bob Covers')).toBe(false);
    const ranked = rankSearch('kesariya', [
      { ...video('x'), provider: 'audius', providerTrackId: '1', title: 'Kesariya (cover)', artist: 'a', artwork: null, streamUrl: 's', duration: 200, rights: { status: 'approved', streamingPermitted: true, commercialUse: 'unconfirmed', advertising: 'unconfirmed', license: null, basis: '' } } as any,
      { provider: 'youtube', providerTrackId: '2', title: 'Kesariya - Brahmastra', artist: 'Sony Music India', official: true, artwork: null, streamUrl: 's', duration: 268, rights: { status: 'approved', streamingPermitted: true, commercialUse: 'unconfirmed', advertising: 'unconfirmed', license: null, basis: '' } },
    ]);
    expect(ranked[0].provider).toBe('youtube');
  });
});

// ── Radio ────────────────────────────────────────────────────────────
const station = (n: number, over: Record<string, unknown> = {}) => ({
  stationuuid: `0db90d9a-0000-4000-8000-00000000000${n}`,
  name: `Bollywood Station ${n}`,
  url_resolved: `https://stream.example.org/${n}.mp3`,
  favicon: '',
  tags: 'bollywood,hindi',
  country: 'India',
  state: '',
  hls: 0,
  lastcheckok: 1,
  clickcount: 100 - n,
  homepage: 'https://example.org',
  ...over,
});

describe('Radio provider', () => {
  it('lists working HTTPS stations as live tracks', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json([station(1), station(2, { url_resolved: 'http://insecure.example/2' }), station(3, { lastcheckok: 0 }), station(4, { hls: 1 })])));
    const music = createMusicService({ archive: false });
    const list = await music.getRadio(['bollywood']);
    expect(list.map((t) => t.title)).toEqual(['Bollywood Station 1']);
    expect(list[0]).toMatchObject({ provider: 'radio', live: true, duration: 0, streamUrl: 'https://stream.example.org/1.mp3' });
    expect(music.isTrackPlayable(list[0])).toBe(true);
  });

  it('ignores very short search terms', async () => {
    const f = vi.fn(async () => json([station(1)]));
    vi.stubGlobal('fetch', f);
    expect(await new RadioProvider().searchTracks('hi')).toEqual([]);
    expect(f).not.toHaveBeenCalled();
  });
});

// ── Internet Archive ────────────────────────────────────────────────
const item = (licence: string, files: unknown[], extra: Record<string, unknown> = {}) => ({
  metadata: { identifier: 'HindiBhajans', title: 'Hindi Bhajans', creator: 'Bhajan Mandal', mediatype: 'audio', licenseurl: licence, ...extra },
  files,
});
const mp3 = (name: string, length: string, over: Record<string, unknown> = {}) => ({ name, format: 'VBR MP3', source: 'original', length, title: name.replace('.mp3', ''), ...over });

function stubArchive(meta: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const u = String(url);
      if (u.includes('advancedsearch')) return json({ response: { docs: [{ identifier: 'HindiBhajans' }] } });
      if (u.includes('/metadata/')) return json(meta);
      return json({ data: [] });
    }),
  );
}

describe('Internet Archive provider', () => {
  it('returns full-length files of openly licensed items with a direct download stream', async () => {
    stubArchive(item('http://creativecommons.org/publicdomain/zero/1.0/', [mp3('Aarti.mp3', '285.64'), mp3('Aarti vbr.mp3', '285.6', { title: 'Aarti vbr' }), mp3('Clip.mp3', '20'), { name: 'cover.jpg', format: 'JPEG' }]));
    const list = await new ArchiveProvider().searchTracks('bhajan');
    expect(list).toHaveLength(1); // the duplicate bitrate copy and the 20-second clip are dropped
    expect(list[0]).toMatchObject({ provider: 'archive', title: 'Aarti', artist: 'Bhajan Mandal', duration: 286, streamUrl: 'https://archive.org/download/HindiBhajans/Aarti.mp3' });
    expect(list[0].rights.streamingPermitted).toBe(true);
    expect(list[0].rights.commercialUse).toBe('allowed');
  });

  it('skips items without an open licence or with restricted access', async () => {
    stubArchive(item('', [mp3('A.mp3', '200')]));
    expect(await new ArchiveProvider().searchTracks('bhajan')).toEqual([]);
    clearApiCache();
    stubArchive(item('http://creativecommons.org/licenses/by/4.0/', [mp3('A.mp3', '200')], { 'access-restricted-item': 'true' }));
    expect(await new ArchiveProvider().searchTracks('bhajan')).toEqual([]);
  });

  it('a slow Archive does not hold back search results', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        String(url).includes('archive.org')
          ? new Promise<Response>((r) => setTimeout(() => r(json({ response: { docs: [] } })), 8000))
          : json({ data: [{ id: 'AbC123', title: 'Bhajan One', duration: 240, is_streamable: true, user: { id: 'u1', name: 'A' } }] }),
      ),
    );
    const t0 = Date.now();
    const list = await createMusicService({ radio: false }).searchTracks('bhajan');
    expect(Date.now() - t0).toBeLessThan(6000);
    expect(list.map((t) => t.provider)).toEqual(['audius']);
  }, 15_000);
});
