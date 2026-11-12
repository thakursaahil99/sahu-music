'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { validateTitle } from '@sahu/shared';
import { Icon } from '@/components/icons';
import { ConfigNotice, EmptyState, ListSkeleton } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { useLibrary } from '@/lib/library';
import { useToast } from '@/lib/toast';

export default function ProfilePage() {
  const { user, profile, loading, configured, updateProfile, signOut, changePassword, deleteAccount } = useAuth();
  const lib = useLibrary();
  const toast = useToast();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');

  useEffect(() => {
    setName(profile?.display_name ?? '');
  }, [profile?.display_name]);

  if (loading) return <ListSkeleton count={4} />;

  if (!user) {
    return (
      <div className="mx-auto max-w-xl">
        <h1 className="mb-4 text-3xl font-extrabold text-white">Profile</h1>
        {!configured && (
          <div className="mb-5">
            <ConfigNotice title="Accounts are not configured on this deployment">
              <p>Accounts need the SAHU MUSIC backend and a database. Deploy on Vercel with the free Neon database connected (see README). Guest mode works without it.</p>
            </ConfigNotice>
          </div>
        )}
        <EmptyState title="You are browsing as a guest" text="Your favourites, playlists and history are stored on this device.">
          <div className="flex justify-center gap-3">
            <Link href="/login" className="btn-gold">Log in</Link>
            <Link href="/signup" className="btn-outline">Sign up</Link>
          </div>
        </EmptyState>
      </div>
    );
  }

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const err = validateTitle(name, 50);
    if (err) return toast(err, 'error');
    setBusy(true);
    const res = await updateProfile(name.trim());
    setBusy(false);
    toast(res ?? 'Profile updated', res ? 'error' : 'info');
  };

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="mb-6 text-3xl font-extrabold text-white">Profile</h1>
      <div className="card mb-6 flex items-center gap-4">
        <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-gold/15 text-gold">
          <Icon name="user" size={30} />
        </span>
        <div className="min-w-0">
          <p className="truncate text-lg font-bold text-white">{profile?.display_name || 'Listener'}</p>
          <p className="truncate text-sm text-muted">{user.email}</p>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-3 gap-3 text-center">
        {[
          ['Favourites', lib.favorites.length, '/library?tab=favorites'],
          ['Playlists', lib.playlists.length, '/library?tab=playlists'],
          ['History', lib.history.length, '/library?tab=history'],
        ].map(([label, n, href]) => (
          <Link key={label as string} href={href as string} className="card !p-4 hover:ring-gold/50">
            <p className="text-2xl font-extrabold text-gold">{n as number}</p>
            <p className="text-xs text-muted">{label as string}</p>
          </Link>
        ))}
      </div>

      <form onSubmit={save} className="card mb-6 space-y-3">
        <label htmlFor="display-name" className="block text-sm font-medium text-white">Display name</label>
        <input id="display-name" className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={50} />
        <button type="submit" className="btn-gold" disabled={busy || !name.trim()}>
          {busy ? 'Saving…' : 'Save'}
        </button>
      </form>

      <form
        className="card mb-6 space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          if (next.length < 8) return toast('New password must be at least 8 characters.', 'error');
          setBusy(true);
          const err = await changePassword(current, next);
          setBusy(false);
          if (!err) {
            setCurrent('');
            setNext('');
          }
          toast(err ?? 'Password changed. Other devices were signed out.', err ? 'error' : 'info');
        }}
      >
        <h2 className="text-sm font-medium text-white">Change password</h2>
        <input type="password" className="input" placeholder="Current password" aria-label="Current password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} maxLength={128} />
        <input type="password" className="input" placeholder="New password (8+ characters)" aria-label="New password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} maxLength={128} />
        <button type="submit" className="btn-outline" disabled={busy || !current || !next}>Change password</button>
      </form>

      <div className="mb-6 flex gap-3">
        <Link href="/settings" className="btn-outline">
          <Icon name="settings" size={16} /> Settings
        </Link>
        <button type="button" className="btn-outline" onClick={() => void signOut()}>
          Log out
        </button>
      </div>

      <div className="card border border-red-500/20">
        <h2 className="text-sm font-medium text-white">Delete account</h2>
        <p className="mt-1 text-xs text-muted">Removes your account, favourites, playlists, history and preferences for good.</p>
        {confirmDelete ? (
          <form
            className="mt-3 space-y-3"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              const err = await deleteAccount(deletePassword);
              setBusy(false);
              toast(err ?? 'Your account was deleted.', err ? 'error' : 'info');
            }}
          >
            <input type="password" className="input" placeholder="Enter your password to confirm" aria-label="Password" autoComplete="current-password" value={deletePassword} onChange={(e) => setDeletePassword(e.target.value)} maxLength={128} />
            <div className="flex gap-3">
              <button type="submit" className="btn-outline !border-red-500/60 !text-red-300" disabled={busy || !deletePassword}>Delete for good</button>
              <button type="button" className="btn-outline" onClick={() => setConfirmDelete(false)}>Cancel</button>
            </div>
          </form>
        ) : (
          <button type="button" className="mt-3 text-sm font-semibold text-red-300 hover:text-red-200" onClick={() => setConfirmDelete(true)}>Delete my account…</button>
        )}
      </div>
    </div>
  );
}
