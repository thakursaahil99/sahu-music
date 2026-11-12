import type { Metadata } from 'next';
import Link from 'next/link';
import { LogoMark } from '@/components/Logo';

export const metadata: Metadata = {
  title: 'About',
  description: 'About SAHU MUSIC – a free-first music streaming app that only plays music from authorised open platforms.',
};

export default function AboutPage() {
  return (
    <article className="prose-sahu mx-auto max-w-3xl">
      <div className="flex items-center gap-4">
        <LogoMark size={72} />
        <div>
          <h1 className="text-3xl font-extrabold text-white">About SAHU MUSIC</h1>
          <p className="!text-gold">Har Gaana, Ek Jagah.</p>
        </div>
      </div>

      <h2>What it is</h2>
      <p>
        SAHU MUSIC is a free music streaming app for the web, Android and iOS. There is no subscription and no paywall. You can listen as a guest, or create a
        free account to keep your favourites, playlists and listening history in sync across devices.
      </p>

      <h2>Where the music comes from</h2>
      <p>
        We do not host music and we never copy it. Every song is streamed directly from an open music platform through that platform&apos;s official, free API:
      </p>
      <ul>
        <li>
          <a href="https://audius.co" target="_blank" rel="noopener noreferrer">Audius</a> – an open streaming platform where artists upload and share their own work.
        </li>
        <li>
          <a href="https://www.jamendo.com" target="_blank" rel="noopener noreferrer">Jamendo</a> – Creative Commons music (only when the site owner has enabled it).
        </li>
      </ul>
      <p>
        <strong>Every song plays in full.</strong> We only list tracks whose source authorises complete streaming, so the catalogue is mostly
        independent artists. Mainstream film soundtracks and label releases are owned by their music labels; free APIs offer them only as 30-second
        clips, and we do not show or play those clips. If a category has nothing playable, it stays empty. We never show made-up songs.
      </p>

      <h2>Rights checks</h2>
      <p>
        Each track carries a rights record: provider, provider track ID, licence, and whether streaming, commercial use and advertising are permitted. A track
        is playable only when its provider explicitly confirms it can be streamed and it has not been blocked by our administrators. You can view this under
        “Source &amp; rights” in any track&apos;s menu. We never scrape Spotify, YouTube, JioSaavn or any other service.
      </p>

      <h2>Artists and rights holders</h2>
      <p>
        If your work appears here and you want it removed, remove or restrict it on the source platform and it disappears from SAHU MUSIC automatically. You
        can also contact the site operator to have it blocked immediately.
      </p>

      <h2>Open and free-first</h2>
      <p>
        SAHU MUSIC is built with open-source tools (Next.js, Flutter, PostgreSQL on Neon) and runs on free hosting tiers. Advertising is optional and never interrupts
        playback.
      </p>

      <p className="mt-8">
        <Link href="/privacy">Privacy Policy</Link> · <Link href="/terms">Terms &amp; Conditions</Link>
      </p>
    </article>
  );
}
