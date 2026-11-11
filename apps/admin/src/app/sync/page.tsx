'use client';

import { useState } from 'react';
import { AUDIUS_GENRES, AudiusProvider, isPlayable } from '@sahu/api';
import type { Track } from '@sahu/models';
import { sanitizeQuery } from '@sahu/shared';
import { PageTitle, useAdmin } from '@/components/AdminShell';
import { audiusAppName, supabase } from '@/lib/supabase';

const audius = new AudiusProvider({ appName: audiusAppName });

export default function SyncPage() {
  const { notify } = useAdmin();
  const [mode, setMode] = useState<'trending' | 'search'>('trending');
  const [genre, setGenre] = useState('');
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(25);
  const [tracks, setTracks] = useState<Track[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<string | null>(null);

  const fetchPreview = async () => {
    setBusy(true);
    setLog(null);
    try {
      const { data: prov } = await supabase!.from('music_providers').select('enabled').eq('id', 'audius').maybeSingle();
      if (prov && !prov.enabled) throw new Error('The Audius provider is disabled. Enable it under Music providers first.');
      const q = sanitizeQuery(query);
      if (mode === 'search' && q.length < 2) throw new Error('Enter a search term (at least 2 characters).');
      const list = mode === 'search' ? await audius.searchTracks(q, { limit }) : await audius.getTrending({ genre: genre || undefined, limit });
      setTracks(list);
      setSelected(new Set(list.filter((t) => isPlayable(t)).map((t) => t.providerTrackId)));
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Fetch failed';
      notify(message, 'error');
      void supabase!.from('api_errors').insert({ provider: 'audius', endpoint: mode === 'search' ? '/v1/tracks/search' : '/v1/tracks/trending', status: 0, message: message.slice(0, 300), client: 'admin' });
    }
    setBusy(false);
  };

  const importSelected = async () => {
    if (!tracks) return;
    setBusy(true);
    let imported = 0;
    let failed = 0;
    for (const t of tracks) {
      // Only tracks the provider confirms as streamable can enter the catalogue at all.
      if (!selected.has(t.providerTrackId) || !isPlayable(t)) continue;
      let artistId: string | null = null;
      if (t.artistId) {
        const { data } = await supabase!
          .from('artists')
          .upsert({ provider: 'audius', provider_artist_id: t.artistId, name: t.artist }, { onConflict: 'provider,provider_artist_id' })
          .select('id')
          .maybeSingle();
        artistId = (data?.id as string) ?? null;
      }
      // is_public is deliberately omitted: new songs default to private, existing ones keep their state.
      const { data: song, error } = await supabase!
        .from('songs')
        .upsert(
          { provider: 'audius', provider_track_id: t.providerTrackId, title: t.title.slice(0, 300), artist_name: t.artist, artist_id: artistId, artwork_url: t.artwork, stream_url: t.streamUrl, permalink: t.permalink ?? null, duration: Math.round(t.duration), genre: t.genre ?? null },
          { onConflict: 'provider,provider_track_id' },
        )
        .select('id')
        .maybeSingle();
      if (error || !song) {
        failed++;
        continue;
      }
      // ignoreDuplicates: an existing decision (approved / rejected / blocked) is never overwritten by a sync.
      await supabase!.from('music_rights').upsert(
        { song_id: song.id, provider: 'audius', provider_track_id: t.providerTrackId, rights_status: 'pending', streaming_permitted: true, commercial_use: t.rights.commercialUse, advertising: 'unconfirmed', license: t.rights.license, evidence: t.rights.basis },
        { onConflict: 'provider,provider_track_id', ignoreDuplicates: true },
      );
      imported++;
    }
    await supabase!.from('music_providers').update({ last_sync_at: new Date().toISOString() }).eq('id', 'audius');
    setBusy(false);
    setLog(`${imported} track${imported === 1 ? '' : 's'} synchronised${failed ? `, ${failed} failed` : ''}. New tracks are waiting under Rights verification → pending. Nothing was published.`);
    notify('Sync complete');
  };

  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <>
      <PageTitle title="Catalogue sync" subtitle="Fetch real tracks from the Audius API and add them to the curated catalogue as pending. They only become public after you approve them under Rights verification." />

      <div className="card mb-6 grid gap-4 md:grid-cols-[10rem,1fr,8rem,auto] md:items-end">
        <div>
          <label htmlFor="mode" className="mb-1 block text-xs text-muted">Source</label>
          <select id="mode" className="input" value={mode} onChange={(e) => setMode(e.target.value as 'trending' | 'search')}>
            <option value="trending">Trending chart</option>
            <option value="search">Search</option>
          </select>
        </div>
        {mode === 'trending' ? (
          <div>
            <label htmlFor="genre" className="mb-1 block text-xs text-muted">Genre</label>
            <select id="genre" className="input" value={genre} onChange={(e) => setGenre(e.target.value)}>
              <option value="">All genres</option>
              {AUDIUS_GENRES.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>
        ) : (
          <div>
            <label htmlFor="q" className="mb-1 block text-xs text-muted">Search term</label>
            <input id="q" className="input" value={query} onChange={(e) => setQuery(e.target.value)} maxLength={80} placeholder="e.g. punjabi" />
          </div>
        )}
        <div>
          <label htmlFor="limit" className="mb-1 block text-xs text-muted">Limit</label>
          <select id="limit" className="input" value={limit} onChange={(e) => setLimit(Number(e.target.value))}>
            {[10, 25, 50].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
        <button type="button" className="btn-gold" disabled={busy} onClick={() => void fetchPreview()}>{busy ? 'Working…' : 'Fetch from Audius'}</button>
      </div>

      {log && <p className="mb-4 rounded-lg bg-gold/10 px-3 py-2 text-sm text-gold-soft" role="status">{log}</p>}

      {tracks && (
        <>
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm text-muted">{tracks.length} returned · {selected.size} selected</p>
            <button type="button" className="btn-gold" disabled={busy || selected.size === 0} onClick={() => void importSelected()}>Import {selected.size} as pending</button>
          </div>
          <ul className="divide-y divide-coal-line overflow-hidden rounded-xl ring-1 ring-white/5">
            {tracks.map((t) => {
              const ok = isPlayable(t);
              return (
                <li key={t.providerTrackId} className="flex items-center gap-3 bg-coal/40 px-4 py-2.5">
                  <input type="checkbox" className="h-4 w-4 accent-[#D7AE55]" checked={selected.has(t.providerTrackId)} disabled={!ok} onChange={() => toggle(t.providerTrackId)} aria-label={`Select ${t.title}`} />
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {t.artwork ? <img src={t.artwork} alt="" loading="lazy" className="h-10 w-10 rounded object-cover" /> : <div className="h-10 w-10 rounded bg-coal-light" />}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-white">{t.title}</p>
                    <p className="truncate text-xs text-muted">{t.artist} · {t.genre ?? 'no genre'} · licence: {t.rights.license ?? 'not stated'}</p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${ok ? 'bg-emerald-500/15 text-emerald-300' : 'bg-red-500/15 text-red-300'}`}>{ok ? 'Streamable' : 'Not streamable'}</span>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </>
  );
}
