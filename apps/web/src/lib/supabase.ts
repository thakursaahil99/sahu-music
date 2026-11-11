import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { setErrorReporter } from '@sahu/api';
import { env } from './config';
import { music } from './music';

/** Refuse to run with a service-role key in the browser, even if someone misconfigures it. */
function isServiceRoleKey(key: string): boolean {
  try {
    const payload = JSON.parse(atob(key.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return payload?.role === 'service_role';
  } catch {
    return key.startsWith('sb_secret_');
  }
}

function make(): SupabaseClient | null {
  if (!env.supabaseUrl || !env.supabaseAnonKey) return null;
  if (!/^https?:\/\//.test(env.supabaseUrl)) return null;
  if (isServiceRoleKey(env.supabaseAnonKey)) {
    console.error('[SAHU MUSIC] A service-role key was supplied as the public key. Refusing to use it. Use the anon/publishable key.');
    return null;
  }
  return createClient(env.supabaseUrl, env.supabaseAnonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });
}

export const supabase = make();
export const supabaseConfigured = supabase !== null;

let bootstrapped = false;
/** Load admin rules (blocked tracks, disabled providers) and wire API error monitoring. */
export async function bootstrapCatalogueRules(): Promise<void> {
  if (!supabase || bootstrapped) return;
  bootstrapped = true;

  let lastReport = 0;
  setErrorReporter((e) => {
    const now = Date.now();
    if (now - lastReport < 15_000) return; // throttle: monitoring must not flood the database
    lastReport = now;
    void supabase!
      .from('api_errors')
      .insert({ provider: e.provider, endpoint: e.endpoint, status: e.status, message: e.message.slice(0, 300), client: 'web' })
      .then(() => undefined, () => undefined);
  });

  try {
    const [blocked, providers] = await Promise.all([
      supabase.from('music_rights').select('provider, provider_track_id').in('rights_status', ['blocked', 'rejected']).limit(5000),
      supabase.from('music_providers').select('id, enabled').eq('enabled', false),
    ]);
    if (blocked.data) music.setBlocklist(blocked.data.map((r) => `${r.provider}:${r.provider_track_id}`));
    if (providers.data) music.setDisabledProviders(providers.data.map((p) => p.id as string));
  } catch {
    /* offline or schema not migrated yet – provider-level rights checks still apply */
  }
}
