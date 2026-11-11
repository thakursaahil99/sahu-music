'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { trackKey, type HistoryEntry, type Track, type UserPlaylist } from '@sahu/models';
import { validateTitle } from '@sahu/shared';
import { useAuth } from './auth';
import { readLocal, writeLocal } from './hooks';
import { supabase } from './supabase';
import { useToast } from './toast';

/**
 * User library: favourites, playlists and listening history.
 * - Guests: stored on this device (localStorage).
 * - Signed-in users: stored in Supabase, protected by Row Level Security.
 * Only metadata is stored – never audio.
 */

interface LibraryState {
  favorites: Track[];
  history: HistoryEntry[];
  playlists: UserPlaylist[];
}

interface LibraryValue extends LibraryState {
  ready: boolean;
  isFavorite(t: Track): boolean;
  toggleFavorite(t: Track): void;
  addHistory(t: Track): void;
  clearHistory(): void;
  createPlaylist(title: string): Promise<string | null>;
  renamePlaylist(id: string, title: string): void;
  deletePlaylist(id: string): void;
  addToPlaylist(id: string, t: Track): void;
  removeFromPlaylist(id: string, t: Track): void;
}

const EMPTY: LibraryState = { favorites: [], history: [], playlists: [] };
const KEY = 'sahu.library.v1';
const HISTORY_MAX = 100;

const Ctx = createContext<LibraryValue | null>(null);
export function useLibrary(): LibraryValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useLibrary must be used inside LibraryProvider');
  return v;
}

/** Demo tracks use temporary blob URLs, so they are never persisted. */
const persistable = (t: Track) => t.provider !== 'demo';

function loadGuest(): LibraryState {
  const s = readLocal<LibraryState>(KEY, EMPTY);
  return {
    favorites: (s.favorites ?? []).filter(persistable),
    history: (s.history ?? []).filter((h) => persistable(h.track)),
    playlists: (s.playlists ?? []).map((p) => ({ ...p, tracks: (p.tracks ?? []).filter(persistable) })),
  };
}

async function loadRemote(userId: string): Promise<LibraryState> {
  const sb = supabase!;
  const [fav, hist, pls] = await Promise.all([
    sb.from('favorites').select('track, created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(1000),
    sb.from('listening_history').select('track, played_at').eq('user_id', userId).order('played_at', { ascending: false }).limit(HISTORY_MAX),
    sb
      .from('playlists')
      .select('id, title, description, is_public, created_at, playlist_songs(track, position)')
      .eq('owner_id', userId)
      .order('created_at', { ascending: false }),
  ]);
  if (fav.error || hist.error || pls.error) throw new Error((fav.error || hist.error || pls.error)!.message);
  return {
    favorites: (fav.data ?? []).map((r) => r.track as Track),
    history: (hist.data ?? []).map((r) => ({ track: r.track as Track, playedAt: r.played_at as string })),
    playlists: (pls.data ?? []).map((p) => ({
      id: p.id as string,
      title: p.title as string,
      description: (p.description as string) ?? '',
      isPublic: !!p.is_public,
      createdAt: p.created_at as string,
      tracks: ((p.playlist_songs as { track: Track; position: number }[]) ?? [])
        .slice()
        .sort((a, b) => a.position - b.position)
        .map((s) => s.track),
    })),
  };
}

export function LibraryProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const toast = useToast();
  const [state, setState] = useState<LibraryState>(EMPTY);
  const [ready, setReady] = useState(false);
  const userId = user?.id ?? null;
  const remote = !!(supabase && userId);
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    if (authLoading) return;
    let alive = true;
    setReady(false);
    if (supabase && userId) {
      loadRemote(userId).then(
        (s) => alive && (setState(s), setReady(true)),
        () => {
          if (!alive) return;
          toast('Could not load your library. Check your connection.', 'error');
          setState(EMPTY);
          setReady(true);
        },
      );
    } else {
      setState(loadGuest());
      setReady(true);
    }
    return () => {
      alive = false;
    };
  }, [userId, authLoading, toast]);

  /** Apply a state change; guests persist to localStorage. */
  const apply = useCallback(
    (fn: (s: LibraryState) => LibraryState) => {
      setState((s) => {
        const next = fn(s);
        if (!remote) writeLocal(KEY, next);
        return next;
      });
    },
    [remote],
  );

  const fail = useCallback(() => toast('Could not save. Check your connection.', 'error'), [toast]);
  const run = useCallback(
    (q: PromiseLike<{ error: unknown }>) => {
      void q.then((r) => r.error && fail(), fail);
    },
    [fail],
  );

  const favKeys = useMemo(() => new Set(state.favorites.map(trackKey)), [state.favorites]);
  const isFavorite = useCallback((t: Track) => favKeys.has(trackKey(t)), [favKeys]);

  const toggleFavorite = useCallback(
    (t: Track) => {
      const key = trackKey(t);
      const has = stateRef.current.favorites.some((f) => trackKey(f) === key);
      apply((s) => ({ ...s, favorites: has ? s.favorites.filter((f) => trackKey(f) !== key) : [t, ...s.favorites] }));
      toast(has ? 'Removed from Favourites' : 'Added to Favourites');
      if (remote && persistable(t)) {
        run(
          has
            ? supabase!.from('favorites').delete().match({ user_id: userId, provider: t.provider, provider_track_id: t.providerTrackId })
            : supabase!.from('favorites').upsert({ user_id: userId, provider: t.provider, provider_track_id: t.providerTrackId, track: t }),
        );
      }
    },
    [apply, remote, run, toast, userId],
  );

  const addHistory = useCallback(
    (t: Track) => {
      const key = trackKey(t);
      const playedAt = new Date().toISOString();
      apply((s) => ({ ...s, history: [{ track: t, playedAt }, ...s.history.filter((h) => trackKey(h.track) !== key)].slice(0, HISTORY_MAX) }));
      if (remote && persistable(t)) {
        run(supabase!.from('listening_history').insert({ user_id: userId, provider: t.provider, provider_track_id: t.providerTrackId, track: t }));
      }
    },
    [apply, remote, run, userId],
  );

  const clearHistory = useCallback(() => {
    apply((s) => ({ ...s, history: [] }));
    if (remote) run(supabase!.from('listening_history').delete().eq('user_id', userId));
  }, [apply, remote, run, userId]);

  const createPlaylist = useCallback(
    async (rawTitle: string): Promise<string | null> => {
      const err = validateTitle(rawTitle);
      if (err) {
        toast(err, 'error');
        return null;
      }
      const title = rawTitle.trim();
      const pl: UserPlaylist = { id: crypto.randomUUID(), title, description: '', isPublic: false, tracks: [], createdAt: new Date().toISOString() };
      if (remote) {
        const { error } = await supabase!.from('playlists').insert({ id: pl.id, owner_id: userId, title, is_public: false });
        if (error) {
          fail();
          return null;
        }
      }
      apply((s) => ({ ...s, playlists: [pl, ...s.playlists] }));
      toast(`Playlist "${title}" created`);
      return pl.id;
    },
    [apply, fail, remote, toast, userId],
  );

  const renamePlaylist = useCallback(
    (id: string, rawTitle: string) => {
      const err = validateTitle(rawTitle);
      if (err) return toast(err, 'error');
      const title = rawTitle.trim();
      apply((s) => ({ ...s, playlists: s.playlists.map((p) => (p.id === id ? { ...p, title } : p)) }));
      if (remote) run(supabase!.from('playlists').update({ title }).eq('id', id));
    },
    [apply, remote, run, toast],
  );

  const deletePlaylist = useCallback(
    (id: string) => {
      apply((s) => ({ ...s, playlists: s.playlists.filter((p) => p.id !== id) }));
      if (remote) run(supabase!.from('playlists').delete().eq('id', id));
      toast('Playlist deleted');
    },
    [apply, remote, run, toast],
  );

  const addToPlaylist = useCallback(
    (id: string, t: Track) => {
      const pl = stateRef.current.playlists.find((p) => p.id === id);
      if (!pl) return;
      if (pl.tracks.some((x) => trackKey(x) === trackKey(t))) return toast('Already in this playlist');
      apply((s) => ({ ...s, playlists: s.playlists.map((p) => (p.id === id ? { ...p, tracks: [...p.tracks, t] } : p)) }));
      toast(`Added to ${pl.title}`);
      if (remote && persistable(t)) {
        const position = Date.now(); // monotonic ordering key
        run(supabase!.from('playlist_songs').insert({ playlist_id: id, provider: t.provider, provider_track_id: t.providerTrackId, track: t, position }));
      }
    },
    [apply, remote, run, toast],
  );

  const removeFromPlaylist = useCallback(
    (id: string, t: Track) => {
      const key = trackKey(t);
      apply((s) => ({ ...s, playlists: s.playlists.map((p) => (p.id === id ? { ...p, tracks: p.tracks.filter((x) => trackKey(x) !== key) } : p)) }));
      if (remote) run(supabase!.from('playlist_songs').delete().match({ playlist_id: id, provider: t.provider, provider_track_id: t.providerTrackId }));
    },
    [apply, remote, run],
  );

  const value = useMemo<LibraryValue>(
    () => ({ ...state, ready, isFavorite, toggleFavorite, addHistory, clearHistory, createPlaylist, renamePlaylist, deletePlaylist, addToPlaylist, removeFromPlaylist }),
    [state, ready, isFavorite, toggleFavorite, addHistory, clearHistory, createPlaylist, renamePlaylist, deletePlaylist, addToPlaylist, removeFromPlaylist],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
