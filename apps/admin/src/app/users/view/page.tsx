'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { PageTitle, useAdmin } from '@/components/AdminShell';
import { api } from '@/lib/backend';
import { ago, dateTime } from '@/lib/format';

interface Track {
  title?: string;
  artist?: string;
  provider?: string;
  providerTrackId?: string;
  duration?: number;
}
interface Detail {
  account: {
    id: string;
    email: string;
    display_name: string | null;
    role: 'user' | 'admin';
    is_blocked: boolean;
    created_at: string;
    last_seen_at: string | null;
    preferences: Record<string, unknown> | null;
    favorites: number;
    playlists: number;
    plays: number;
  };
  playlists: { id: string; title: string; description: string | null; is_public: boolean; created_at: string; tracks: Track[] }[];
  favorites: { track: Track; created_at: string }[];
  history: { track: Track; played_at: string }[];
  sessions: { client: string; created_at: string; expires_at: string }[];
}

const PREF_LABELS: Record<string, string> = { autoplayNext: 'Autoplay next song', dataSaver: 'Data saver', adsEnabled: 'Show ads' };

function Section({ title, children, count }: { title: string; children: ReactNode; count?: number }) {
  return (
    <section className="card">
      <h2 className="mb-3 text-sm font-bold uppercase tracking-widest text-gold">
        {title}
        {count !== undefined && <span className="ml-2 text-muted">{count}</span>}
      </h2>
      {children}
    </section>
  );
}

function TrackLine({ t, when }: { t: Track; when?: string }) {
  return (
    <li className="flex items-baseline justify-between gap-3 py-1.5">
      <span className="min-w-0 truncate text-white">
        {t.title || 'Untitled'} <span className="text-muted">· {t.artist || 'Unknown artist'}</span>
      </span>
      <span className="shrink-0 text-xs text-muted">{t.provider}{when ? ` · ${ago(when)}` : ''}</span>
    </li>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[8.5rem,1fr] gap-3 py-1.5 text-sm">
      <dt className="text-muted">{label}</dt>
      <dd className="min-w-0 break-words text-white">{children}</dd>
    </div>
  );
}

export default function UserPage() {
  const { notify, user: me } = useAdmin();
  const [id, setId] = useState<string | null>(null);
  const [data, setData] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [name, setName] = useState('');
  const [confirmDelete, setConfirmDelete] = useState('');
  const [openPlaylist, setOpenPlaylist] = useState<string | null>(null);

  useEffect(() => setId(new URLSearchParams(window.location.search).get('id')), []);

  const load = useCallback(() => {
    if (!id) return;
    api<Detail>('POST', 'admin/user', { id }).then(
      (d) => {
        setData(d);
        setName(d.account.display_name ?? '');
        setError(null);
      },
      (e) => setError(e instanceof Error ? e.message : 'Could not load this user'),
    );
  }, [id]);
  useEffect(load, [load]);

  const act = async (op: string, extra: Record<string, unknown> = {}, done = 'Saved') => {
    if (!id) return false;
    setBusy(true);
    try {
      await api('POST', 'admin/user-action', { id, op, ...extra });
      notify(done);
      setBusy(false);
      return true;
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Failed', 'error');
      setBusy(false);
      return false;
    }
  };

  if (error) {
    return (
      <>
        <PageTitle title="User" />
        <p className="rounded-lg bg-red-950/60 px-3 py-2 text-sm text-red-300" role="alert">{error}</p>
        <Link href="/users" className="btn-outline mt-4">← All users</Link>
      </>
    );
  }
  if (!data) return <p className="text-sm text-muted">Loading…</p>;

  const a = data.account;
  const self = a.id === me.id;
  const prefs = Object.entries(a.preferences ?? {});

  return (
    <>
      <Link href="/users" className="mb-3 inline-block text-sm font-semibold text-gold hover:text-gold-soft">← All users</Link>
      <PageTitle title={a.display_name || 'No name'} subtitle={a.email}>
        <div className="flex flex-wrap gap-1.5">
          {a.role === 'admin' && <span className="rounded-full bg-gold/15 px-2.5 py-1 text-xs font-semibold text-gold">Admin</span>}
          {a.is_blocked && <span className="rounded-full bg-red-500/15 px-2.5 py-1 text-xs font-semibold text-red-300">Blocked</span>}
          {self && <span className="rounded-full bg-white/10 px-2.5 py-1 text-xs font-semibold text-white">You</span>}
        </div>
      </PageTitle>

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          ['Favourites', a.favorites],
          ['Playlists', a.playlists],
          ['Plays', a.plays],
          ['Signed-in devices', data.sessions.length],
        ].map(([label, n]) => (
          <div key={label as string} className="card !p-4">
            <p className="text-3xl font-extrabold tabular-nums text-gold">{n as number}</p>
            <p className="mt-1 text-xs text-muted">{label as string}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Account details">
          <dl>
            <Row label="Name">{a.display_name || <span className="text-muted">not given</span>}</Row>
            <Row label="Email">{a.email}</Row>
            <Row label="Role">{a.role === 'admin' ? 'Administrator' : 'Listener'}</Row>
            <Row label="Status">{a.is_blocked ? 'Blocked (cannot save data)' : 'Active'}</Row>
            <Row label="Joined">{dateTime(a.created_at)}</Row>
            <Row label="Last active">{a.last_seen_at ? `${dateTime(a.last_seen_at)} (${ago(a.last_seen_at)})` : 'Never'}</Row>
            <Row label="User ID"><code className="text-xs text-white/70">{a.id}</code></Row>
            <Row label="Settings">
              {prefs.length === 0 ? (
                <span className="text-muted">defaults (never changed)</span>
              ) : (
                <ul>
                  {prefs.map(([k, v]) => (
                    <li key={k}>{PREF_LABELS[k] ?? k}: <span className="text-gold">{typeof v === 'boolean' ? (v ? 'on' : 'off') : JSON.stringify(v)}</span></li>
                  ))}
                </ul>
              )}
            </Row>
          </dl>
          <p className="mt-3 text-xs text-muted">Passwords are stored only as a one-way hash, so nobody (admins included) can see them. You can set a new one below.</p>
        </Section>

        <Section title="Manage account">
          <div className="space-y-4">
            <form
              className="flex gap-2"
              onSubmit={async (e) => {
                e.preventDefault();
                if (await act('rename', { displayName: name }, 'Name changed')) load();
              }}
            >
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={50} aria-label="Display name" />
              <button type="submit" className="btn-outline shrink-0" disabled={busy || !name.trim()}>Rename</button>
            </form>

            <div className="flex flex-wrap gap-2">
              {a.role === 'admin' ? (
                <button type="button" className="btn-outline" disabled={busy || self} onClick={async () => (await act('remove-admin', {}, 'Admin role removed')) && load()}>Remove admin</button>
              ) : (
                <button type="button" className="btn-outline" disabled={busy} onClick={async () => (await act('make-admin', {}, 'Now an administrator')) && load()}>Make admin</button>
              )}
              {a.is_blocked ? (
                <button type="button" className="btn-outline" disabled={busy} onClick={async () => (await act('unblock', {}, 'Unblocked')) && load()}>Unblock</button>
              ) : (
                <button type="button" className="btn-outline !border-red-500/50 !text-red-300" disabled={busy || self} onClick={async () => (await act('block', {}, 'Blocked and signed out')) && load()}>Block</button>
              )}
              <button type="button" className="btn-outline" disabled={busy || data.sessions.length === 0} onClick={async () => (await act('sign-out', {}, 'Signed out on every device')) && load()}>Sign out everywhere</button>
            </div>

            <form
              className="flex gap-2"
              onSubmit={async (e) => {
                e.preventDefault();
                if (newPassword.length < 8) return notify('The new password must be at least 8 characters.', 'error');
                if (await act('reset-password', { password: newPassword }, 'Password changed. The user was signed out everywhere.')) {
                  setNewPassword('');
                  load();
                }
              }}
            >
              <input type="text" className="input" placeholder="New password (8+ characters)" aria-label="New password" autoComplete="off" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} maxLength={128} />
              <button type="submit" className="btn-outline shrink-0" disabled={busy || !newPassword}>Set password</button>
            </form>

            {!self && (
              <div className="rounded-xl border border-red-500/25 p-3">
                <p className="text-sm text-white">Delete this account</p>
                <p className="mt-0.5 text-xs text-muted">Removes the account, its playlists, favourites, history and settings for good. Type the email to confirm.</p>
                <div className="mt-2 flex gap-2">
                  <input className="input" placeholder={a.email} aria-label="Type the email to confirm" value={confirmDelete} onChange={(e) => setConfirmDelete(e.target.value)} />
                  <button
                    type="button"
                    className="btn-outline shrink-0 !border-red-500/60 !text-red-300"
                    disabled={busy || confirmDelete.trim().toLowerCase() !== a.email.toLowerCase()}
                    onClick={async () => {
                      if (await act('delete', {}, 'Account deleted')) window.location.href = '/admin/users/';
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            )}
          </div>
        </Section>

        <Section title="Playlists" count={data.playlists.length}>
          {data.playlists.length === 0 ? (
            <p className="text-sm text-muted">No playlists.</p>
          ) : (
            <ul className="divide-y divide-coal-line">
              {data.playlists.map((p) => (
                <li key={p.id} className="py-2">
                  <button type="button" className="flex w-full items-baseline justify-between gap-3 text-left" onClick={() => setOpenPlaylist(openPlaylist === p.id ? null : p.id)} aria-expanded={openPlaylist === p.id}>
                    <span className="min-w-0 truncate font-semibold text-white">{p.title}</span>
                    <span className="shrink-0 text-xs text-muted">{p.tracks.length} songs · {ago(p.created_at)}{p.is_public ? ' · public' : ''}</span>
                  </button>
                  {openPlaylist === p.id && (
                    <ol className="mt-1 pl-3 text-sm">
                      {p.tracks.length === 0 ? <li className="text-muted">Empty</li> : p.tracks.map((t, i) => <TrackLine key={i} t={t} />)}
                    </ol>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Favourites" count={a.favorites}>
          {data.favorites.length === 0 ? (
            <p className="text-sm text-muted">No favourites.</p>
          ) : (
            <ul className="max-h-80 overflow-y-auto pr-1 text-sm">{data.favorites.map((f, i) => <TrackLine key={i} t={f.track} when={f.created_at} />)}</ul>
          )}
        </Section>

        <Section title="Listening history" count={a.plays}>
          {data.history.length === 0 ? (
            <p className="text-sm text-muted">Nothing played while signed in.</p>
          ) : (
            <ul className="max-h-80 overflow-y-auto pr-1 text-sm">{data.history.map((h, i) => <TrackLine key={i} t={h.track} when={h.played_at} />)}</ul>
          )}
        </Section>

        <Section title="Signed-in devices" count={data.sessions.length}>
          {data.sessions.length === 0 ? (
            <p className="text-sm text-muted">Not signed in anywhere.</p>
          ) : (
            <ul className="divide-y divide-coal-line text-sm">
              {data.sessions.map((s, i) => (
                <li key={i} className="flex justify-between gap-3 py-1.5">
                  <span className="text-white">{s.client === 'mobile' ? 'Android app' : s.client === 'admin' ? 'Admin console' : 'Website / PWA'}</span>
                  <span className="text-xs text-muted">signed in {ago(s.created_at)} · until {dateTime(s.expires_at, false)}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </>
  );
}
