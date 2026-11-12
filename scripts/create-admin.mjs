// Create the administrator account, or make an existing account an admin, in the Neon database.
//
//   npm run admin -- EMAIL PASSWORD     create the account (or reset its password) and make it admin
//   npm run admin -- EMAIL              make an account that already signed up an admin
//
// The database address comes from DATABASE_URL, or from `--env-file FILE`, or (if neither is set)
// it is pulled from the linked Vercel project into a temporary file that is deleted afterwards.
// The password is hashed here (scrypt, same format as the API) and only the hash is stored.
import { execFileSync } from 'node:child_process';
import { randomBytes, scrypt as scryptCb } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { neon } from '@neondatabase/serverless';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2).filter((a, i, all) => a !== '--env-file' && all[i - 1] !== '--env-file');
const [rawEmail, password] = args;
const email = (rawEmail ?? '').trim().toLowerCase();

if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || (password !== undefined && (password.length < 8 || password.length > 128))) {
  console.error('Usage: npm run admin -- EMAIL [PASSWORD]   (password: 8–128 characters)');
  process.exit(1);
}

function loadEnv(file) {
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
  }
}

const envArg = process.argv.indexOf('--env-file');
if (envArg > 0) loadEnv(process.argv[envArg + 1]);
if (!process.env.DATABASE_URL) {
  const dir = mkdtempSync(join(tmpdir(), 'sahu-env-'));
  const file = join(dir, '.env');
  try {
    console.log('Fetching the database address from Vercel…');
    execFileSync('vercel', ['env', 'pull', file, '--environment=production', '--yes'], { cwd: root, stdio: 'ignore', shell: process.platform === 'win32' });
    if (existsSync(file)) loadEnv(file);
  } catch {
    /* handled below */
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
if (!process.env.DATABASE_URL) {
  console.error('No DATABASE_URL. Run "vercel link" first, or pass --env-file with the Neon connection string.');
  process.exit(1);
}

const N = 32768, R = 8, P = 1;
function hashPassword(pw) {
  const salt = randomBytes(16);
  return new Promise((res, rej) =>
    scryptCb(pw.normalize('NFKC'), salt, 64, { N, r: R, p: P, maxmem: 128 * N * R * 2 }, (e, key) =>
      e ? rej(e) : res(`scrypt$${N}$${R}$${P}$${salt.toString('base64')}$${key.toString('base64')}`),
    ),
  );
}

async function main() {
  const sql = neon(process.env.DATABASE_URL);
  let [user] = await sql.query('select id from users where email = $1', [email]);
  if (!user && password === undefined) {
    console.error(`No account for ${email}. Sign up on the website first, or pass a password to create it.`);
    process.exitCode = 1;
    return;
  }
  if (password !== undefined) {
    const hash = await hashPassword(password);
    [user] = await sql.query(
      `insert into users (email, password_hash) values ($1, $2)
       on conflict (email) do update set password_hash = excluded.password_hash returning id`,
      [email, hash],
    );
    await sql.query('delete from sessions where user_id = $1', [user.id]);
  }
  await sql.query(
    `insert into profiles (id, display_name, role, is_blocked) values ($1, $2, 'admin', false)
     on conflict (id) do update set role = 'admin', is_blocked = false`,
    [user.id, 'Admin'],
  );
  console.log(`${email} is an administrator. Sign in at /admin.`);
}

main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
