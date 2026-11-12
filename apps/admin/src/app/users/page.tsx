'use client';

import Link from 'next/link';
import { Suspense, useEffect, useState } from 'react';
import { PageTitle, useAdmin } from '@/components/AdminShell';
import { api } from '@/lib/backend';
import { ago, dateTime } from '@/lib/format';

interface UserRow {
  id: string;
  email: string;
  display_name: string | null;
  role: 'user' | 'admin';
  is_blocked: boolean;
  created_at: string;
  last_seen_at: string | null;
  favorites: number;
  playlists: number;
  plays: number;
  sessions: number;
}

const FILTERS = [
  ['all', 'Everyone'],
  ['new7d', 'New this week'],
  ['active7d', 'Active this week'],
  ['admins', 'Admins'],
  ['blocked', 'Blocked'],
] as const;
const SORTS = [
  ['newest', 'Newest first'],
  ['active', 'Recently active'],
  ['name', 'Name A–Z'],
  ['oldest', 'Oldest first'],
] as const;
const PAGE = 25;

function UsersList() {
  const { notify } = useAdmin();
  const [filter, setFilter] = useState<string>('all');
  const [sort, setSort] = useState<string>('newest');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [rows, setRows] = useState<UserRow[]>([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);

  // dashboard links pass ?filter=…
  useEffect(() => {
    const f = new URLSearchParams(window.location.search).get('filter');
    if (f && FILTERS.some(([id]) => id === f)) setFilter(f);
  }, []);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    const t = setTimeout(() => {
      api<{ rows: UserRow[]; count: number }>('POST', 'admin/users', { filter, sort, search: search.trim() || undefined, offset: page * PAGE, limit: PAGE }).then(
        (r) => {
          if (!alive) return;
          setRows(r.rows);
          setCount(r.count);
          setLoading(false);
        },
        (e) => {
          if (!alive) return;
          notify(e instanceof Error ? e.message : 'Could not load users', 'error');
          setLoading(false);
        },
      );
    }, search ? 250 : 0);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [filter, sort, search, page, notify]);

  const pages = Math.max(1, Math.ceil(count / PAGE));

  return (
    <>
      <PageTitle title="Users" subtitle="Everyone who created an account: what they filled in, when they joined, when they were last active and what they saved. Open a user to see everything or to manage the account." />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {FILTERS.map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => {
              setFilter(id);
              setPage(0);
            }}
            className={`rounded-full px-3 py-1.5 text-sm font-semibold ring-1 ${filter === id ? 'bg-gold text-ink ring-gold' : 'text-white/80 ring-coal-line hover:text-white'}`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="mb-4 flex flex-wrap gap-3">
        <input
          type="search"
          className="input max-w-sm"
          placeholder="Search by name or email…"
          aria-label="Search users"
          value={search}
          maxLength={80}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(0);
          }}
        />
        <select className="input w-auto" aria-label="Sort users" value={sort} onChange={(e) => setSort(e.target.value)}>
          {SORTS.map(([id, label]) => (
            <option key={id} value={id}>{label}</option>
          ))}
        </select>
      </div>

      <div className="overflow-x-auto rounded-xl ring-1 ring-white/5">
        <table className="w-full min-w-[820px] text-left text-sm">
          <thead className="bg-coal text-xs uppercase tracking-wider text-muted">
            <tr>
              <th scope="col" className="px-4 py-3 font-semibold">User</th>
              <th scope="col" className="px-4 py-3 font-semibold">Joined</th>
              <th scope="col" className="px-4 py-3 font-semibold">Last active</th>
              <th scope="col" className="px-4 py-3 text-right font-semibold">Favourites</th>
              <th scope="col" className="px-4 py-3 text-right font-semibold">Playlists</th>
              <th scope="col" className="px-4 py-3 text-right font-semibold">Plays</th>
              <th scope="col" className="px-4 py-3 font-semibold">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-coal-line">
            {loading ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-muted">Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-muted">No users here.</td></tr>
            ) : (
              rows.map((u) => (
                <tr key={u.id} className="hover:bg-coal/60">
                  <td className="max-w-[18rem] px-4 py-2.5">
                    <Link href={`/users/view?id=${u.id}`} className="block hover:text-gold">
                      <span className="block truncate font-semibold text-white">{u.display_name || 'No name'}</span>
                      <span className="block truncate text-xs text-muted">{u.email}</span>
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 text-white/85" title={dateTime(u.created_at)}>{ago(u.created_at)}</td>
                  <td className="px-4 py-2.5 text-white/85" title={dateTime(u.last_seen_at)}>{ago(u.last_seen_at)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-white">{u.favorites}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-white">{u.playlists}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-white">{u.plays}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex flex-wrap gap-1">
                      {u.role === 'admin' && <span className="rounded-full bg-gold/15 px-2 py-0.5 text-xs font-semibold text-gold">Admin</span>}
                      {u.is_blocked && <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-xs font-semibold text-red-300">Blocked</span>}
                      {u.sessions > 0 && <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-semibold text-emerald-300">Signed in · {u.sessions}</span>}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex items-center justify-between text-sm text-muted">
        <span>{count} user{count === 1 ? '' : 's'}</span>
        <div className="flex items-center gap-3">
          <button type="button" className="btn-outline !px-3 !py-1.5" disabled={page === 0} onClick={() => setPage((x) => x - 1)}>Previous</button>
          <span>Page {page + 1} of {pages}</span>
          <button type="button" className="btn-outline !px-3 !py-1.5" disabled={page + 1 >= pages} onClick={() => setPage((x) => x + 1)}>Next</button>
        </div>
      </div>
    </>
  );
}

export default function UsersPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>
      <UsersList />
    </Suspense>
  );
}
