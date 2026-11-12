# Deployment (all free tiers)

The whole product runs on one Vercel project connected to the GitHub repository:

- the website (`apps/web`), served as static files;
- the admin console (`apps/admin`), built into the same site at `/admin`;
- the backend API (`api/server.ts`, one Vercel Function) at `/api/v1/*`;
- a Neon PostgreSQL database, added from the Vercel Marketplace.

Every push to `main` builds and deploys all of it. The live site is https://sahu-music.vercel.app.

## 1. Source on GitHub

```bash
git add -A && git commit -m "SAHU MUSIC"
git remote add origin https://github.com/<you>/sahu-music.git
git push -u origin main
```

`.env*` files, the built APK and keystores are ignored by git.

## 2. Vercel project

Import the repository in Vercel (or run `vercel link` in the project folder). `vercel.json` already sets everything:

| Setting | Value |
| --- | --- |
| Install | `npm install` |
| Build | `npm run db:migrate && npm run build:site` |
| Output directory | `apps/web/out` |
| Function region | `sin1` (Singapore, next to the database and closest to India) |
| Rewrite | `/api/v1/(.*)` → the `api/server` function |

It also sets the security headers, the service-worker cache rules, the APK content type and `noindex` for `/admin`.

Environment variables (Project → Settings → Environment Variables):

- `NEXT_PUBLIC_SITE_URL`: the public address (for the sitemap and link previews). Without it the Vercel production domain is used.
- Optional: `NEXT_PUBLIC_YOUTUBE_API_KEY` (restricted to your site's address), `NEXT_PUBLIC_APK_URL`, ads, and the other `NEXT_PUBLIC_*` values from `.env.example`.

On every release that changes `apps/web/public/sw.js`, bump its `VERSION` so installed copies show the "new version available" notice.

## 3. Database on Neon

1. Vercel → Storage → Create → Neon (Free plan), region Singapore, connected to the project. From the command line the same is:

   ```bash
   vercel integration add neon -m region=sin1
   ```

   This sets `DATABASE_URL` and `DATABASE_URL_UNPOOLED` for the project. They are server-only secrets used by the API and the build; they never reach a browser or the app.
2. Deploy. The build runs `db/migrations/*.sql` that have not been applied yet (tracked in the `schema_migrations` table). To change the schema later, add a new numbered file; never edit an applied one.
3. Create the administrator:

   ```bash
   npm run admin -- you@example.com YourPassword
   ```

   It reads the database address from the linked Vercel project, creates the account (or resets its password) and gives it the admin role. Then sign in at `https://<your-site>/admin/`.

## 4. Admin console

Nothing extra to deploy: it is part of the site at `/admin`. It signs in with the same accounts as the website, and only accounts with the admin role get past the sign-in screen. The backend checks the role again on every admin request, and admins can only touch the tables and columns listed in `api/_lib/routes-admin.ts`. Admins can make other users admins under **Users**.

## 5. Android APK download

The download page (`/download`) offers the APK in one of two ways.

**Hosted on GitHub Releases** (recommended with Git-based deploys, because the APK is ignored by git):

```bash
npm run apk
gh release create v1.0.0 apps/web/public/downloads/sahu-music.apk --title "SAHU MUSIC v1.0.0" --notes "Android app"
vercel env add NEXT_PUBLIC_APK_URL production    # https://github.com/<you>/sahu-music/releases/latest/download/sahu-music.apk
```

The `releases/latest/download/…` link always points at the newest release, so a later release needs no website rebuild. Redeploy once after setting the variable.

**Bundled with the site** (when you deploy a local build with `vercel deploy --prebuilt` or another static host): `npm run apk` copies the APK into `apps/web/public/downloads/`.

The app signs in against the live site by default; build with `API_BASE_URL=https://your-site npm run apk` for another address.

**Signing.** Release builds are signed with the key named in `apps/mobile/android/key.properties` (`storeFile`, `storePassword`, `keyAlias`, `keyPassword`); without that file they fall back to the debug key. `key.properties` and keystores are ignored by git. Keep a private backup of the keystore and its password: every update must be signed with the same key, or Android refuses to install it over the old version.

## 6. iOS

On a Mac: `cd apps/mobile && flutter build ipa`, then distribute through TestFlight or the App Store (needs a paid Apple developer account; there is no free way to distribute an iOS app outside your own devices). iPhone users can install the PWA from Safari at no cost.

## 7. Ads (optional)

- Web: set `NEXT_PUBLIC_ADSENSE_CLIENT` and `NEXT_PUBLIC_ADSENSE_SLOT`.
- Mobile: build with `--dart-define=ADS_ENABLED=true` and your banner unit ids, and replace Google's sample AdMob app ids in `AndroidManifest.xml` and `Info.plist`.

Ads are display banners only, never interrupt playback, and the apps work the same with them off.

## Free-tier limits to keep in mind

- **Neon free plan:** limited storage and compute hours; the database scales to zero when idle and wakes on the next request (the first request after a pause takes a little longer). Only metadata is stored, never audio, so storage grows slowly.
- **Vercel Hobby:** for personal, non-commercial projects; generous function and bandwidth allowances. A commercial launch needs the Pro plan.
- Audius asks clients to identify themselves (`app_name`) and to be polite; the apps cache responses and rate-limit themselves.
- Jamendo's free API is for non-commercial use.
- YouTube Data API: 10,000 units a day per key (≈100 typed searches). Answers are cached for 6 hours.
