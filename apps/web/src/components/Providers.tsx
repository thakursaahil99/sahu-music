'use client';

import { useEffect, type ReactNode } from 'react';
import { AuthProvider } from '@/lib/auth';
import { LibraryProvider } from '@/lib/library';
import { PlayerProvider } from '@/lib/player';
import { SettingsProvider } from '@/lib/settings';
import { bootstrapCatalogueRules } from '@/lib/supabase';
import { ToastProvider } from '@/lib/toast';
import { PwaManager } from './Pwa';

export function Providers({ children }: { children: ReactNode }) {
  useEffect(() => {
    void bootstrapCatalogueRules();
  }, []);
  return (
    <ToastProvider>
      <AuthProvider>
        <SettingsProvider>
          <LibraryProvider>
            <PlayerProvider>
              {children}
              <PwaManager />
            </PlayerProvider>
          </LibraryProvider>
        </SettingsProvider>
      </AuthProvider>
    </ToastProvider>
  );
}
