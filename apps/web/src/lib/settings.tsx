'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useAuth } from './auth';
import { readLocal, writeLocal } from './hooks';
import { supabase } from './supabase';

export interface Settings {
  /** Continue to the next track in the queue automatically. */
  autoplayNext: boolean;
  /** Use smaller artwork to save data. */
  dataSaver: boolean;
  /** Show the optional ad slot (only has an effect when ads are configured). */
  adsEnabled: boolean;
}

const DEFAULTS: Settings = { autoplayNext: true, dataSaver: false, adsEnabled: true };
const KEY = 'sahu.settings.v1';

interface SettingsValue {
  settings: Settings;
  update(patch: Partial<Settings>): void;
}

const Ctx = createContext<SettingsValue>({ settings: DEFAULTS, update: () => undefined });
export const useSettings = () => useContext(Ctx);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [settings, setSettings] = useState<Settings>(DEFAULTS);

  useEffect(() => {
    setSettings({ ...DEFAULTS, ...readLocal<Partial<Settings>>(KEY, {}) });
  }, []);

  // Signed-in users: preferences follow the account.
  const userId = user?.id;
  useEffect(() => {
    if (!supabase || !userId) return;
    let alive = true;
    supabase
      .from('user_preferences')
      .select('preferences')
      .eq('user_id', userId)
      .maybeSingle()
      .then(({ data }) => {
        if (!alive || !data?.preferences) return;
        setSettings((s) => {
          const merged = { ...s, ...(data.preferences as Partial<Settings>) };
          writeLocal(KEY, merged);
          return merged;
        });
      });
    return () => {
      alive = false;
    };
  }, [userId]);

  const update = useCallback(
    (patch: Partial<Settings>) => {
      setSettings((s) => {
        const next = { ...s, ...patch };
        writeLocal(KEY, next);
        if (supabase && userId) {
          void supabase
            .from('user_preferences')
            .upsert({ user_id: userId, preferences: next, updated_at: new Date().toISOString() })
            .then(() => undefined, () => undefined);
        }
        return next;
      });
    },
    [userId],
  );

  const value = useMemo(() => ({ settings, update }), [settings, update]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
