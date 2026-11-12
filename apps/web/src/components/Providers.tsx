'use client';

import { useEffect, type ReactNode } from 'react';
import { AuthProvider } from '@/lib/auth';
import { LibraryProvider } from '@/lib/library';
import { PlayerProvider } from '@/lib/player';
import { SettingsProvider } from '@/lib/settings';
import { bootstrapCatalogueRules } from '@/lib/supabase';
import { ToastProvider } from '@/lib/toast';
import { PwaManager } from './Pwa';
import { CategoryArtProvider } from './ui';

export function Providers({ children, art = {} }: { children: ReactNode; art?: Record<string, string> }) {
  useEffect(() => {
    void bootstrapCatalogueRules();
  }, []);
  return (
    <CategoryArtProvider art={art}>
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
    </CategoryArtProvider>
  );
}
