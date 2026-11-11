import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Terms & Conditions', description: 'Terms for using SAHU MUSIC.' };

export default function TermsPage() {
  return (
    <article className="prose-sahu mx-auto max-w-3xl">
      <h1 className="text-3xl font-extrabold text-white">Terms &amp; Conditions</h1>
      <p className="mt-2 !text-muted">Last updated: 11 November 2026</p>
      <p className="mt-4 rounded-lg border border-gold/30 bg-gold/10 p-3 !text-gold-soft">
        This is a plain-language template supplied with the SAHU MUSIC source code. The operator of this deployment should have it reviewed for their
        jurisdiction before launch.
      </p>

      <h2>1. The service</h2>
      <p>
        SAHU MUSIC is a free music player that streams music from third-party open music platforms through their official APIs. We do not host, upload or own
        the music. Availability depends on those platforms and can change at any time.
      </p>

      <h2>2. Acceptable use</h2>
      <ul>
        <li>Use the service for personal, lawful listening.</li>
        <li>Do not download, record, redistribute or re-upload audio obtained through the service unless the track&apos;s licence allows it.</li>
        <li>Do not attempt to bypass rights checks, scrape the service, overload it or interfere with other users.</li>
      </ul>

      <h2>3. Accounts</h2>
      <p>
        You are responsible for keeping your login details safe and for activity on your account. We may suspend accounts that abuse the service.
      </p>

      <h2>4. Content and rights</h2>
      <p>
        Music, artwork and names belong to their respective artists and rights holders and are subject to each provider&apos;s terms (for example the Audius
        Terms of Use and the Creative Commons licence attached to a Jamendo track). Rights information shown in the app is provided by those platforms. If you
        believe a track infringes your rights, contact the source platform and the operator of this deployment; reported tracks are blocked promptly.
      </p>

      <h2>5. Advertising</h2>
      <p>The service may show optional display advertising. Ads never interrupt playback, and the service works fully with ads disabled.</p>

      <h2>6. No warranty</h2>
      <p>
        The service is provided “as is”, free of charge, without warranties of any kind. We do not guarantee uninterrupted availability or that any particular
        track will remain available.
      </p>

      <h2>7. Liability</h2>
      <p>To the extent permitted by law, the operator is not liable for indirect or consequential losses arising from use of the service.</p>

      <h2>8. Changes</h2>
      <p>We may update these terms. Continued use after an update means you accept the revised terms.</p>
    </article>
  );
}
