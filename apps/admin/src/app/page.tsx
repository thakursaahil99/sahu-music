'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { PageTitle } from '@/components/AdminShell';
import { audiusAppName, supabase } from '@/lib/supabase';

interface Stats {
  users: number; admins: number; blocked_users: number; songs: number; public_songs: number; artists: number; albums: number;
  playlists: number; favorites: number; plays_24h: number; plays_7d: number; rights_pending: number; rights_approved: number;
  rights_blocked: number; api_errors_24h: number;
  plays_by_day: { day: string; plays: number }[];
  top_tracks: { title: string; artist: string; plays: number }[];
}

interface Health { ok: boolean; ms: number; detail: string }

function Stat({ label, value, href, warn }: { label: string; value: number; href?: string; warn?: boolean }) {
  const body = (
    <div className={`card !p-4 ${href ? 'transition hover:ring-gold/50' : ''}`}>
      <p className={`text-3xl font-extrabold tabular-nums ${warn && value > 0 ? 'text-amber-400' : 'text-gold'}`}>{value.toLocaleString()}</p>
      <p className="mt-1 text-xs text-muted">{label}</p>
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [health, setHealth] = useState<Health | null>(null);

  useEffect(() => {
    supabase!.rpc('admin_stats').then(({ data, error: err }) => {
      if (err) setError(err.message);
      else setStats(data as Stats);
    });
    const started = performance.now();
    fetch(`https://api.audius.co/v1/tracks/trending?limit=1&app_name=${encodeURIComponent(audiusAppName)}`)
      .then(async (r) => {
        const ms = Math.round(performance.now() - started);
        const n = r.ok ? ((await r.json())?.data?.length ?? 0) : 0;
        setHealth({ ok: r.ok && n > 0, ms, detail: r.ok ? `HTTP 200 · ${n} track returned` : `HTTP ${r.status}` });
      })
      .catch(() => setHealth({ ok: false, ms: Math.round(performance.now() - started), detail: 'Network error' }));
  }, []);

  return (
    <>
      <PageTitle title="Dashboard" subtitle="Live figures from your Supabase database." />
      {error && <p className="mb-4 rounded-lg bg-red-950/60 px-3 py-2 text-sm text-red-300" role="alert">Could not load analytics: {error}</p>}
      {!stats && !error && <p className="text-sm text-muted">Loading…</p>}
      {stats && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Registered users" value={stats.users} href="/users" />
            <Stat label="Plays · last 24 h (signed-in users)" value={stats.plays_24h} />
            <Stat label="Plays · last 7 days (signed-in users)" value={stats.plays_7d} />
            <Stat label="Favourites saved" value={stats.favorites} />
            <Stat label="Catalogue songs" value={stats.songs} href="/songs" />
            <Stat label="Public songs" value={stats.public_songs} href="/songs" />
            <Stat label="Rights pending review" value={stats.rights_pending} href="/rights" warn />
            <Stat label="Blocked / rejected tracks" value={stats.rights_blocked} href="/rights" />
            <Stat label="Artists" value={stats.artists} href="/artists" />
            <Stat label="Albums" value={stats.albums} href="/albums" />
            <Stat label="Playlists" value={stats.playlists} href="/playlists" />
            <Stat label="API errors · last 24 h" value={stats.api_errors_24h} href="/errors" warn />
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <section className="card">
              <h2 className="mb-3 text-sm font-bold uppercase tracking-widest text-gold">Plays per day · last 14 days</h2>
              {stats.plays_by_day.length === 0 ? (
                <p className="text-sm text-muted">No plays recorded yet. Guest listening is not tracked.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="text-left text-xs text-muted"><tr><th scope="col" className="pb-2 font-medium">Day</th><th scope="col" className="pb-2 text-right font-medium">Plays</th></tr></thead>
                  <tbody className="divide-y divide-coal-line">
                    {stats.plays_by_day.map((d) => (
                      <tr key={d.day}><td className="py-1.5 text-white/90">{d.day}</td><td className="py-1.5 text-right tabular-nums text-white">{d.plays}</td></tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
            <section className="card">
              <h2 className="mb-3 text-sm font-bold uppercase tracking-widest text-gold">Top tracks · last 30 days</h2>
              {stats.top_tracks.length === 0 ? (
                <p className="text-sm text-muted">No plays recorded yet.</p>
              ) : (
                <ol className="space-y-2 text-sm">
                  {stats.top_tracks.map((t, i) => (
                    <li key={`${t.title}-${i}`} className="flex items-baseline gap-3">
                      <span className="w-5 text-right tabular-nums text-muted">{i + 1}</span>
                      <span className="min-w-0 flex-1 truncate text-white">{t.title} <span className="text-muted">· {t.artist}</span></span>
                      <span className="tabular-nums text-gold">{t.plays}</span>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          </div>
        </>
      )}

      <section className="card mt-6">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-widest text-gold">Provider health</h2>
        <div className="flex items-center justify-between text-sm">
          <span className="text-white">Audius API</span>
          {health ? (
            <span className={health.ok ? 'text-emerald-300' : 'text-red-400'}>{health.ok ? 'Operational' : 'Failing'} · {health.detail} · {health.ms} ms</span>
          ) : (
            <span className="text-muted">Checking…</span>
          )}
        </div>
      </section>
    </>
  );
}
