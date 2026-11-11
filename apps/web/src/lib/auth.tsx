'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase, supabaseConfigured } from './supabase';

export interface Profile {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  role: 'user' | 'admin';
}

interface AuthValue {
  configured: boolean;
  loading: boolean;
  user: User | null;
  profile: Profile | null;
  signIn(email: string, password: string): Promise<string | null>;
  signUp(email: string, password: string, displayName: string): Promise<{ error: string | null; needsConfirmation: boolean }>;
  signOut(): Promise<void>;
  updateProfile(displayName: string): Promise<string | null>;
  resetPassword(email: string): Promise<string | null>;
}

const Ctx = createContext<AuthValue | null>(null);

export function useAuth(): AuthValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth must be used inside AuthProvider');
  return v;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(supabaseConfigured);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => setUser(session?.user ?? null));
    return () => sub.subscription.unsubscribe();
  }, []);

  const userId = user?.id;
  useEffect(() => {
    if (!supabase || !userId) {
      setProfile(null);
      return;
    }
    let alive = true;
    supabase
      .from('profiles')
      .select('id, display_name, avatar_url, role')
      .eq('id', userId)
      .maybeSingle()
      .then(({ data }) => {
        if (alive) setProfile((data as Profile | null) ?? null);
      });
    return () => {
      alive = false;
    };
  }, [userId]);

  const signIn = useCallback(async (email: string, password: string) => {
    if (!supabase) return 'Supabase is not configured.';
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return error?.message ?? null;
  }, []);

  const signUp = useCallback(async (email: string, password: string, displayName: string) => {
    if (!supabase) return { error: 'Supabase is not configured.', needsConfirmation: false };
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { display_name: displayName }, emailRedirectTo: `${window.location.origin}/` },
    });
    return { error: error?.message ?? null, needsConfirmation: !error && !data.session };
  }, []);

  const signOut = useCallback(async () => {
    await supabase?.auth.signOut();
  }, []);

  const updateProfile = useCallback(
    async (displayName: string) => {
      if (!supabase || !userId) return 'Not signed in.';
      const { error } = await supabase.from('profiles').update({ display_name: displayName }).eq('id', userId);
      if (!error) setProfile((p) => (p ? { ...p, display_name: displayName } : p));
      return error?.message ?? null;
    },
    [userId],
  );

  const resetPassword = useCallback(async (email: string) => {
    if (!supabase) return 'Supabase is not configured.';
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/login/` });
    return error?.message ?? null;
  }, []);

  const value = useMemo<AuthValue>(
    () => ({ configured: supabaseConfigured, loading, user, profile, signIn, signUp, signOut, updateProfile, resetPassword }),
    [loading, user, profile, signIn, signUp, signOut, updateProfile, resetPassword],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
