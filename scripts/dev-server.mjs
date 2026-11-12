// Runs the built website + admin panel and the /api backend together, like Vercel does.
//
//   npm run build:site && npm run serve        (database address fetched from the linked Vercel project)
//   npm run serve -- --env-file path/to/.env    (or give it yourself)
//   PORT=4000 npm run serve
//
// Static files come from apps/web/out (the admin panel is inside it at /admin). /api/v1/* goes to
// api/server.ts, bundled on the fly with esbuild.
import { execFileSync } from 'node:child_process';
import { createReadStream, existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createServer } from 'node:http';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'apps', 'web', 'out');

const loadEnv = (file) => {
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
  }
};
const envFileArg = process.argv.indexOf('--env-file');
if (envFileArg > 0) loadEnv(process.argv[envFileArg + 1]);
// No database address given: take it from the linked Vercel project (same database as the live
// site, so the same accounts and admin log-in work locally). Kept in memory only.
if (!process.env.DATABASE_URL) {
  const dir = mkdtempSync(join(tmpdir(), 'sahu-env-'));
  try {
    console.log('Fetching the database address from Vercel…');
    execFileSync('vercel', ['env', 'pull', join(dir, '.env'), '--environment=production', '--yes'], { cwd: root, stdio: 'ignore', shell: process.platform === 'win32' });
    loadEnv(join(dir, '.env'));
  } catch {
    console.warn('Could not reach Vercel ("vercel link" first). Accounts and the admin console stay off.');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const bundle = join(root, 'node_modules', '.cache', 'sahu-api', 'server.mjs');
await build({
  entryPoints: [join(root, 'api', 'server.ts')],
  outfile: bundle,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  packages: 'external',
  logLevel: 'warning',
});
const api = await import(pathToFileURL(bundle).href);

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.txt': 'text/plain',
  '.xml': 'application/xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.apk': 'application/vnd.android.package-archive',
};

async function toRequest(req, port) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) if (v !== undefined) headers.set(k, Array.isArray(v) ? v.join(', ') : v);
  return new Request(`http://localhost:${port}${req.url}`, {
    method: req.method,
    headers,
    body: req.method === 'GET' || req.method === 'HEAD' ? undefined : Buffer.concat(chunks),
  });
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname.startsWith('/api/v1/')) {
    const port = server.address().port;
    const handler = api[req.method] ?? api.GET;
    const response = await handler(await toRequest(req, port));
    const headers = {};
    response.headers.forEach((v, k) => (headers[k] = v));
    res.writeHead(response.status, headers);
    res.end(Buffer.from(await response.arrayBuffer()));
    return;
  }
  let p = decodeURIComponent(url.pathname);
  if (p.endsWith('/')) p += 'index.html';
  let file = normalize(join(outDir, p));
  if (!file.startsWith(outDir)) return res.writeHead(403).end();
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
  if (!existsSync(file)) {
    if (existsSync(`${file}.html`)) file = `${file}.html`;
    else if (existsSync(join(file, 'index.html'))) file = join(file, 'index.html');
    else {
      res.writeHead(404, { 'Content-Type': MIME['.html'] });
      return createReadStream(join(outDir, '404.html')).pipe(res);
    }
  }
  res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream' });
  createReadStream(file).pipe(res);
});

server.listen(Number(process.env.PORT) || 3000, '127.0.0.1', () => {
  console.log(`SAHU MUSIC on http://localhost:${server.address().port}  (API: ${process.env.DATABASE_URL ? 'Neon database' : 'no DATABASE_URL, accounts off'})`);
});
