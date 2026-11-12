'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, ApiError } from './backend';

export interface User {
  id: string;
  email: string;
}

export interface Profile {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  role: 'user' | 'admin';
}

interface AuthValue {
  /** Accounts work on this deployment (the backend and its database answered). */
  configured: boolean;
  loading: boolean;
  user: User | null;
  profile: Profile | null;
  signIn(email: string, password: string): Promise<string | null>;
  signUp(email: string, password: string, displayName: string): Promise<{ error: string | null; needsConfirmation: boolean }>;
  signOut(): Promise<void>;
  updateProfile(displayName: string): Promise<string | null>;
  resetPassword(email: string): Promise<string | null>;
  changePassword(currentPassword: string, newPassword: string): Promise<string | null>;
  deleteAccount(password: string): Promise<string | null>;
}

const Ctx = createContext<AuthValue | null>(null);

export function useAuth(): AuthValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth must be used inside AuthProvider');
  return v;
}

interface Session {
  user: User | null;
  profile: Profile | null;
}

const message = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong.');

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session>({ user: null, profile: null });
  const [configured, setConfigured] = useState(true);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    api<Session>('GET', 'auth/me')
      .then((s) => alive && setSession({ user: s.user, profile: s.profile }))
      .catch((e) => {
        // 404/503: this deployment has no backend or no database. Offline: assume it exists.
        if (alive && e instanceof ApiError && (e.status === 404 || e.status === 503)) setConfigured(false);
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    try {
      const s = await api<Session>('POST', 'auth/login', { email, password });
      setSession({ user: s.user, profile: s.profile });
      return null;
    } catch (e) {
      return message(e);
    }
  }, []);

  const signUp = useCallback(async (email: string, password: string, displayName: string) => {
    try {
      const s = await api<Session>('POST', 'auth/signup', { email, password, displayName });
      setSession({ user: s.user, profile: s.profile });
      return { error: null, needsConfirmation: false };
    } catch (e) {
      return { error: message(e), needsConfirmation: false };
    }
  }, []);

  const signOut = useCallback(async () => {
    await api('POST', 'auth/logout', {}).catch(() => undefined);
    setSession({ user: null, profile: null });
  }, []);

  const updateProfile = useCallback(async (displayName: string) => {
    try {
      await api('POST', 'profile', { displayName });
      setSession((s) => ({ ...s, profile: s.profile ? { ...s.profile, display_name: displayName } : s.profile }));
      return null;
    } catch (e) {
      return message(e);
    }
  }, []);

  /** No email service is connected, so passwords cannot be reset by email yet. */
  const resetPassword = useCallback(async () => 'Password reset by email is not available yet. Contact the site administrator.', []);

  /** Signs out every other device. */
  const changePassword = useCallback(async (currentPassword: string, newPassword: string) => {
    try {
      await api('POST', 'auth/password', { currentPassword, newPassword });
      return null;
    } catch (e) {
      return message(e);
    }
  }, []);

  /** Deletes the account and all its data (favourites, playlists, history, preferences). */
  const deleteAccount = useCallback(async (password: string) => {
    try {
      await api('POST', 'auth/delete', { password });
      setSession({ user: null, profile: null });
      return null;
    } catch (e) {
      return message(e);
    }
  }, []);

  const value = useMemo<AuthValue>(
    () => ({ configured, loading, user: session.user, profile: session.profile, signIn, signUp, signOut, updateProfile, resetPassword, changePassword, deleteAccount }),
    [configured, loading, session, signIn, signUp, signOut, updateProfile, resetPassword, changePassword, deleteAccount],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
