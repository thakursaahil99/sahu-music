// End-to-end playback test of the BUILT website in a real (headless) Chrome/Edge.
// Run: npm run build:web && npm run test:e2e
//
// It opens the site, clicks real tracks and checks, on the page's own <audio> element, that
//   - the source is the provider's full-track stream (not a preview clip)
//   - the real media duration is longer than 30 seconds
//   - playback keeps running past the 30-second mark
//   - a track plays to its end and the queue moves on to the next song
//   - search returns playable results
//   - a live Bollywood radio station plays
//   - with E2E_YOUTUBE=1 (site built with any NEXT_PUBLIC_YOUTUBE_API_KEY): a YouTube result plays in
//     YouTube's real official player, visible and at least 200 px tall. The Data API answers are
//     supplied by the test (the video is the sample id from YouTube's own IFrame API docs).
// It uses its own temporary browser profile and never touches your normal browser.
import { spawn } from 'node:child_process';
import { createReadStream, existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'apps', 'web', 'out');
const shotDir = process.env.SHOT_DIR || '';
if (!existsSync(join(outDir, 'index.html'))) {
  console.error('Build the website first: npm run build:web');
  process.exit(1);
}

const CHROME = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].find((p) => p && existsSync(p));
if (!CHROME) {
  console.error('No Chrome/Edge found. Set CHROME_PATH.');
  process.exit(1);
}

// ── tiny static server for the exported site ──
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.txt': 'text/plain', '.apk': 'application/vnd.android.package-archive' };
const server = createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  let file = normalize(join(outDir, p));
  if (!file.startsWith(outDir)) return res.writeHead(403).end();
  if (!existsSync(file) || statSync(file).isDirectory()) file = existsSync(`${file}.html`) ? `${file}.html` : join(outDir, '404.html');
  res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream' });
  createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const site = `http://127.0.0.1:${server.address().port}`;

// ── launch the browser with a throw-away profile ──
const profile = mkdtempSync(join(tmpdir(), 'sahu-e2e-'));
const chrome = spawn(CHROME, [
  '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check',
  '--autoplay-policy=no-user-gesture-required', '--mute-audio', '--window-size=1440,900', 'about:blank',
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ws;
let failed = 0;
const pageErrors = [];

async function connect() {
  const portFile = join(profile, 'DevToolsActivePort');
  for (let i = 0; i < 100 && !existsSync(portFile); i++) await sleep(200);
  const port = readFileSync(portFile, 'utf8').split('\n')[0].trim();
  let target;
  for (let i = 0; i < 50 && !target; i++) {
    const list = await fetch(`http://127.0.0.1:${port}/json/list`).then((r) => r.json()).catch(() => []);
    target = list.find((t) => t.type === 'page');
    if (!target) await sleep(200);
  }
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.onopen = res;
    ws.onerror = rej;
  });
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && pending.has(msg.id)) {
      const { res, rej } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? rej(new Error(msg.error.message)) : res(msg.result);
    } else if (msg.method === 'Fetch.requestPaused') {
      const u = msg.params.request.url;
      const body = u.includes('/youtube/v3/search') ? YT_SEARCH : YT_VIDEOS;
      void cdp('Fetch.fulfillRequest', {
        requestId: msg.params.requestId,
        responseCode: 200,
        responseHeaders: [
          { name: 'Content-Type', value: 'application/json' },
          { name: 'Access-Control-Allow-Origin', value: '*' },
        ],
        body: Buffer.from(JSON.stringify(body)).toString('base64'),
      });
    } else if (msg.method === 'Runtime.exceptionThrown') {
      pageErrors.push(msg.params.exceptionDetails?.exception?.description?.split('\n')[0] ?? 'exception');
    }
  };
}
const pending = new Map();
// Canned YouTube Data API answers. M7lc1UVf-VE is the sample video used in YouTube's IFrame API documentation.
const YT_ID = 'M7lc1UVf-VE';
const YT_SEARCH = { items: [{ id: { kind: 'youtube#video', videoId: YT_ID } }] };
const YT_VIDEOS = {
  items: [
    {
      id: YT_ID,
      snippet: { title: 'E2E Official Song', channelTitle: 'YouTube Developers', liveBroadcastContent: 'none', thumbnails: { high: { url: `https://i.ytimg.com/vi/${YT_ID}/hqdefault.jpg` } } },
      contentDetails: { duration: 'PT4M10S' },
      status: { embeddable: true, privacyStatus: 'public' },
      statistics: { viewCount: '1' },
    },
  ],
};
let seq = 0;
const cdp = (method, params = {}) => new Promise((res, rej) => {
  const id = ++seq;
  pending.set(id, { res, rej });
  ws.send(JSON.stringify({ id, method, params }));
});
async function js(expression) {
  const r = await cdp('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? 'page script failed');
  return r.result.value;
}
async function waitFor(expression, what, timeoutMs = 30000) {
  const end = Date.now() + timeoutMs;
  for (;;) {
    const v = await js(expression);
    if (v) return v;
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await sleep(400);
  }
}
async function shot(name) {
  if (!shotDir) return;
  const { data } = await cdp('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(shotDir, `${name}.png`), Buffer.from(data, 'base64'));
}
async function check(name, fn) {
  try {
    const detail = await fn();
    console.log(`PASS  ${name}${detail ? `  (${detail})` : ''}`);
  } catch (e) {
    failed++;
    console.log(`FAIL  ${name}  ->  ${e.message}`);
  }
}
const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const AUDIO = '({src: __audio.src, t: __audio.currentTime, d: __audio.duration, paused: __audio.paused, err: __audio.error ? __audio.error.code : 0})';

try {
  await connect();
  await cdp('Page.enable');
  await cdp('Runtime.enable');
  if (process.env.E2E_YOUTUBE) await cdp('Fetch.enable', { patterns: [{ urlPattern: '*googleapis.com/youtube/v3/*', requestStage: 'Request' }] });
  // Keep a handle on the app's audio element that is playing. The player creates a few with
  // `new Audio()` (spares buffer the next song) and marks the active one with data-sahu-active.
  await cdp('Page.addScriptToEvaluateOnNewDocument', {
    source: `const A = window.Audio; const all = []; window.Audio = function (...a) { const el = new A(...a); all.push(el); return el; }; window.Audio.prototype = A.prototype;
      Object.defineProperty(window, '__audio', { get: () => all.find((e) => e.dataset.sahuActive === '1') || all[0] });`,
  });

  await cdp('Page.navigate', { url: `${site}/` });
  const cardBtn = 'document.querySelectorAll(\'button[aria-label^="Play "]\')';

  await check('home page loads real tracks', async () => {
    // The radio row can load before the songs. Wait for the Hindi hits themselves, so the first
    // card clicked below is a song (with a length) and not a live station.
    await waitFor('[...document.querySelectorAll("button")].some((b) => b.textContent.includes("Play Hindi hits") && !b.disabled)', 'Hindi hits on the home page', 45000);
    const n = await js(`${cardBtn}.length`);
    await sleep(1500);
    await shot('01-home-desktop');
    return `${n} playable cards`;
  });

  await check('no track on the page is a 30-second preview', async () => {
    const previews = await js('[...document.querySelectorAll("span")].filter((s) => s.textContent.trim() === "Preview").length');
    if (previews) throw new Error(`${previews} "Preview" badges are shown`);
    return 'no Preview badges';
  });

  let firstSrc = '';
  await check('track 1: full stream, real duration > 30 s, plays past the 30-second mark', async () => {
    await js(`${cardBtn}[0].click()`);
    await waitFor('window.__audio && __audio.src && Number.isFinite(__audio.duration) && __audio.duration > 0', 'audio metadata');
    const a = await js(AUDIO);
    firstSrc = a.src;
    if (!/\/v1\/tracks\/[A-Za-z0-9]+\/stream/.test(a.src) && !a.src.startsWith('blob:')) throw new Error(`unexpected source ${a.src}`);
    if (/preview/i.test(a.src)) throw new Error('source is a preview URL');
    if (a.d <= 30) throw new Error(`media duration is only ${a.d.toFixed(1)} s`);
    await waitFor('__audio.currentTime > 2 && !__audio.paused', 'playback to start');
    // jump to 0:27 and let it play in real time across the 30-second mark
    await js('__audio.currentTime = 27');
    await waitFor('__audio.currentTime >= 34', 'playback to pass 0:34', 30000);
    const b = await js(AUDIO);
    if (b.paused || b.err) throw new Error('playback stopped around 30 seconds');
    const label = await js('document.querySelector(\'input[aria-label="Seek"]\')?.getAttribute("aria-valuetext") || ""');
    await shot('02-playing-desktop');
    return `duration ${fmt(a.d)}, still playing at ${fmt(b.t)}; player shows "${label}"`;
  });

  await check('track 1 plays to the END and the queue moves to the next song', async () => {
    await js('__audio.currentTime = __audio.duration - 4');
    await waitFor(`__audio.src !== ${JSON.stringify(firstSrc)} && __audio.currentTime > 1 && !__audio.paused`, 'the next track to start after the first one ended', 40000);
    const a = await js(AUDIO);
    if (a.d <= 30) throw new Error(`next track is only ${a.d.toFixed(1)} s long`);
    return `next track started, duration ${fmt(a.d)}`;
  });

  await check('track 2: seek to 0:45 keeps playing (no 30-second cut-off)', async () => {
    const d = await js('__audio.duration');
    const to = Math.min(45, d - 15);
    await js(`__audio.currentTime = ${to}`);
    await waitFor(`__audio.currentTime > ${to + 4} && !__audio.paused`, 'playback after seeking', 20000);
    return `playing at ${fmt(await js('__audio.currentTime'))} of ${fmt(d)}`;
  });

  await check('full-screen player opens with queue', async () => {
    await js('document.querySelector(\'button[aria-label="Open queue and full player"]\').click()');
    await waitFor('!!document.querySelector(\'[role="dialog"][aria-label="Now playing"]\')', 'the full player');
    await sleep(900);
    await shot('03-full-player');
    await js('document.querySelector(\'button[aria-label="Close player"]\').click()');
  });

  await check('search returns full-length playable songs and plays one', async () => {
    await cdp('Page.navigate', { url: `${site}/search/?q=punjabi` });
    const n = await waitFor(`${cardBtn}.length`, 'search results', 30000);
    await sleep(1200);
    await shot('04-search');
    const previews = await js('[...document.querySelectorAll("span")].filter((s) => s.textContent.trim() === "Preview").length');
    if (previews) throw new Error(`${previews} preview results shown`);
    await js(`${cardBtn}[0].click()`);
    await waitFor('window.__audio && Number.isFinite(__audio.duration) && __audio.duration > 0 && __audio.currentTime > 1', 'search result to play');
    const a = await js(AUDIO);
    if (a.d <= 30) throw new Error(`result is only ${a.d.toFixed(1)} s long`);
    return `${n} results, playing one of ${fmt(a.d)}`;
  });

  await check('live Bollywood radio station plays', async () => {
    await cdp('Page.navigate', { url: `${site}/genre/bollywood-radio/` });
    await waitFor(`${cardBtn}.length`, 'radio stations', 30000);
    // the stations are in the page's HTML: wait until React has taken over the buttons
    await waitFor(`Object.keys(${cardBtn}[0]).some((k) => k.startsWith('__reactProps'))`, 'the page to become interactive', 30000);
    const live = await js('[...document.querySelectorAll("span")].some((s) => s.textContent.trim() === "Live")');
    if (!live) throw new Error('no LIVE badge on the radio page');
    await js(`${cardBtn}[0].click()`);
    // a station can be offline; the player then skips to the next one by itself
    await waitFor('window.__audio && __audio.src.startsWith("https://") && __audio.currentTime > 4 && !__audio.paused', 'a station to play for 4 seconds', 45000);
    const a = await js(AUDIO);
    if (Number.isFinite(a.d) && a.d < 60) throw new Error(`radio stream reported a ${a.d}s length`);
    await shot('07-radio');
    const name = await js('document.querySelector(\'[role="region"][aria-label="Player"] span.block\')?.textContent || ""');
    return `"${name}" playing, ${a.t.toFixed(0)} s in, live (no fixed length)`;
  });

  if (process.env.E2E_YOUTUBE) {
    await check('YouTube official player plays a typed search result, visible and ≥ 200 px', async () => {
      await cdp('Page.navigate', { url: `${site}/search/?q=e2e%20official%20song` });
      await waitFor('[...document.querySelectorAll("span")].some((s) => s.textContent.includes("YouTube"))', 'the YouTube result', 30000);
      await js(`[...document.querySelectorAll('button[aria-label^="Play E2E Official Song"]')][0].click()`);
      await waitFor('!!document.querySelector("#sahu-yt-host iframe")', 'the YouTube iframe', 30000);
      const host = await js('(() => { const r = document.getElementById("sahu-yt-host").getBoundingClientRect(); return { w: r.width, h: r.height, x: r.x, y: r.y }; })()');
      if (host.h < 200 || host.w < 200) throw new Error(`video frame is ${host.w}x${host.h}, below YouTube's 200 px minimum`);
      if (host.x < 0 || host.y < 0) throw new Error('video frame is off screen');
      const src = await js('document.querySelector("#sahu-yt-host iframe").src');
      if (!src.startsWith('https://www.youtube.com/embed/')) throw new Error(`not the official embed: ${src}`);
      // the app's own seek bar follows the video
      await waitFor('(() => { const v = document.querySelector(\'input[aria-label="Seek"]\'); return v && Number(v.value) >= 3; })()', 'the video to play for 3 seconds', 45000);
      await shot('08-youtube-dock');
      await js('document.querySelector(\'button[aria-label="Open queue and full player"]\').click()');
      await sleep(1200);
      const inFull = await js('(() => { const r = document.getElementById("sahu-yt-host").getBoundingClientRect(); return { w: r.width, h: r.height }; })()');
      if (inFull.h < 200) throw new Error('video too small in the full player');
      await shot('09-youtube-full');
      await js('document.querySelector(\'button[aria-label="Close player"]\').click()');
      const label = await js('document.querySelector(\'input[aria-label="Seek"]\').getAttribute("aria-valuetext")');
      return `official embed, ${Math.round(host.w)}x${Math.round(host.h)} docked, ${Math.round(inFull.w)}x${Math.round(inFull.h)} in full player, player shows "${label}"`;
    });
  }

  await check('download page renders', async () => {
    await cdp('Page.navigate', { url: `${site}/download/` });
    await waitFor('document.body.innerText.includes("Android app (APK)")', 'the download page');
    const apk = await js('document.querySelector(\'a[download="sahu-music.apk"]\')?.getAttribute("href") || ""');
    await sleep(800);
    await shot('05-download');
    return apk ? `APK link: ${apk}` : 'no APK bundled in this build (page shows the setup notice)';
  });

  await check('mobile layout', async () => {
    await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
    await cdp('Page.navigate', { url: `${site}/` });
    await waitFor(`${cardBtn}.length`, 'track cards on mobile', 45000);
    await sleep(1500);
    await shot('06-home-mobile');
    const nav = await js('!!document.querySelector(\'nav[aria-label="Main"]\')');
    if (!nav) throw new Error('bottom navigation missing');
  });

  if (pageErrors.length) {
    failed++;
    console.log(`FAIL  page threw ${pageErrors.length} script error(s): ${[...new Set(pageErrors)].slice(0, 3).join(' | ')}`);
  } else {
    console.log('PASS  no uncaught script errors on any page');
  }
} catch (e) {
  failed++;
  console.log(`FAIL  test run aborted  ->  ${e.message}`);
} finally {
  try {
    ws?.close();
  } catch {}
  chrome.kill();
  server.close();
  await sleep(500);
  try {
    rmSync(profile, { recursive: true, force: true });
  } catch {}
}
console.log(failed ? `\n${failed} check(s) failed` : '\nAll end-to-end playback checks passed');
process.exit(failed ? 1 : 0);
