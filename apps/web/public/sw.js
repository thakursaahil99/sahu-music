/* SAHU MUSIC service worker – hand-written, no dependencies.
 *
 * What is cached:
 *   - app shell (HTML pages, JS, CSS, icons)  → works offline
 *   - artwork images                           → cache-first, capped
 *   - provider JSON metadata                   → network-first, cached copy when offline
 * What is NEVER cached:
 *   - audio. Streams always go straight to the network; copyrighted audio is
 *     not stored or redistributed by this app.
 *
 * Bump VERSION on every deploy that changes this file to trigger the update notice.
 */
const VERSION = 'v1.3.0';
const SHELL = `sahu-shell-${VERSION}`;
const PAGES = `sahu-pages-${VERSION}`;
const ART = 'sahu-artwork';
const META = 'sahu-metadata';
const ART_MAX = 300;
const META_MAX = 80;

const PRECACHE = [
  '/',
  '/offline.html',
  '/manifest.webmanifest',
  '/logo.svg',
  '/favicon.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/explore/',
  '/search/',
  '/library/',
  '/settings/',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL).then((cache) =>
      // tolerate individual failures so one missing file cannot block installation
      Promise.all(PRECACHE.map((url) => cache.add(new Request(url, { cache: 'reload' })).catch(() => undefined))),
    ),
  );
  // No skipWaiting here: the page shows "new version available" and the user chooses when to update.
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([SHELL, PAGES, ART, META]);
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k.startsWith('sahu-') && !keep.has(k)).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

async function trim(cacheName, max) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length > max) await Promise.all(keys.slice(0, keys.length - max).map((k) => cache.delete(k)));
}

function isAudio(request, url) {
  return (
    request.destination === 'audio' ||
    request.destination === 'video' ||
    request.headers.has('range') ||
    /\/stream(\?|$)/.test(url.pathname + url.search) ||
    url.pathname.includes('/cidstream/') ||
    /\.(mp3|m4a|aac|ogg|opus|wav|flac)$/i.test(url.pathname)
  );
}

async function cacheFirst(request, cacheName, max) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  // opaque (no-cors) image responses are fine to cache for <img> use
  if (res.ok || res.type === 'opaque') {
    cache.put(request, res.clone()).then(() => trim(cacheName, max)).catch(() => undefined);
  }
  return res;
}

async function networkFirst(request, cacheName, max, timeoutMs) {
  const cache = await caches.open(cacheName);
  try {
    const res = await (timeoutMs
      ? Promise.race([fetch(request), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), timeoutMs))])
      : fetch(request));
    if (res.ok) cache.put(request, res.clone()).then(() => (max ? trim(cacheName, max) : undefined)).catch(() => undefined);
    return res;
  } catch (err) {
    const hit = await cache.match(request);
    if (hit) return hit;
    throw err;
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  // 0. App downloads (APK): always straight from the network, never cached.
  if (url.pathname.startsWith('/downloads/')) return;

  // 1. Audio: never touched by the service worker.
  if (isAudio(request, url)) return;

  const sameOrigin = url.origin === self.location.origin;

  // 2. Page navigations: network-first, then cached page, then cached home shell, then offline page.
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          return await networkFirst(request, PAGES, 60);
        } catch {
          const shell = await caches.open(SHELL);
          return (
            (await shell.match(url.pathname, { ignoreSearch: true })) ||
            (await caches.match(request, { ignoreSearch: true })) ||
            (await shell.match('/')) ||
            (await shell.match('/offline.html')) ||
            new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } })
          );
        }
      })(),
    );
    return;
  }

  if (sameOrigin) {
    // 3. Hashed build assets are immutable → cache-first.
    if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/')) {
      event.respondWith(cacheFirst(request, SHELL, 400));
      return;
    }
    // 4. Everything else on our origin (route data, manifest…): network-first.
    event.respondWith(networkFirst(request, PAGES, 120).catch(() => new Response('', { status: 504 })));
    return;
  }

  // 5. Cross-origin artwork.
  if (request.destination === 'image') {
    event.respondWith(cacheFirst(request, ART, ART_MAX).catch(() => new Response('', { status: 504 })));
    return;
  }

  // 6. Music provider metadata (JSON). Supabase/auth/ads requests are left alone.
  if (url.hostname === 'api.audius.co' || url.hostname === 'api.jamendo.com' || url.hostname === 'itunes.apple.com') {
    event.respondWith(networkFirst(request, META, META_MAX, 8000).catch(() => new Response(JSON.stringify({ data: [] }), { status: 504, headers: { 'Content-Type': 'application/json' } })));
  }
});
