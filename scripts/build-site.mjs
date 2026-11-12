// Builds the website and the admin console into one static site: apps/web/out, with the admin
// console at /admin. This is what Vercel serves, next to the /api backend.
//
//   npm run build:site
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const run = (args) => {
  const r = spawnSync('npm', args, { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' });
  if (r.status !== 0) process.exit(r.status ?? 1);
};

run(['run', 'build', '-w', '@sahu/web']);
run(['run', 'build', '-w', '@sahu/admin']);

// Every deploy gets its own service-worker version. A browser only looks for a new version of an
// installed app (PWA) when sw.js itself changes, so without this the "new version available"
// notice never appears and an installed app keeps showing the old pages.
const swFile = join(root, 'apps', 'web', 'out', 'sw.js');
const build = (process.env.VERCEL_GIT_COMMIT_SHA || '').slice(0, 7) || Date.now().toString(36);
const sw = readFileSync(swFile, 'utf8');
const stamped = sw.replace(/const VERSION = '([^']*)';/, (_, v) => `const VERSION = '${v}-${build}';`);
if (stamped === sw) {
  console.error('sw.js: VERSION line not found, installed apps would not be told about this update.');
  process.exit(1);
}
writeFileSync(swFile, stamped);
console.log(`Service worker version: ${/const VERSION = '([^']*)'/.exec(stamped)[1]}`);

const from = join(root, 'apps', 'admin', 'out');
const to = join(root, 'apps', 'web', 'out', 'admin');
if (!existsSync(join(from, 'index.html'))) {
  console.error('Admin build output is missing.');
  process.exit(1);
}
rmSync(to, { recursive: true, force: true });
cpSync(from, to, { recursive: true });
console.log('Site ready in apps/web/out (admin console at /admin).');
