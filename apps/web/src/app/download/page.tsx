import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { Metadata } from 'next';
import { DownloadView } from './DownloadView';

export const metadata: Metadata = {
  title: 'Download the app',
  description: 'Download the SAHU MUSIC Android app (APK) or install the web app on any device. Free, no subscription.',
};

/** Public path of the APK that `npm run apk` copies into the website. */
const BUNDLED_APK = '/downloads/sahu-music.apk';

/**
 * Resolved at build time: either the operator's NEXT_PUBLIC_APK_URL, or the APK bundled
 * in public/downloads. When neither exists the page says so instead of offering a dead link.
 */
function resolveApk(): { url: string; sizeMb: number | null } | null {
  const external = process.env.NEXT_PUBLIC_APK_URL?.trim();
  if (external && /^https:\/\//.test(external)) return { url: external, sizeMb: null };
  const file = join(process.cwd(), 'public', 'downloads', 'sahu-music.apk');
  if (existsSync(file)) return { url: BUNDLED_APK, sizeMb: Math.round((statSync(file).size / 1048576) * 10) / 10 };
  return null;
}

export default function DownloadPage() {
  return <DownloadView apk={resolveApk()} />;
}
