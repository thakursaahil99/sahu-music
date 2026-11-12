# Deployment (all free tiers)

## 1. Source on GitHub

```bash
git add -A && git commit -m "SAHU MUSIC"
git remote add origin https://github.com/<you>/sahu-music.git
git push -u origin main
```

`.env.local` files and the built APK are ignored by git.

## 2. Backend on Supabase

1. Create a project (free tier).
2. SQL editor: run `supabase/migrations/*.sql` in filename order.
3. Authentication → URL configuration: set the Site URL to your website address and add the admin address and `com.sahumusic.sahu_music://login-callback` to the redirect list.
4. Sign up through the website, then promote your account to admin (query in the README).
5. Optional edge function: `supabase functions deploy sync-catalogue`.

## 3. Website on Cloudflare Pages

Create a Pages project from the GitHub repository:

| Setting | Value |
| --- | --- |
| Build command | `npm install && npm run build:web` |
| Build output directory | `apps/web/out` |
| Environment variables | the `NEXT_PUBLIC_*` values from `.env.example` (add `NEXT_PUBLIC_YOUTUBE_API_KEY` for original film songs, restricted to this site's address) |

Set `NEXT_PUBLIC_SITE_URL` to the final address. `apps/web/public/_headers` already sets security headers, the service-worker cache policy and the APK content type.

On every release that changes `apps/web/public/sw.js`, bump its `VERSION` so installed copies show the "new version available" notice.

## 4. Admin dashboard on Cloudflare Pages

A second Pages project:

| Setting | Value |
| --- | --- |
| Build command | `npm install && npm run build:admin` |
| Build output directory | `apps/admin/out` |
| Environment variables | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` |

The dashboard is useless without an admin account: the UI check is a convenience and Row Level Security is the real enforcement. You can still put Cloudflare Access in front of it.

## 5. Android APK download

The download page (`/download`) offers the APK in one of two ways.

**Bundled with the site** (simplest when you deploy the `out` folder yourself):

```bash
npm run apk          # builds, copies to apps/web/public/downloads/sahu-music.apk
npm run build:web
```

Cloudflare Pages rejects files over 25 MiB. The arm64 APK is about 22 MiB today; the script warns if it grows past the limit. Because the APK is ignored by git, a Pages build from GitHub will not contain it, so for that setup use the second way.

**Hosted elsewhere** (recommended with GitHub-based deploys): attach the APK to a GitHub Release and set `NEXT_PUBLIC_APK_URL` to the asset's `https://` link. Use `https://github.com/<you>/sahu-music/releases/latest/download/sahu-music.apk`: it always points at the newest release, so a later release needs no website rebuild.

**Signing.** Release builds are signed with the key named in `apps/mobile/android/key.properties` (`storeFile`, `storePassword`, `keyAlias`, `keyPassword`); without that file they fall back to the debug key. `key.properties` and keystores are ignored by git. Keep a private backup of the keystore and its password: every update must be signed with the same key, or Android refuses to install it over the old version.

## 6. iOS

On a Mac: `cd apps/mobile && flutter build ipa`, then distribute through TestFlight or the App Store (needs a paid Apple developer account; there is no free way to distribute an iOS app outside your own devices). iPhone users can install the PWA from Safari at no cost.

## 7. Ads (optional)

- Web: set `NEXT_PUBLIC_ADSENSE_CLIENT` and `NEXT_PUBLIC_ADSENSE_SLOT`.
- Mobile: build with `--dart-define=ADS_ENABLED=true` and your banner unit ids, and replace Google's sample AdMob app ids in `AndroidManifest.xml` and `Info.plist`.

Ads are display banners only, never interrupt playback, and the apps work the same with them off.

## Free-tier limits to keep in mind

- Supabase free projects pause after a week without activity and have database and bandwidth caps.
- Audius asks clients to identify themselves (`app_name`) and to be polite; the apps cache responses and rate-limit themselves.
- Jamendo's free API is for non-commercial use.
- YouTube Data API: 10,000 units a day per key (≈100 typed searches). Answers are cached for 6 hours.
