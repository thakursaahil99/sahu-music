// Builds the Android app and puts the APK on the website's download page.  Run: npm run apk
//
//   npm run apk             build, then copy
//   npm run apk -- --copy   only copy an APK that is already built
//
// Pass app configuration through the environment (all optional):
//   SUPABASE_URL, SUPABASE_ANON_KEY, AUDIUS_APP_NAME, ADS_ENABLED, ADMOB_BANNER_ANDROID
//
// The arm64 APK is used (covers practically every Android phone sold since 2017) because
// Cloudflare Pages rejects files over 25 MiB. If the APK is larger than that, host it elsewhere
// (for example a free GitHub Release) and set NEXT_PUBLIC_APK_URL instead.
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const mobile = join(root, 'apps', 'mobile');
const built = join(mobile, 'build', 'app', 'outputs', 'flutter-apk', 'app-arm64-v8a-release.apk');
const target = join(root, 'apps', 'web', 'public', 'downloads', 'sahu-music.apk');

/** Settings already saved for the website are reused, so one setup covers both. */
function fromWebEnv(name) {
  const file = join(root, 'apps', 'web', '.env.local');
  if (!existsSync(file)) return '';
  const m = new RegExp(`^${name}=(.*)$`, 'm').exec(readFileSync(file, 'utf8'));
  return m ? m[1].trim() : '';
}
const settings = {
  SUPABASE_URL: process.env.SUPABASE_URL || fromWebEnv('NEXT_PUBLIC_SUPABASE_URL'),
  SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY || fromWebEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
  YOUTUBE_API_KEY: process.env.YOUTUBE_API_KEY || fromWebEnv('NEXT_PUBLIC_YOUTUBE_API_KEY'),
  AUDIUS_APP_NAME: process.env.AUDIUS_APP_NAME,
  ADS_ENABLED: process.env.ADS_ENABLED,
  ADMOB_BANNER_ANDROID: process.env.ADMOB_BANNER_ANDROID,
};

if (!process.argv.includes('--copy')) {
  // only safe characters reach the command line
  const defines = Object.entries(settings)
    .filter(([, v]) => v && /^[A-Za-z0-9_.:/=-]{1,300}$/.test(v))
    .map(([k, v]) => `--dart-define=${k}=${v}`);
  console.log(`YouTube in the app: ${settings.YOUTUBE_API_KEY ? 'on' : 'off (no key)'}`);
  console.log('Building release APK (this takes a few minutes)…');
  const res = spawnSync('flutter', ['build', 'apk', '--release', '--split-per-abi', ...defines], { cwd: mobile, stdio: 'inherit', shell: true });
  if (res.status !== 0) {
    console.error(`flutter build failed (exit ${res.status}).`);
    process.exit(res.status ?? 1);
  }
}

if (!existsSync(built)) {
  console.error(`No APK at ${built}. Run "npm run apk" without --copy first.`);
  process.exit(1);
}
mkdirSync(dirname(target), { recursive: true });
copyFileSync(built, target);
const mb = statSync(target).size / 1048576;
console.log(`Copied ${mb.toFixed(1)} MB APK to apps/web/public/downloads/sahu-music.apk`);
if (mb > 25) {
  console.warn('WARNING: over 25 MiB. Cloudflare Pages will reject this file. Host the APK elsewhere and set NEXT_PUBLIC_APK_URL.');
}
console.log('Now rebuild the website: npm run build:web');
