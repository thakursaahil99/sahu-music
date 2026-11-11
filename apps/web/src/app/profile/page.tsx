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
  const { user, profile, loading, configured, updateProfile, signOut } = useAuth();
  const lib = useLibrary();
  const toast = useToast();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

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
              <p>Connect a free Supabase project to enable sign-up and login (see README). Guest mode works without it.</p>
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

      <div className="flex gap-3">
        <Link href="/settings" className="btn-outline">
          <Icon name="settings" size={16} /> Settings
        </Link>
        <button type="button" className="btn-outline" onClick={() => void signOut()}>
          Log out
        </button>
      </div>
    </div>
  );
}
