// Applies db/migrations/*.sql to the Neon database, in name order, each once.
//
//   npm run db:migrate                    uses DATABASE_URL_UNPOOLED or DATABASE_URL
//   node scripts/db-migrate.mjs --env-file path/to/.env
//
// Runs on every Vercel build (see vercel.json). Without a database URL it does nothing, so
// local builds and forks without a database still work.
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool, neonConfig } from '@neondatabase/serverless';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, 'db', 'migrations');

const envFileArg = process.argv.indexOf('--env-file');
if (envFileArg > 0) {
  const file = process.argv[envFileArg + 1];
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
  }
}

const url = (process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL || '').trim();

async function main() {
  if (!url) {
    console.log('db-migrate: no DATABASE_URL, skipping (accounts stay off on this build).');
    return;
  }
  if (typeof WebSocket !== 'undefined') neonConfig.webSocketConstructor = WebSocket;
  const pool = new Pool({ connectionString: url });
  const client = await pool.connect();
  try {
    await client.query(`create table if not exists schema_migrations (
      name text primary key, checksum text not null, applied_at timestamptz not null default now())`);
    const done = new Map((await client.query('select name, checksum from schema_migrations')).rows.map((r) => [r.name, r.checksum]));
    const files = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.sql')).sort() : [];
    let applied = 0;
    for (const name of files) {
      const sql = readFileSync(join(dir, name), 'utf8');
      const checksum = createHash('sha256').update(sql).digest('hex');
      if (done.has(name)) {
        if (done.get(name) !== checksum) console.warn(`db-migrate: ${name} changed after it was applied; add a new migration file instead.`);
        continue;
      }
      await client.query('begin');
      try {
        await client.query(sql);
        await client.query('insert into schema_migrations (name, checksum) values ($1, $2)', [name, checksum]);
        await client.query('commit');
      } catch (e) {
        await client.query('rollback');
        throw new Error(`${name}: ${e.message}`);
      }
      console.log(`db-migrate: applied ${name}`);
      applied++;
    }
    console.log(`db-migrate: ${applied ? `${applied} migration(s) applied` : 'database is up to date'}.`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(`db-migrate failed: ${e.message}`);
  process.exitCode = 1;
});
