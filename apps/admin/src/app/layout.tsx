import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { AdminShell } from '@/components/AdminShell';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'SAHU MUSIC Admin', template: '%s · SAHU MUSIC Admin' },
  description: 'Administration console for SAHU MUSIC.',
  robots: { index: false, follow: false },
  icons: { icon: '/admin/favicon.png' },
};

export const viewport: Viewport = { themeColor: '#050505', width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">
        <AdminShell>{children}</AdminShell>
      </body>
    </html>
  );
}
