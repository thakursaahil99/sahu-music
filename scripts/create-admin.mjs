// Create (or reset) the main administrator account in Supabase.
//
//   npm run admin -- EMAIL PASSWORD
//
// Needs two values in the environment (this terminal only, never in a file that ships):
//   SUPABASE_URL                 project URL (falls back to NEXT_PUBLIC_SUPABASE_URL in apps/*/.env.local)
//   SUPABASE_SERVICE_ROLE_KEY    Project Settings → API → service_role key
//
// What it does:
//   1. creates the account with the email already confirmed, or resets the password if it exists
//   2. sets role = 'admin' and clears the blocked flag on its profile
// Nothing is written to disk. The password is sent only to your Supabase project.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function fromEnvFiles(name) {
  for (const app of ['web', 'admin']) {
    const file = join(root, 'apps', app, '.env.local');
    if (!existsSync(file)) continue;
    const line = readFileSync(file, 'utf8').split(/\r?\n/).find((l) => l.startsWith(`${name}=`));
    const value = line?.slice(name.length + 1).trim().replace(/^["']|["']$/g, '');
    if (value) return value;
  }
  return '';
}

const email = (process.argv[2] ?? process.env.ADMIN_EMAIL ?? '').trim().toLowerCase();
const password = process.argv[3] ?? process.env.ADMIN_PASSWORD ?? '';
const url = (process.env.SUPABASE_URL ?? '').trim() || fromEnvFiles('NEXT_PUBLIC_SUPABASE_URL');
const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();

function fail(message) {
  console.error(message);
  process.exit(1);
}

if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !password) {
  fail('Usage: npm run admin -- EMAIL PASSWORD');
}
if (password.length < 6 || password.length > 72) fail('The password must be 6 to 72 characters long.');
if (!url) {
  fail(`No Supabase project found.
  1. Create a project at https://supabase.com and run the files in supabase/migrations in order (SQL editor).
  2. Put NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in apps/web/.env.local and apps/admin/.env.local.
  3. Run this command again.`);
}
if (!serviceKey) {
  fail(`SUPABASE_SERVICE_ROLE_KEY is not set.
  Copy the service_role key from Supabase → Project Settings → API and set it for this terminal only:
    PowerShell:  $env:SUPABASE_SERVICE_ROLE_KEY = "..."
    bash:        export SUPABASE_SERVICE_ROLE_KEY="..."
  Do not save it in any .env file used by the apps.`);
}

const supabase = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

async function findUser() {
  for (let page = 1; ; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`Could not list users: ${error.message}`);
    const hit = data.users.find((u) => u.email?.toLowerCase() === email);
    if (hit) return hit;
    if (data.users.length < 200) return null;
  }
}

async function main() {
  let user = await findUser();
  if (user) {
    const { error } = await supabase.auth.admin.updateUserById(user.id, { password, email_confirm: true });
    if (error) throw new Error(`Could not reset the password: ${error.message}`);
    console.log(`Account ${email} already existed; password reset.`);
  } else {
    const { data, error } = await supabase.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) throw new Error(`Could not create the account: ${error.message}`);
    user = data.user;
    console.log(`Account ${email} created.`);
  }

  const { error: roleError } = await supabase
    .from('profiles')
    .upsert({ id: user.id, role: 'admin', is_blocked: false }, { onConflict: 'id' });
  if (roleError) {
    throw new Error(`Could not grant the admin role: ${roleError.message}
  Have the files in supabase/migrations been run on this project?`);
  }

  const { data: profile, error: readError } = await supabase.from('profiles').select('role, is_blocked').eq('id', user.id).single();
  if (readError || profile.role !== 'admin' || profile.is_blocked) {
    throw new Error(`The admin role did not stick: ${readError?.message ?? JSON.stringify(profile)}`);
  }
  console.log(`${email} is now an administrator. Sign in to the admin console with this email and password.`);
}

main().catch((err) => fail(err.message));
