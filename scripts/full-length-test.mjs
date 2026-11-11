// Verifies that the stream URLs SAHU MUSIC plays are COMPLETE songs, not 30-second previews.
// Run: npm run test:playback
//
// For several real Audius tracks whose API duration is longer than 30 s it checks that
//   1. the app's playback URL is the official full-track endpoint /v1/tracks/{id}/stream
//   2. the server serves audio and reports the total file size
//   3. that size is consistent with the full duration (a 30 s clip would be far too small)
//   4. the LAST bytes of the file can be fetched (the stream really goes to the end)
const BASE = 'https://api.audius.co/v1';
const APP = 'app_name=SAHU_MUSIC';
const QUERIES = ['hindi', 'punjabi', 'bollywood', 'devotional'];
const PER_QUERY = 2;
const MIN_KBPS = 48; // lowest plausible bitrate for a full-length encode

const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

async function pick(query) {
  const res = await fetch(`${BASE}/tracks/search?query=${encodeURIComponent(query)}&limit=25&${APP}`);
  if (!res.ok) throw new Error(`search "${query}" HTTP ${res.status}`);
  const rows = (await res.json()).data ?? [];
  return rows
    .filter((t) => t.is_streamable && !t.is_stream_gated && !t.is_delete && !t.is_unlisted && t.stream_conditions == null)
    .filter((t) => t.duration > 60 && t.duration < 900) // real songs, clearly longer than 30 s
    .slice(0, PER_QUERY);
}

async function verify(t) {
  const url = `${BASE}/tracks/${t.id}/stream?${APP}`; // exactly what AudiusProvider.streamUrl() builds
  const head = await fetch(url, { headers: { Range: 'bytes=0-1023' } });
  if (head.status !== 206 && head.status !== 200) throw new Error(`stream HTTP ${head.status}`);
  const type = head.headers.get('content-type') ?? '';
  if (!type.startsWith('audio/')) throw new Error(`not audio: ${type}`);
  await head.arrayBuffer();
  const total = Number((head.headers.get('content-range') ?? '').split('/')[1]);
  if (!Number.isFinite(total) || total <= 0) throw new Error('server did not report the total size');

  const kbps = (total * 8) / t.duration / 1000;
  if (kbps < MIN_KBPS) throw new Error(`file too small for ${fmt(t.duration)} (${Math.round(kbps)} kbps) - looks like a clip`);
  const secondsAt320 = (total * 8) / 320_000; // even at the highest MP3 bitrate the file is longer than 30 s
  if (secondsAt320 <= 30) throw new Error(`only ${Math.round(secondsAt320)} s of audio even at 320 kbps`);

  const tail = await fetch(url, { headers: { Range: `bytes=${total - 2048}-${total - 1}` } });
  if (tail.status !== 206) throw new Error(`could not read the end of the file (HTTP ${tail.status})`);
  const tailBytes = (await tail.arrayBuffer()).byteLength;
  if (tailBytes !== 2048) throw new Error(`end of file returned ${tailBytes} bytes`);

  return `${fmt(t.duration)} long, ${(total / 1048576).toFixed(1)} MB, ~${Math.round(kbps)} kbps, end of file readable`;
}

let failed = 0;
let checked = 0;
for (const q of QUERIES) {
  let tracks = [];
  try {
    tracks = await pick(q);
  } catch (e) {
    failed++;
    console.log(`FAIL  ${e.message}`);
    continue;
  }
  for (const t of tracks) {
    checked++;
    try {
      console.log(`PASS  [${q}] "${t.title.slice(0, 40)}" - ${await verify(t)}`);
    } catch (e) {
      failed++;
      console.log(`FAIL  [${q}] "${t.title.slice(0, 40)}" - ${e.message}`);
    }
  }
}
// Internet Archive: an openly licensed full-length file
checked++;
try {
  const q = encodeURIComponent('(title:(bhajan) OR subject:(bhajan)) AND mediatype:audio AND licenseurl:*creativecommons.org*');
  const s = await (await fetch(`https://archive.org/advancedsearch.php?q=${q}&fl[]=identifier&rows=3&sort[]=downloads+desc&output=json`)).json();
  let done = false;
  for (const { identifier } of s.response.docs) {
    const m = await (await fetch(`https://archive.org/metadata/${identifier}`)).json();
    const f = (m.files ?? []).find((x) => /mp3/i.test(x.format ?? '') && Number(x.length) > 60 && Number(x.length) < 1500);
    if (!f) continue;
    const res = await fetch(`https://archive.org/download/${identifier}/${encodeURIComponent(f.name)}`, { headers: { Range: 'bytes=0-1023' } });
    const total = Number((res.headers.get('content-range') ?? '').split('/')[1]);
    await res.arrayBuffer();
    if (res.status !== 206 || !total) throw new Error(`archive stream HTTP ${res.status}`);
    const kbps = (total * 8) / Number(f.length) / 1000;
    if (kbps < 32) throw new Error(`archive file too small for its length (${Math.round(kbps)} kbps)`);
    console.log(`PASS  [archive] "${String(f.title ?? f.name).slice(0, 40)}" - ${fmt(Number(f.length))} long, ${(total / 1048576).toFixed(1)} MB, licence ${m.metadata.licenseurl}`);
    done = true;
    break;
  }
  if (!done) throw new Error('no openly licensed full-length file found');
} catch (e) {
  failed++;
  console.log(`FAIL  [archive] ${e.message}`);
}

// Live radio: a Bollywood station serves continuous audio
checked++;
try {
  const rows = await (await fetch('https://de1.api.radio-browser.info/json/stations/search?tag=bollywood&hidebroken=true&order=clickcount&reverse=true&limit=20', { headers: { 'User-Agent': 'SAHU_MUSIC/1.0' } })).json();
  let done = false;
  for (const r of rows.filter((x) => x.url_resolved.startsWith('https://') && !x.hls)) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    try {
      const res = await fetch(r.url_resolved, { signal: ctrl.signal });
      const type = res.headers.get('content-type') ?? '';
      if (!res.ok || !/audio|mpeg|aac|ogg/.test(type)) continue;
      const reader = res.body.getReader();
      let bytes = 0;
      while (bytes < 64 * 1024) {
        const { value, done: end } = await reader.read();
        if (end) break;
        bytes += value.byteLength;
      }
      ctrl.abort();
      if (bytes < 64 * 1024) continue;
      console.log(`PASS  [radio] "${r.name}" - live ${type}, ${Math.round(bytes / 1024)} KB received and still streaming`);
      done = true;
      break;
    } catch {
      /* station offline – try the next */
    } finally {
      clearTimeout(timer);
    }
  }
  if (!done) throw new Error('no Bollywood station answered');
} catch (e) {
  failed++;
  console.log(`FAIL  [radio] ${e.message}`);
}

console.log(failed ? `\n${failed} of ${checked} failed` : `\nAll ${checked} checks passed: full-length songs and live radio`);
process.exit(failed || checked === 0 ? 1 : 0);
