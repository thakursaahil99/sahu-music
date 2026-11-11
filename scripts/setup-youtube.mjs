// One step to switch on original film songs (YouTube official player) everywhere.
//
//   npm run youtube -- YOUR_API_KEY            check the key, save it, rebuild website + APK
//   npm run youtube -- YOUR_API_KEY --no-build check and save only
//
// What it does:
//   1. checks the key with one cheap call to the YouTube Data API (1 quota unit)
//   2. writes NEXT_PUBLIC_YOUTUBE_API_KEY to apps/web/.env.local (git-ignored)
//   3. builds the Android APK with the same key and puts it on the download page
//   4. rebuilds the website
// The key is only ever sent to Google.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const envFile = join(root, 'apps', 'web', '.env.local');
const key = (process.argv[2] ?? '').trim();
const build = !process.argv.includes('--no-build');

if (!/^[A-Za-z0-9_-]{20,60}$/.test(key)) {
  console.error(`Usage: npm run youtube -- YOUR_API_KEY

Get a free key (5 minutes):
  1. https://console.cloud.google.com → create a project
  2. "APIs & Services" → Library → "YouTube Data API v3" → Enable
  3. "APIs & Services" → Credentials → Create credentials → API key
  4. Restrict the key: API restriction "YouTube Data API v3"
     (for a public website also add an HTTP-referrer restriction with your site's address)`);
  process.exit(1);
}

async function main() {
  console.log('Checking the key with YouTube…');
  const res = await fetch(
    `https://www.googleapis.com/youtube/v3/videos?part=id&chart=mostPopular&videoCategoryId=10&regionCode=IN&maxResults=1&key=${encodeURIComponent(key)}`,
  );
  if (!res.ok) {
    const reason = (await res.json().catch(() => null))?.error?.message ?? `HTTP ${res.status}`;
    console.error(`YouTube rejected the key: ${reason}
  - Make sure "YouTube Data API v3" is enabled in the same Google Cloud project.
  - If you added an HTTP-referrer restriction, calls from this computer are refused; test without it first, then add it back.`);
    process.exitCode = 1;
    return;
  }
  console.log('Key works.');

  // save for the website (keep any other settings already in the file)
  let env = existsSync(envFile) ? readFileSync(envFile, 'utf8') : '';
  const line = `NEXT_PUBLIC_YOUTUBE_API_KEY=${key}`;
  env = /^NEXT_PUBLIC_YOUTUBE_API_KEY=.*$/m.test(env) ? env.replace(/^NEXT_PUBLIC_YOUTUBE_API_KEY=.*$/m, () => line) : `${env.trimEnd()}${env ? '\n' : ''}${line}\n`;
  writeFileSync(envFile, env);
  console.log('Saved to apps/web/.env.local');

  if (!build) {
    console.log('Done. Run "npm run apk" and "npm run build:web" to rebuild.');
    return;
  }

  const run = (cmd, args) => {
    const r = spawnSync(cmd, args, { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' });
    if (r.status !== 0) throw new Error(`${cmd} failed (exit ${r.status})`);
  };
  console.log('\nBuilding the Android app with YouTube enabled…');
  run('node', ['scripts/build-apk.mjs']);
  console.log('\nBuilding the website…');
  run('npm', ['run', 'build:web']);
  console.log('\nDone. Original film songs now appear in search and in "Bollywood Top Songs".');

}

main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
