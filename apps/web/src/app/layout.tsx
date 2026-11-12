import type { Metadata, Viewport } from 'next';
import { Outfit, Plus_Jakarta_Sans } from 'next/font/google';
import type { ReactNode } from 'react';
import { Providers } from '@/components/Providers';
import { Shell } from '@/components/Shell';
import { env } from '@/lib/config';
import './globals.css';

/** Self-hosted at build time by next/font (no request to Google from the visitor's browser). */
const sans = Plus_Jakarta_Sans({ subsets: ['latin'], display: 'swap', variable: '--font-sans' });
/** Headings. */
const display = Outfit({ subsets: ['latin'], display: 'swap', variable: '--font-display', weight: ['600', '700', '800'] });

const siteUrl = env.siteUrl;

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: 'SAHU MUSIC – Har Gaana, Ek Jagah.', template: '%s · SAHU MUSIC' },
  description:
    'SAHU MUSIC is a free music streaming app. Discover and play Hindi, Punjabi, devotional, pop and independent music streamed legally from authorised open music platforms.',
  applicationName: 'SAHU MUSIC',
  manifest: '/manifest.webmanifest',
  keywords: ['SAHU MUSIC', 'free music streaming', 'Hindi songs', 'Punjabi songs', 'devotional music', 'independent artists', 'PWA music player'],
  icons: {
    icon: [{ url: '/favicon.png', type: 'image/png' }, { url: '/logo.svg', type: 'image/svg+xml' }],
    apple: '/icons/apple-touch-icon.png',
  },
  appleWebApp: { capable: true, title: 'SAHU MUSIC', statusBarStyle: 'black-translucent' },
  openGraph: {
    type: 'website',
    siteName: 'SAHU MUSIC',
    title: 'SAHU MUSIC – Har Gaana, Ek Jagah.',
    description: 'Free, legal music streaming from authorised open music platforms.',
    images: ['/icons/icon-512.png'],
  },
  twitter: { card: 'summary', title: 'SAHU MUSIC', description: 'Har Gaana, Ek Jagah.' },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: '#07060B',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${display.variable}`}>
      <head>
        {/* Open the connections to the music servers while the page is still loading, so the
            first search answers and the first song starts sooner. */}
        <link rel="preconnect" href="https://api.audius.co" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://api.audius.co" />
        <link rel="preconnect" href="https://creatornode.audius.co" />
        <link rel="dns-prefetch" href="https://archive.org" />
        <link rel="dns-prefetch" href="https://de1.api.radio-browser.info" />
      </head>
      <body className="font-sans antialiased">
        <Providers>
          <Shell>{children}</Shell>
        </Providers>
      </body>
    </html>
  );
}
