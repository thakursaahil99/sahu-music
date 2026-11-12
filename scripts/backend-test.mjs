// End-to-end check of the accounts backend (/api/v1) against a running site.
//
//   npm run test:backend -- https://sahu-music.vercel.app
//   npm run test:backend -- http://localhost:3000
//
// It signs up a throw-away account (backend-test-<random>@example.com), exercises every user
// endpoint, checks that guests, other users and other sites are refused, then deletes the account.
const base = (process.argv[2] || 'http://localhost:3000').replace(/\/$/, '');
const origin = new URL(base).origin;

let failed = 0;
let cookieJar = '';

async function call(method, path, body, { cookie = cookieJar, headers = {} } = {}) {
  const res = await fetch(`${base}/api/v1/${path}/`, {
    method,
    redirect: 'manual',
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(method !== 'GET' ? { Origin: origin } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const set = res.headers.get('set-cookie');
  if (set && cookie === cookieJar) {
    const m = /sahu_session=([^;]*)/.exec(set);
    if (m) cookieJar = m[1] ? `sahu_session=${m[1]}` : '';
  }
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* not JSON */
  }
  return { status: res.status, data, setCookie: set };
}

async function check(name, fn) {
  try {
    const note = await fn();
    console.log(`PASS  ${name}${note ? `  (${note})` : ''}`);
  } catch (e) {
    failed++;
    console.log(`FAIL  ${name}: ${e.message}`);
  }
}
const expect = (cond, msg) => {
  if (!cond) throw new Error(msg);
};

const email = `backend-test-${Math.random().toString(36).slice(2, 10)}@example.com`;
const password = `Pw-${Math.random().toString(36).slice(2)}-${Date.now()}`;
const track = {
  provider: 'audius', providerTrackId: 'TEST123', title: 'Backend Test Song', artist: 'Test Artist',
  artwork: null, streamUrl: 'https://api.audius.co/v1/tracks/TEST123/stream', duration: 200,
  rights: { status: 'approved', streamingPermitted: true, commercialUse: 'unconfirmed', advertising: 'unconfirmed', license: null, basis: 'test' },
};

await check('health: API and database answer', async () => {
  const r = await call('GET', 'health');
  expect(r.status === 200 && r.data?.ok && r.data.database, `got ${r.status} ${JSON.stringify(r.data)}`);
  return `database round trip ${r.data.ms} ms`;
});

await check('rules: public, cacheable', async () => {
  const r = await call('GET', 'rules', undefined, { cookie: '' });
  expect(r.status === 200 && Array.isArray(r.data?.blocked) && r.data.accounts === true, JSON.stringify(r.data));
  return `${r.data.blocked.length} blocked, ${r.data.disabledProviders.length} providers off`;
});

await check('guest: me is empty, library refused', async () => {
  const me = await call('GET', 'auth/me', undefined, { cookie: '' });
  expect(me.status === 200 && me.data.user === null, JSON.stringify(me.data));
  const lib = await call('GET', 'library', undefined, { cookie: '' });
  expect(lib.status === 401, `library as guest gave ${lib.status}`);
});

await check('signup validates input', async () => {
  const bad = await call('POST', 'auth/signup', { email: 'not-an-email', password: 'x' }, { cookie: '' });
  expect(bad.status === 400, `got ${bad.status}`);
  const short = await call('POST', 'auth/signup', { email, password: 'short' }, { cookie: '' });
  expect(short.status === 400, `short password gave ${short.status}`);
});

await check('signup creates the account and signs in (HttpOnly cookie)', async () => {
  const r = await call('POST', 'auth/signup', { email, password, displayName: 'Backend Test' });
  expect(r.status === 201, `got ${r.status} ${JSON.stringify(r.data)}`);
  expect(/HttpOnly/i.test(r.setCookie ?? '') && /Secure/i.test(r.setCookie ?? '') && /SameSite=Lax/i.test(r.setCookie ?? ''), `cookie flags: ${r.setCookie}`);
  expect(!r.data.token, 'web signup must not return the token in the body');
  expect(r.data.profile.role === 'user', 'new accounts must be plain users');
  return r.data.user.id;
});

await check('signup with the same email is refused', async () => {
  const r = await call('POST', 'auth/signup', { email: email.toUpperCase(), password }, { cookie: '' });
  expect(r.status === 409, `got ${r.status}`);
});

await check('me returns the account', async () => {
  const r = await call('GET', 'auth/me');
  expect(r.data?.user?.email === email && r.data.profile.display_name === 'Backend Test', JSON.stringify(r.data));
});

await check('profile name can be changed', async () => {
  const r = await call('POST', 'profile', { displayName: 'Renamed Tester' });
  expect(r.status === 200, `got ${r.status}`);
  const me = await call('GET', 'auth/me');
  expect(me.data.profile.display_name === 'Renamed Tester', 'name not saved');
});

await check('another site cannot write with the cookie (CSRF)', async () => {
  const r = await call('POST', 'favorites/add', { track }, { headers: { Origin: 'https://evil.example' } });
  expect(r.status === 403, `got ${r.status}`);
  const form = await fetch(`${base}/api/v1/favorites/add/`, { method: 'POST', headers: { Cookie: cookieJar, Origin: origin, 'Content-Type': 'text/plain' }, body: JSON.stringify({ track }) });
  expect(form.status === 415, `text/plain body gave ${form.status}`);
});

await check('favourites: add, list, remove', async () => {
  expect((await call('POST', 'favorites/add', { track })).status === 200, 'add failed');
  expect((await call('POST', 'favorites/add', { track })).status === 200, 'adding twice must be harmless');
  let lib = await call('GET', 'library');
  expect(lib.data.favorites.length === 1 && lib.data.favorites[0].title === track.title, JSON.stringify(lib.data.favorites));
  expect((await call('POST', 'favorites/remove', { provider: 'audius', providerTrackId: 'TEST123' })).status === 200, 'remove failed');
  lib = await call('GET', 'library');
  expect(lib.data.favorites.length === 0, 'favourite not removed');
});

await check('demo tracks and junk are not stored', async () => {
  const r = await call('POST', 'favorites/add', { track: { ...track, provider: 'demo' } });
  expect(r.status === 400, `demo track gave ${r.status}`);
  const big = await call('POST', 'favorites/add', { track: { ...track, title: 'x'.repeat(600) } });
  expect(big.status === 400, `oversized title gave ${big.status}`);
});

await check('history: add and clear', async () => {
  await call('POST', 'history/add', { track });
  await call('POST', 'history/add', { track: { ...track, providerTrackId: 'TEST456', title: 'Second' } });
  let lib = await call('GET', 'library');
  expect(lib.data.history.length === 2 && lib.data.history[0].track.title === 'Second', JSON.stringify(lib.data.history.map((h) => h.track.title)));
  await call('POST', 'history/clear', {});
  lib = await call('GET', 'library');
  expect(lib.data.history.length === 0, 'history not cleared');
});

const playlistId = crypto.randomUUID();
await check('playlists: create, rename, add and remove tracks, delete', async () => {
  expect((await call('POST', 'playlists/create', { id: playlistId, title: 'My Test List' })).status === 201, 'create failed');
  expect((await call('POST', 'playlists/rename', { id: playlistId, title: 'Renamed List' })).status === 200, 'rename failed');
  await call('POST', 'playlists/add-track', { playlistId, track });
  await call('POST', 'playlists/add-track', { playlistId, track: { ...track, providerTrackId: 'TEST456', title: 'Second' } });
  let lib = await call('GET', 'library');
  const pl = lib.data.playlists.find((p) => p.id === playlistId);
  expect(pl && pl.title === 'Renamed List' && pl.tracks.map((t) => t.title).join() === 'Backend Test Song,Second', JSON.stringify(pl));
  await call('POST', 'playlists/remove-track', { playlistId, provider: 'audius', providerTrackId: 'TEST123' });
  lib = await call('GET', 'library');
  expect(lib.data.playlists.find((p) => p.id === playlistId).tracks.length === 1, 'track not removed');
});

await check('preferences are saved with the account', async () => {
  expect((await call('POST', 'preferences', { preferences: { autoplayNext: false, dataSaver: true } })).status === 200, 'save failed');
  const lib = await call('GET', 'library');
  expect(lib.data.preferences?.dataSaver === true && lib.data.preferences.autoplayNext === false, JSON.stringify(lib.data.preferences));
});

await check('a normal user is refused by every admin endpoint', async () => {
  for (const [m, p, b] of [['GET', 'admin/stats'], ['POST', 'admin/table', { op: 'list', table: 'profiles' }], ['POST', 'admin/rights', { op: 'list' }], ['POST', 'admin/import', { provider: 'audius', tracks: [] }]]) {
    const r = await call(m, p, b);
    expect(r.status === 403, `${p} gave ${r.status}`);
  }
  const adminLogin = await call('POST', 'auth/login', { email, password, client: 'admin' }, { cookie: '' });
  expect(adminLogin.status === 403, `admin sign-in for a user gave ${adminLogin.status}`);
});

let mobileToken = '';
await check('mobile sign-in returns a bearer token that works without cookies', async () => {
  const r = await call('POST', 'auth/login', { email, password, client: 'mobile' }, { cookie: '', headers: { Origin: '' } });
  expect(r.status === 200 && typeof r.data.token === 'string' && !r.setCookie, `got ${r.status}, cookie ${r.setCookie}`);
  mobileToken = r.data.token;
  const me = await call('GET', 'auth/me', undefined, { cookie: '', headers: { Authorization: `Bearer ${mobileToken}` } });
  expect(me.data.user?.email === email, 'bearer token not accepted');
  const lib = await call('GET', 'library', undefined, { cookie: '', headers: { Authorization: `Bearer ${mobileToken}` } });
  expect(lib.data.playlists.some((p) => p.id === playlistId), 'mobile does not see the same library');
});

await check('another account cannot touch this playlist', async () => {
  const other = `backend-test-${Math.random().toString(36).slice(2, 10)}@example.com`;
  const s = await call('POST', 'auth/signup', { email: other, password, client: 'mobile' }, { cookie: '' });
  const auth = { cookie: '', headers: { Authorization: `Bearer ${s.data.token}` } };
  const r1 = await call('POST', 'playlists/add-track', { playlistId, track }, auth);
  const r2 = await call('POST', 'playlists/rename', { id: playlistId, title: 'hacked' }, auth);
  await call('POST', 'playlists/delete', { id: playlistId }, auth);
  const lib = await call('GET', 'library');
  const pl = lib.data.playlists.find((p) => p.id === playlistId);
  await call('POST', 'auth/delete', { password }, auth);
  expect(r1.status === 404 && r2.status === 404 && pl && pl.title === 'Renamed List', `add ${r1.status}, rename ${r2.status}, playlist ${JSON.stringify(pl?.title)}`);
});

await check('wrong password is refused', async () => {
  const r = await call('POST', 'auth/login', { email, password: 'wrong-password' }, { cookie: '' });
  expect(r.status === 401 && r.data.error === 'Wrong email or password.', `got ${r.status}`);
  const unknown = await call('POST', 'auth/login', { email: `nobody-${Date.now()}@example.com`, password: 'whatever1' }, { cookie: '' });
  expect(unknown.status === 401 && unknown.data.error === r.data.error, 'unknown email must look the same as a wrong password');
});

await check('logout ends the session', async () => {
  const saved = cookieJar;
  await call('POST', 'auth/logout', {});
  const me = await call('GET', 'auth/me', undefined, { cookie: saved });
  expect(me.data.user === null, 'old cookie still works after logout');
});

await check('sign in again, then delete the account', async () => {
  const r = await call('POST', 'auth/login', { email, password });
  expect(r.status === 200, `login gave ${r.status}`);
  const d = await call('POST', 'auth/delete', { password });
  expect(d.status === 200, `delete gave ${d.status}`);
  const again = await call('POST', 'auth/login', { email, password }, { cookie: '' });
  expect(again.status === 401, 'deleted account can still sign in');
  const tokenAfter = await call('GET', 'auth/me', undefined, { cookie: '', headers: { Authorization: `Bearer ${mobileToken}` } });
  expect(tokenAfter.data.user === null, 'mobile token survived account deletion');
});

console.log(failed ? `\n${failed} check(s) failed` : '\nAll backend checks passed');
process.exitCode = failed ? 1 : 0;
