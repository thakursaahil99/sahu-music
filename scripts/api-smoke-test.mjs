// Live smoke test against the real Audius API (no key needed).  Run: npm run test:api
// Checks every endpoint the apps use, and that a stream URL really serves audio.
const BASE = 'https://api.audius.co/v1';
const APP = 'app_name=SAHU_MUSIC';
let failed = 0;

async function check(name, fn) {
  try {
    const detail = await fn();
    console.log(`PASS  ${name}${detail ? `  (${detail})` : ''}`);
  } catch (e) {
    failed++;
    console.log(`FAIL  ${name}  ->  ${e.message}`);
  }
}

async function get(path) {
  const res = await fetch(`${BASE}${path}${path.includes('?') ? '&' : '?'}${APP}`, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()).data;
}

const need = (cond, msg) => {
  if (!cond) throw new Error(msg);
};

let track;
let user;
let playlist;

await check('trending tracks', async () => {
  const d = await get('/tracks/trending?limit=5');
  need(Array.isArray(d) && d.length > 0, 'no tracks');
  track = d.find((t) => t.is_streamable && !t.is_stream_gated);
  need(track, 'no streamable track in trending');
  user = track.user;
  return `${d.length} tracks, first playable: "${track.title}"`;
});

await check('trending by genre (Devotional)', async () => {
  const d = await get('/tracks/trending?genre=Devotional&time=month&limit=5');
  need(Array.isArray(d), 'bad response');
  return `${d.length} tracks`;
});

for (const q of ['hindi', 'punjabi', 'bollywood', 'haryanvi']) {
  await check(`search tracks "${q}"`, async () => {
    const d = await get(`/tracks/search?query=${q}&limit=10`);
    need(Array.isArray(d), 'bad response');
    return `${d.length} results, ${d.filter((t) => t.is_streamable && !t.is_stream_gated).length} playable`;
  });
}

await check('search artists', async () => {
  const d = await get('/users/search?query=music&limit=3');
  need(Array.isArray(d) && d.length > 0, 'no artists');
  return d[0].name;
});

await check('search playlists', async () => {
  const d = await get('/playlists/search?query=mix&limit=3');
  need(Array.isArray(d) && d.length > 0, 'no playlists');
  return d[0].playlist_name;
});

await check('trending playlists', async () => {
  const d = await get('/playlists/trending?limit=3');
  need(Array.isArray(d) && d.length > 0, 'no playlists');
  playlist = d[0];
  return playlist.playlist_name;
});

await check('track details', async () => {
  const d = await get(`/tracks/${track.id}`);
  need(d && d.id === track.id, 'track mismatch');
  need(d.artwork && d.artwork['480x480'], 'no artwork');
  return `artwork ok, licence: ${d.license ?? 'not stated'}`;
});

await check('artist details + tracks', async () => {
  const a = await get(`/users/${user.id}`);
  need(a && a.id === user.id, 'artist mismatch');
  const t = await get(`/users/${user.id}/tracks?limit=3`);
  need(Array.isArray(t), 'bad tracks');
  return `${a.name}, ${t.length} tracks`;
});

await check('playlist + its tracks', async () => {
  const meta = await get(`/playlists/${playlist.id}`);
  need(meta, 'no playlist');
  const t = await get(`/playlists/${playlist.id}/tracks`);
  need(Array.isArray(t), 'bad tracks');
  return `${t.length} tracks`;
});

await check('stream URL serves audio', async () => {
  const res = await fetch(`${BASE}/tracks/${track.id}/stream?${APP}`, { headers: { Range: 'bytes=0-2047' } });
  need(res.ok, `HTTP ${res.status}`);
  const type = res.headers.get('content-type') ?? '';
  const bytes = (await res.arrayBuffer()).byteLength;
  need(type.startsWith('audio/'), `unexpected content-type ${type}`);
  need(bytes > 0, 'empty body');
  return `${type}, ${bytes} bytes, HTTP ${res.status}`;
});

await check('CORS allows browser playback', async () => {
  const res = await fetch(`${BASE}/tracks/trending?limit=1&${APP}`, { headers: { Origin: 'http://localhost:3000' } });
  need(res.headers.get('access-control-allow-origin') === '*', 'no CORS header');
});

console.log(failed ? `\n${failed} check(s) failed` : '\nAll API checks passed');
process.exit(failed ? 1 : 0);
