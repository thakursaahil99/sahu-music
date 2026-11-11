// Supabase Edge Function: sync-catalogue
//
// Pulls trending tracks from Audius into the curated catalogue as PENDING rights
// records. Nothing becomes public here – an admin must approve each track in the
// admin panel (and the database trigger refuses to publish unapproved songs).
//
// Deploy:  supabase functions deploy sync-catalogue
// Call:    POST /functions/v1/sync-catalogue  { "genre": "Devotional", "limit": 25 }
//          with the signed-in ADMIN user's JWT in the Authorization header.
//
// The service-role key lives only here (auto-injected by Supabase), never in a frontend.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

// Simple per-admin rate limit (per function instance): 1 sync every 10 seconds.
const lastCall = new Map<string, number>();

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const url = Deno.env.get('SUPABASE_URL')!;
  const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const auth = req.headers.get('Authorization') ?? '';

  // 1. Who is calling?
  const userClient = createClient(url, anon, { global: { headers: { Authorization: auth } } });
  const { data: userData } = await userClient.auth.getUser();
  const user = userData?.user;
  if (!user) return json({ error: 'Not authenticated' }, 401);

  // 2. Admins only.
  const admin = createClient(url, service);
  const { data: profile } = await admin.from('profiles').select('role, is_blocked').eq('id', user.id).maybeSingle();
  if (!profile || profile.role !== 'admin' || profile.is_blocked) return json({ error: 'Admin only' }, 403);

  // 3. Rate limit.
  const now = Date.now();
  if (now - (lastCall.get(user.id) ?? 0) < 10_000) return json({ error: 'Too many requests. Wait a few seconds.' }, 429);
  lastCall.set(user.id, now);

  // 4. Validate input.
  let body: { genre?: unknown; limit?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    /* empty body is fine */
  }
  const genre = typeof body.genre === 'string' && /^[A-Za-z0-9 &/\-]{1,40}$/.test(body.genre) ? body.genre : undefined;
  const limit = Math.min(50, Math.max(1, Number(body.limit) || 25));

  // 5. Is the provider enabled?
  const { data: provider } = await admin.from('music_providers').select('enabled').eq('id', 'audius').maybeSingle();
  if (!provider?.enabled) return json({ error: 'Audius provider is disabled' }, 409);

  // 6. Fetch from Audius.
  const app = encodeURIComponent(Deno.env.get('AUDIUS_APP_NAME') ?? 'SAHU_MUSIC');
  const q = new URLSearchParams({ limit: String(limit), time: 'week' });
  if (genre) q.set('genre', genre);
  const base = 'https://api.audius.co/v1';
  const res = await fetch(`${base}/tracks/trending?${q}&app_name=${app}`, { headers: { Accept: 'application/json' } });
  if (!res.ok) {
    await admin.from('api_errors').insert({ provider: 'audius', endpoint: '/v1/tracks/trending', status: res.status, message: `Sync failed: HTTP ${res.status}`, client: 'edge' });
    return json({ error: `Audius responded ${res.status}` }, 502);
  }
  // deno-lint-ignore no-explicit-any
  const tracks: any[] = (await res.json())?.data ?? [];

  let imported = 0;
  let skipped = 0;
  for (const t of tracks) {
    const streamable = t?.is_streamable === true && !t.is_stream_gated && !t.is_delete && !t.is_unlisted && t.is_available !== false && t.stream_conditions == null;
    if (!streamable || typeof t.id !== 'string' || !/^[A-Za-z0-9]{1,32}$/.test(t.id)) {
      skipped++;
      continue;
    }
    let artistId: string | null = null;
    if (typeof t.user?.id === 'string') {
      const { data: artist } = await admin
        .from('artists')
        .upsert(
          { provider: 'audius', provider_artist_id: t.user.id, name: t.user.name || t.user.handle || 'Unknown artist', image_url: t.user.profile_picture?.['480x480'] ?? null, verified: !!t.user.is_verified },
          { onConflict: 'provider,provider_artist_id' },
        )
        .select('id')
        .maybeSingle();
      artistId = artist?.id ?? null;
    }
    // is_public is NOT set here: existing songs keep their state, new songs default to false.
    const { data: song, error } = await admin
      .from('songs')
      .upsert(
        {
          provider: 'audius',
          provider_track_id: t.id,
          title: String(t.title).slice(0, 300),
          artist_name: t.user?.name || t.user?.handle || 'Unknown artist',
          artist_id: artistId,
          artwork_url: t.artwork?.['480x480'] ?? null,
          stream_url: `${base}/tracks/${t.id}/stream?app_name=${app}`,
          permalink: t.permalink ? `https://audius.co${t.permalink}` : null,
          duration: Number(t.duration) || 0,
          genre: t.genre ?? null,
        },
        { onConflict: 'provider,provider_track_id' },
      )
      .select('id')
      .maybeSingle();
    if (error || !song) {
      skipped++;
      continue;
    }
    // Never overwrite an existing rights decision.
    await admin.from('music_rights').upsert(
      {
        song_id: song.id,
        provider: 'audius',
        provider_track_id: t.id,
        rights_status: 'pending',
        streaming_permitted: true,
        license: t.license ?? null,
        evidence: 'Audius API: is_streamable=true, not stream-gated (auto-imported, awaiting admin review).',
      },
      { onConflict: 'provider,provider_track_id', ignoreDuplicates: true },
    );
    imported++;
  }

  await admin.from('music_providers').update({ last_sync_at: new Date().toISOString() }).eq('id', 'audius');
  return json({ imported, skipped, total: tracks.length });
});
