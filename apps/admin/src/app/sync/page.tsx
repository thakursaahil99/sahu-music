'use client';

import { useState } from 'react';
import { AUDIUS_GENRES, AudiusProvider, isPlayable } from '@sahu/api';
import type { Track } from '@sahu/models';
import { sanitizeQuery } from '@sahu/shared';
import { PageTitle, useAdmin } from '@/components/AdminShell';
import { api, audiusAppName, reportError } from '@/lib/backend';

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
      const q = sanitizeQuery(query);
      if (mode === 'search' && q.length < 2) throw new Error('Enter a search term (at least 2 characters).');
      const list = mode === 'search' ? await audius.searchTracks(q, { limit }) : await audius.getTrending({ genre: genre || undefined, limit });
      setTracks(list);
      setSelected(new Set(list.filter((t) => isPlayable(t)).map((t) => t.providerTrackId)));
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Fetch failed';
      notify(message, 'error');
      reportError('audius', mode === 'search' ? '/v1/tracks/search' : '/v1/tracks/trending', message);
    }
    setBusy(false);
  };

  const importSelected = async () => {
    if (!tracks) return;
    setBusy(true);
    // Only tracks the provider confirms as streamable can enter the catalogue at all.
    const chosen = tracks.filter((t) => selected.has(t.providerTrackId) && isPlayable(t));
    let imported = 0;
    let failed = 0;
    try {
      for (let i = 0; i < chosen.length; i += 20) {
        const r = await api<{ imported: number; failed: number }>('POST', 'admin/import', { provider: 'audius', tracks: chosen.slice(i, i + 20) });
        imported += r.imported;
        failed += r.failed;
      }
    } catch (e) {
      setBusy(false);
      return notify(e instanceof Error ? e.message : 'Sync failed', 'error');
    }
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
