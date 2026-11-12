import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearApiCache, createMusicService, DemoProvider, synthWav } from '../src';

const track = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  title: `Song ${id}`,
  duration: 100,
  is_streamable: true,
  is_stream_gated: false,
  user: { id: 'u1', name: 'A' },
  ...over,
});
const respond = (data: unknown, status = 200) =>
  new Response(JSON.stringify({ data }), { status, headers: { 'Content-Type': 'application/json' } });

afterEach(() => {
  vi.unstubAllGlobals();
  clearApiCache();
});

describe('MusicService', () => {
  it('returns only playable tracks from the provider', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => respond([track('a1'), track('b2', { is_stream_gated: true }), track('c3')])));
    const music = createMusicService();
    const list = await music.getTrending({ limit: 3 });
    expect(list.map((t) => t.providerTrackId)).toEqual(['a1', 'c3']);
    expect(music.isDemoMode()).toBe(false);
  });

  it('removes admin-blocked tracks', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => respond([track('a1'), track('c3')])));
    const music = createMusicService();
    music.setBlocklist(['audius:a1']);
    expect((await music.searchTracks('x')).map((t) => t.providerTrackId)).toEqual(['c3']);
  });

  it('sends the search query URL-encoded to the Audius search endpoint', async () => {
    const f = vi.fn(async (_url: string) => respond([]));
    vi.stubGlobal('fetch', f);
    await createMusicService().searchTracks('hindi & more');
    expect(String(f.mock.calls[0][0])).toContain('/v1/tracks/search?query=hindi%20%26%20more');
  });

  it('falls back to demo mode with original sample audio when the provider is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new TypeError('network down');
    }));
    const music = createMusicService();
    const list = await music.getTrending();
    expect(music.isDemoMode()).toBe(true);
    expect(list.length).toBeGreaterThan(0);
    expect(list.every((t) => t.provider === 'demo' && t.artist === 'SAHU MUSIC Demo')).toBe(true);
  }, 20_000);

  it('does not query a provider an admin has disabled', async () => {
    const f = vi.fn(async () => respond([track('a1')]));
    vi.stubGlobal('fetch', f);
    const music = createMusicService();
    music.setDisabledProviders(['audius', 'itunes', 'radio', 'archive']);
    await music.getTrending();
    expect(f).not.toHaveBeenCalled();
    expect(music.isDemoMode()).toBe(true);
  });

  it('never returns or plays a 30-second preview clip by default', async () => {
    const f = vi.fn(async (_url: string) => respond([track('a1')]));
    vi.stubGlobal('fetch', f);
    const music = createMusicService();
    expect(music.previewsAllowed).toBe(false);
    await music.searchTracks('arijit');
    // the preview provider is not even queried
    expect(f.mock.calls.every(([url]) => !String(url).includes('itunes.apple.com'))).toBe(true);

    // a preview-only track saved earlier is refused, with a reason a listener can understand
    const full = (await music.getTrending())[0];
    const saved = { ...full, provider: 'itunes' as const, providerTrackId: '123', preview: true, duration: 30, streamUrl: 'https://audio-ssl.itunes.apple.com/x.m4a' };
    expect(music.isTrackPlayable(saved)).toBe(false);
    expect(music.unavailableReason(saved)).toMatch(/30-second preview/);
    expect(music.isTrackPlayable(full)).toBe(true);
    expect(music.unavailableReason(full)).toBeNull();
  });

  it('plays preview clips only when the operator explicitly opts in', () => {
    const optIn = createMusicService({ itunesPreviews: true });
    expect(optIn.previewsAllowed).toBe(true);
    expect(optIn.status().find((p) => p.id === 'itunes')?.configured).toBe(true);
    expect(createMusicService().status().find((p) => p.id === 'itunes')?.configured).toBe(false);
  });

  it('hands over the fast providers’ results before a slow provider answers', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        String(url).includes('archive.org')
          ? new Promise<Response>((r) => setTimeout(() => r(new Response(JSON.stringify({ response: { docs: [] } }))), 1500))
          : respond([track('a1', { title: 'Bhajan One' })]),
      ),
    );
    const partials: { at: number; ids: string[] }[] = [];
    const t0 = Date.now();
    const list = await createMusicService({ radio: false }).searchTracks('bhajan', undefined, {
      onPartial: (ts) => partials.push({ at: Date.now() - t0, ids: ts.map((t) => t.providerTrackId) }),
    });
    expect(partials).toHaveLength(1);
    expect(partials[0].ids).toEqual(['a1']);
    expect(partials[0].at).toBeLessThan(1000);
    expect(Date.now() - t0).toBeGreaterThanOrEqual(1400);
    expect(list.map((t) => t.providerTrackId)).toEqual(['a1']);
  });

  it('does not ask a slow provider once a newer search has replaced this one', async () => {
    const f = vi.fn(async (_url: string) => respond([track('a1')]));
    vi.stubGlobal('fetch', f);
    const askedArchive = () => f.mock.calls.some(([url]) => String(url).includes('archive.org'));

    const ctrl = new AbortController();
    const replaced = createMusicService({ radio: false }).searchTracks('bhajan', undefined, { signal: ctrl.signal });
    ctrl.abort();
    expect((await replaced).map((t) => t.providerTrackId)).toEqual(['a1']);
    expect(askedArchive()).toBe(false);

    clearApiCache();
    await createMusicService({ radio: false }).searchTracks('bhajan', undefined, { signal: new AbortController().signal });
    expect(askedArchive()).toBe(true);
  });

  it('shows the songs at once when the radio directory is stuck', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        String(url).includes('radio-browser')
          ? new Promise<Response>(() => undefined) // never answers
          : String(url).includes('archive.org')
            ? new Response(JSON.stringify({ response: { docs: [] } }))
            : respond([track('a1', { title: 'Tum Hi Ho' })]),
      ),
    );
    let firstAt = -1;
    const t0 = Date.now();
    const list = await createMusicService().searchTracks('tum hi ho', undefined, {
      onPartial: () => {
        if (firstAt < 0) firstAt = Date.now() - t0;
      },
    });
    expect(firstAt).toBeGreaterThanOrEqual(0);
    expect(firstAt).toBeLessThan(1000);
    expect(Date.now() - t0).toBeLessThan(4000); // the radio budget, not its 12 s timeout
    expect(list.map((t) => t.providerTrackId)).toEqual(['a1']);
  });

  it('answers instantly from tracks it has already shown', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => respond([track('a1', { title: 'Kesariya' }), track('b2', { title: 'Tum Hi Ho' })])));
    const music = createMusicService({ radio: false, archive: false });
    expect(music.quickMatches('kesariya')).toEqual([]);
    await music.getTrending();
    expect(music.quickMatches('kesar').map((t) => t.providerTrackId)).toEqual(['a1']);
    expect(music.quickMatches('tum hi').map((t) => t.providerTrackId)).toEqual(['b2']);
    expect(music.quickMatches('tum kesariya')).toEqual([]);
  });

  it('asks only for the most played ordering when filling Hindi hits', async () => {
    const f = vi.fn(async (_url: string) => respond([track('a1', { duration: 200 })]));
    vi.stubGlobal('fetch', f);
    await createMusicService().getHindiHits();
    const searches = f.mock.calls.map(([u]) => String(u)).filter((u) => u.includes('/tracks/search'));
    expect(searches).toHaveLength(4);
    expect(searches.every((u) => u.includes('sort_method=popular'))).toBe(true);
  });

  it('keeps the cover mirrors Audius lists (plain https servers only)', async () => {
    const artwork = {
      '480x480': 'https://node-a.example/content/abc/480x480.jpg',
      mirrors: ['https://node-b.example', 'http://insecure.example', 'https://node-c.example/path', 'javascript:alert(1)', 'https://node-d.example'],
    };
    vi.stubGlobal('fetch', vi.fn(async () => respond([track('a1', { artwork })])));
    const [t] = await createMusicService({ radio: false, archive: false }).getTrending();
    expect(t.artwork).toBe('https://node-a.example/content/abc/480x480.jpg');
    expect(t.artworkMirrors).toEqual(['https://node-b.example', 'https://node-d.example']);
  });

  it('leaves artists and playlists without any track out of search results', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        String(url).includes('/users/search')
          ? respond([
              { id: 'u1', name: 'Arijit Singh (fan page)', track_count: 0 },
              { id: 'u2', name: 'Arijit Singh Covers', track_count: 12 },
            ])
          : respond([
              { id: 'p1', playlist_name: 'Empty', track_count: 0, user: { name: 'A' } },
              { id: 'p2', playlist_name: 'Hindi', track_count: 5, user: { name: 'B' } },
            ]),
      ),
    );
    const music = createMusicService({ radio: false, archive: false });
    expect((await music.searchArtists('arijit')).map((a) => a.providerArtistId)).toEqual(['u2']);
    expect((await music.searchCollections('hindi')).map((c) => c.providerCollectionId)).toEqual(['p2']);
  });

  it('reports Jamendo as not configured without a client id', () => {
    const jamendo = createMusicService().status().find((p) => p.id === 'jamendo')!;
    expect(jamendo.configured).toBe(false);
    expect(jamendo.configHint).toMatch(/JAMENDO_CLIENT_ID/);
  });
});

describe('demo audio', () => {
  it('synthesizes a valid PCM WAV', () => {
    const wav = synthWav({ bpm: 120, root: 220, notes: [0, 4, 7, null], wave: 'sine' }, 1);
    const tag = (o: number) => String.fromCharCode(...wav.slice(o, o + 4));
    expect(tag(0)).toBe('RIFF');
    expect(tag(8)).toBe('WAVE');
    expect(new DataView(wav.buffer).getUint32(40, true)).toBe(wav.length - 44);
  });

  it('labels every demo item as demo with CC0 rights', async () => {
    const tracks = await new DemoProvider().getTrending();
    expect(tracks).toHaveLength(3);
    expect(tracks.every((t) => t.title.startsWith('Demo Tone') && t.rights.license?.includes('CC0'))).toBe(true);
  });
});
