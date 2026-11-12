// Builds the website and the admin console into one static site: apps/web/out, with the admin
// console at /admin. This is what Vercel serves, next to the /api backend.
//
//   npm run build:site
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const run = (args) => {
  const r = spawnSync('npm', args, { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' });
  if (r.status !== 0) process.exit(r.status ?? 1);
};

run(['run', 'build', '-w', '@sahu/web']);
run(['run', 'build', '-w', '@sahu/admin']);

const from = join(root, 'apps', 'admin', 'out');
const to = join(root, 'apps', 'web', 'out', 'admin');
if (!existsSync(join(from, 'index.html'))) {
  console.error('Admin build output is missing.');
  process.exit(1);
}
rmSync(to, { recursive: true, force: true });
cpSync(from, to, { recursive: true });
console.log('Site ready in apps/web/out (admin console at /admin).');
