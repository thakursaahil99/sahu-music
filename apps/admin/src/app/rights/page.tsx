'use client';

import { useCallback, useEffect, useState } from 'react';
import { isSafeId } from '@sahu/shared';
import { PageTitle, useAdmin } from '@/components/AdminShell';
import { supabase } from '@/lib/supabase';

type Status = 'pending' | 'approved' | 'rejected' | 'blocked';
type Perm = 'allowed' | 'not_allowed' | 'unconfirmed';

interface RightsRow {
  id: string;
  song_id: string | null;
  provider: string;
  provider_track_id: string;
  rights_status: Status;
  streaming_permitted: boolean;
  commercial_use: Perm;
  advertising: Perm;
  license: string | null;
  evidence: string | null;
  verified_at: string | null;
  songs: { title: string; artist_name: string; artwork_url: string | null; permalink: string | null; is_public: boolean } | null;
}

const STATUSES: Status[] = ['pending', 'approved', 'rejected', 'blocked'];
const PERMS: Perm[] = ['unconfirmed', 'allowed', 'not_allowed'];
const PAGE = 20;

export default function RightsPage() {
  const { notify } = useAdmin();
  const [status, setStatus] = useState<Status>('pending');
  const [rows, setRows] = useState<RightsRow[]>([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const [blockProvider, setBlockProvider] = useState('audius');
  const [blockId, setBlockId] = useState('');
  const [blockReason, setBlockReason] = useState('');
  const reload = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    supabase!
      .from('music_rights')
      .select('*, songs(title, artist_name, artwork_url, permalink, is_public)', { count: 'exact' })
      .eq('rights_status', status)
      .order('created_at', { ascending: false })
      .range(page * PAGE, page * PAGE + PAGE - 1)
      .then(({ data, error, count: c }) => {
        if (!alive) return;
        if (error) notify(error.message, 'error');
        setRows((data as unknown as RightsRow[]) ?? []);
        setCount(c ?? 0);
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [status, page, tick, notify]);

  const patch = async (row: RightsRow, changes: Partial<RightsRow>) => {
    const { error } = await supabase!.from('music_rights').update(changes).eq('id', row.id);
    if (error) notify(error.message, 'error');
    return !error;
  };

  /** Decide a track. Publishing happens only after the rights record is approved (the DB enforces the order). */
  const decide = async (row: RightsRow, next: Status) => {
    if (next === 'approved' && !row.streaming_permitted) {
      return notify('Cannot approve: the provider did not confirm streaming permission for this track.', 'error');
    }
    if (!(await patch(row, { rights_status: next }))) return;
    if (row.song_id) {
      const { error } = await supabase!.from('songs').update({ is_public: next === 'approved' }).eq('id', row.song_id);
      if (error) return notify(error.message, 'error');
    }
    notify(next === 'approved' ? 'Approved and published' : `Marked ${next}; track is not playable`);
    reload();
  };

  const blockTrack = async (e: React.FormEvent) => {
    e.preventDefault();
    const id = blockId.trim();
    if (!isSafeId(id)) return notify('Enter a valid provider track ID (letters, numbers, - or _).', 'error');
    const { error } = await supabase!.from('music_rights').upsert(
      { provider: blockProvider, provider_track_id: id, rights_status: 'blocked', streaming_permitted: false, evidence: blockReason.trim().slice(0, 500) || 'Blocked by administrator.' },
      { onConflict: 'provider,provider_track_id' },
    );
    if (error) return notify(error.message, 'error');
    // if this track is also in the curated catalogue, the DB trigger has already unpublished it
    notify('Track blocked. It disappears from the website and apps on their next load.');
    setBlockId('');
    setBlockReason('');
    setStatus('blocked');
    reload();
  };

  const pages = Math.max(1, Math.ceil(count / PAGE));

  return (
    <>
      <PageTitle
        title="Rights verification"
        subtitle="Nothing in the curated catalogue is public until it is approved here. Blocking a track also removes it from live provider results across every platform."
      />

      <form onSubmit={blockTrack} className="card mb-6 grid gap-3 md:grid-cols-[10rem,1fr,1.5fr,auto] md:items-end">
        <div>
          <label htmlFor="bp" className="mb-1 block text-xs text-muted">Provider</label>
          <select id="bp" className="input" value={blockProvider} onChange={(e) => setBlockProvider(e.target.value)}>
            <option value="audius">audius</option>
            <option value="jamendo">jamendo</option>
          </select>
        </div>
        <div>
          <label htmlFor="bid" className="mb-1 block text-xs text-muted">Provider track ID (see “Source &amp; rights” on any track)</label>
          <input id="bid" className="input" value={blockId} onChange={(e) => setBlockId(e.target.value)} maxLength={64} />
        </div>
        <div>
          <label htmlFor="br" className="mb-1 block text-xs text-muted">Reason (e.g. takedown request)</label>
          <input id="br" className="input" value={blockReason} onChange={(e) => setBlockReason(e.target.value)} maxLength={500} />
        </div>
        <button type="submit" className="btn-outline !border-red-500/60 !text-red-300" disabled={!blockId.trim()}>Block track</button>
      </form>

      <div className="mb-4 flex flex-wrap gap-2" role="tablist" aria-label="Rights status">
        {STATUSES.map((s) => (
          <button key={s} type="button" role="tab" aria-selected={status === s} className={`chip capitalize ${status === s ? 'chip-active' : ''}`} onClick={() => { setPage(0); setStatus(s); }}>
            {s}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="card text-sm text-muted">No {status} records.</p>
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => (
            <li key={r.id} className="card !p-4">
              <div className="flex flex-wrap items-start gap-4">
                {r.songs?.artwork_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={r.songs.artwork_url} alt="" loading="lazy" className="h-14 w-14 rounded-md object-cover" />
                ) : (
                  <div className="h-14 w-14 rounded-md bg-coal-light" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-white">{r.songs?.title ?? '(live provider track, not in catalogue)'}</p>
                  <p className="truncate text-sm text-muted">{r.songs?.artist_name ?? ''}</p>
                  <p className="mt-1 break-all text-xs text-muted">
                    {r.provider} · {r.provider_track_id} · streaming {r.streaming_permitted ? 'confirmed by provider' : 'NOT confirmed'} · licence: {r.license || 'not stated'}
                    {r.songs?.is_public ? ' · PUBLIC' : ''}
                  </p>
                  {r.evidence && <p className="mt-1 text-xs text-white/60">{r.evidence}</p>}
                  {r.songs?.permalink && <a href={r.songs.permalink} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block text-xs text-gold underline">Open on provider to review</a>}
                </div>
                <div className="flex flex-wrap items-end gap-3">
                  <label className="text-xs text-muted">
                    Commercial use
                    <select className="input mt-1 !py-1.5" value={r.commercial_use} onChange={async (e) => (await patch(r, { commercial_use: e.target.value as Perm })) && reload()}>
                      {PERMS.map((x) => <option key={x} value={x}>{x}</option>)}
                    </select>
                  </label>
                  <label className="text-xs text-muted">
                    Advertising
                    <select className="input mt-1 !py-1.5" value={r.advertising} onChange={async (e) => (await patch(r, { advertising: e.target.value as Perm })) && reload()}>
                      {PERMS.map((x) => <option key={x} value={x}>{x}</option>)}
                    </select>
                  </label>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2 border-t border-coal-line pt-3">
                {status !== 'approved' && r.song_id && <button type="button" className="btn-gold !py-1.5" onClick={() => void decide(r, 'approved')}>Approve &amp; publish</button>}
                {status !== 'rejected' && <button type="button" className="btn-outline !py-1.5" onClick={() => void decide(r, 'rejected')}>Reject</button>}
                {status !== 'blocked' && <button type="button" className="btn-outline !border-red-500/60 !py-1.5 !text-red-300" onClick={() => void decide(r, 'blocked')}>Block</button>}
                {status !== 'pending' && <button type="button" className="btn-outline !py-1.5" onClick={() => void decide(r, 'pending')}>Back to pending</button>}
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 flex items-center justify-between text-sm text-muted">
        <span>{count} record{count === 1 ? '' : 's'}</span>
        <div className="flex items-center gap-3">
          <button type="button" className="btn-outline !px-3 !py-1.5" disabled={page === 0} onClick={() => setPage((x) => x - 1)}>Previous</button>
          <span>Page {page + 1} of {pages}</span>
          <button type="button" className="btn-outline !px-3 !py-1.5" disabled={page + 1 >= pages} onClick={() => setPage((x) => x + 1)}>Next</button>
        </div>
      </div>
    </>
  );
}
