import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || '';
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() || '';

/** The admin panel also uses ONLY the anon key. Admin power comes from the signed-in user's role + RLS. */
function isServiceRoleKey(k: string): boolean {
  try {
    return JSON.parse(atob(k.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))?.role === 'service_role';
  } catch {
    return k.startsWith('sb_secret_');
  }
}

function make(): SupabaseClient | null {
  if (!url || !key || !/^https?:\/\//.test(url)) return null;
  if (isServiceRoleKey(key)) {
    console.error('[SAHU MUSIC admin] Refusing to use a service-role key in the browser. Use the anon/publishable key.');
    return null;
  }
  return createClient(url, key);
}

export const supabase = make();
export const audiusAppName = process.env.NEXT_PUBLIC_AUDIUS_APP_NAME?.trim() || 'SAHU_MUSIC';
