import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Privacy Policy', description: 'How SAHU MUSIC handles your data.' };

export default function PrivacyPage() {
  return (
    <article className="prose-sahu mx-auto max-w-3xl">
      <h1 className="text-3xl font-extrabold text-white">Privacy Policy</h1>
      <p className="mt-2 !text-muted">Last updated: 11 November 2026</p>
      <p className="mt-4 rounded-lg border border-gold/30 bg-gold/10 p-3 !text-gold-soft">
        This is a plain-language template supplied with the SAHU MUSIC source code. The operator of this deployment is responsible for reviewing it, adding
        their contact details, and making sure it meets the laws that apply to them.
      </p>

      <h2>1. Guest use</h2>
      <p>
        You can use SAHU MUSIC without an account. In guest mode your favourites, playlists, listening history, queue and settings are stored only in your
        browser&apos;s local storage on your device. We do not receive them. Clearing your browser data deletes them.
      </p>

      <h2>2. Accounts</h2>
      <p>If you create an account we store, in our Supabase database:</p>
      <ul>
        <li>your email address and a securely hashed password (handled by Supabase Authentication);</li>
        <li>your display name;</li>
        <li>your favourites, playlists, listening history and preferences.</li>
      </ul>
      <p>Database row-level security ensures that only you can read or change your personal library data.</p>

      <h2>3. Music providers</h2>
      <p>
        Audio, artwork and track information are loaded directly from the music providers (Audius and, if enabled, Jamendo). When you browse or play music your
        device connects to their servers, so they receive your IP address and standard request data under their own privacy policies.
      </p>

      <h2>4. Offline cache</h2>
      <p>
        The installable app caches the app shell, artwork and track metadata on your device so it opens quickly and works offline. Audio is never cached or
        downloaded. You can clear the cache in Settings.
      </p>

      <h2>5. Error monitoring</h2>
      <p>
        When a music provider request fails we may record the provider name, endpoint path, status code and error message to keep the service healthy. These
        records contain no account or personal information.
      </p>

      <h2>6. Advertising</h2>
      <p>
        Advertising is optional. If the operator enables it, ads are served by Google (AdSense on the web, AdMob in the mobile apps), which may use cookies or
        device identifiers under Google&apos;s policies. You can switch ads off in Settings on the web. If advertising is not enabled, no ad code is loaded.
      </p>

      <h2>7. What we do not do</h2>
      <ul>
        <li>We do not sell your personal data.</li>
        <li>We do not use third-party analytics trackers in this codebase.</li>
      </ul>

      <h2>8. Your choices</h2>
      <p>
        You can edit your profile, clear your history and delete playlists at any time. To delete your account and all associated data, contact the operator of
        this deployment.
      </p>

      <h2>9. Children</h2>
      <p>SAHU MUSIC is not directed at children under 13, and accounts should not be created by them.</p>

      <h2>10. Changes</h2>
      <p>We may update this policy. The date at the top shows the latest revision.</p>
    </article>
  );
}
