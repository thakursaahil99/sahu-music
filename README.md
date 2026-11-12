# SAHU MUSIC

**Har Gaana, Ek Jagah.** A free-first music streaming ecosystem: website, installable PWA, Android and iOS apps, and an admin dashboard, all on one backend: a Vercel Function with a Neon PostgreSQL database.

Live: **https://sahu-music.vercel.app** · admin console: **https://sahu-music.vercel.app/admin/**

Every song plays **in full**. The app only lists tracks whose source authorises complete streaming.

| Part | Folder | Stack |
| --- | --- | --- |
| Website + PWA | `apps/web` | Next.js 15 (static export), React 19, TypeScript, Tailwind |
| Admin dashboard (served at `/admin`) | `apps/admin` | Next.js 15 (static export) |
| Android / iOS app | `apps/mobile` | Flutter, Riverpod, just_audio, audio_service |
| Music providers, rights checks, search ranking | `packages/api` | TypeScript |
| Shared models and branding | `packages/models`, `packages/shared` | TypeScript |
| Backend API: accounts, libraries, admin | `api` | Vercel Function (Node), TypeScript |
| Database schema | `db/migrations` | PostgreSQL on Neon |

## What you need to know first

- **Where the music comes from.** Several free, authorised sources, all full-length:
  - **YouTube official player**: original Bollywood film songs from the labels' own channels. Needs a free YouTube Data API key; the video stays on screen and does not play in the background (YouTube's rules).
  - **Audius**: full songs uploaded by creators (no key).
  - **Live radio** (Radio Browser): Bollywood, retro Hindi and bhajan stations (no key).
  - **Internet Archive**: openly licensed full recordings (no key).
  - Jamendo (optional, free client id).
- **Without a YouTube key** original film songs are not available; search then returns the closest full-length versions (covers, remixes, uploads) and live radio. The app never shows invented songs.
- **30-second previews are off.** An Apple iTunes preview provider exists in the code but is disabled by default. With it off, no preview clip is listed or played. See [docs/MUSIC-SOURCES.md](docs/MUSIC-SOURCES.md).
- **Everything is optional except Node.** With no configuration at all the website runs in guest mode against Audius.

## Quick start (website)

Requires Node.js 22 or newer.

```bash
npm install
npm run dev          # http://localhost:3000
```

That is enough to browse, search and play music. Favourites, playlists and history are saved in the browser.

Accounts and the admin console need the backend and its database. To run everything locally exactly as on Vercel (website, `/admin` and `/api`):

```bash
vercel env pull .env.neon                  # the Neon connection string from the linked Vercel project
npm run build:site
npm run serve -- --env-file .env.neon      # http://localhost:3000
```

## Original film songs (YouTube) in one step

Create a free YouTube Data API key (steps in [docs/MUSIC-SOURCES.md](docs/MUSIC-SOURCES.md)), then:

```bash
npm run youtube -- YOUR_API_KEY
```

It checks the key, saves it to `apps/web/.env.local`, builds the Android APK with it and rebuilds the website.

## Configuration

Copy `.env.example` to `apps/web/.env.local`. Every variable is optional.

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_AUDIUS_APP_NAME` | Name your client reports to Audius. |
| `NEXT_PUBLIC_YOUTUBE_API_KEY` | Original film songs in YouTube's official player. Free; restrict it to your site's address. See [docs/MUSIC-SOURCES.md](docs/MUSIC-SOURCES.md). |
| `NEXT_PUBLIC_RADIO`, `NEXT_PUBLIC_ARCHIVE` | `false` switches off live radio or the Internet Archive. Both on by default. |
| `NEXT_PUBLIC_JAMENDO_CLIENT_ID` | Enables Jamendo (free tier is for non-commercial use). |
| `NEXT_PUBLIC_ITUNES_PREVIEWS` | `true` opts in to 30-second preview clips, marked "Preview". Default `false`. |
| `NEXT_PUBLIC_APK_URL` | Link for the "Download APK" button when the APK is hosted elsewhere. |
| `NEXT_PUBLIC_DEMO_MODE` | `true` forces demo mode (original synthesized sample audio). |
| `NEXT_PUBLIC_SITE_URL` | Public URL, used for SEO metadata and the sitemap. |
| `NEXT_PUBLIC_ADSENSE_CLIENT`, `NEXT_PUBLIC_ADSENSE_SLOT` | Optional display ad slot. Empty means no ad code is loaded. |

The database connection string (`DATABASE_URL`) is a server-only secret. It is set by the Vercel Neon integration and used only by the API in `/api`; it never appears in the website, the admin console or the mobile app.

## Backend: accounts, libraries and admin (Vercel + Neon, free tiers)

- **API:** one Vercel Function, `api/server.ts`, answers everything under `/api/v1/` (sign-up, log-in, favourites, playlists, history, preferences, admin). It runs in Singapore (`sin1`), next to the database.
- **Database:** Neon PostgreSQL, added through the Vercel Marketplace (Storage → Neon, free plan), which sets `DATABASE_URL` for the project. The schema in `db/migrations` is applied automatically on every Vercel build (`npm run db:migrate`).
- **Accounts:** passwords are stored only as salted scrypt hashes. The website and admin console use an HttpOnly, Secure, SameSite cookie; the mobile app gets a session token. Sessions are stored server-side (hashed), so logging out, changing the password, blocking a user or deleting the account ends them at once.
- **Access rules:** every library request is limited to the signed-in user; admin endpoints check the admin role on every request and can only touch whitelisted tables and columns. Writes from other websites are refused. Failed log-ins are rate-limited.
- **Rights:** a database trigger refuses to make a song public unless it has an approved rights record with streaming permission, and un-publishes it if that approval is withdrawn.

**Make yourself the administrator** (once):

```bash
npm run admin -- you@example.com YourPassword    # creates the account (or resets its password) and makes it admin
npm run admin -- you@example.com                 # or: promote an account that already signed up on the website
```

The script fetches the database address from the linked Vercel project by itself. Then sign in at `/admin`.

There is no email service yet, so "forgot password" cannot send a reset link; an admin can reset a password with `npm run admin -- EMAIL NEWPASSWORD`.

## Mobile app (Flutter)

```bash
cd apps/mobile
flutter pub get
flutter run                      # guest mode on Audius
flutter run --dart-define=API_BASE_URL=https://sahu-music.vercel.app   # accounts (this is also the default)
```

Other defines: `YOUTUBE_API_KEY` (original film songs, played on their own video screen), `AUDIUS_APP_NAME`, `DEMO_MODE=true`, `ADS_ENABLED=true`, `ADMOB_BANNER_ANDROID`, `ADMOB_BANNER_IOS`.

- **Android APK for the website's download page:** `npm run apk` builds the release APK and copies the arm64 build to `apps/web/public/downloads/sahu-music.apk`. Rebuild the website afterwards.
- **iOS:** needs a Mac with Xcode: `flutter build ipa`. Background audio is already enabled in `Info.plist`.
- **Before publishing:** replace the debug signing config in `android/app/build.gradle.kts` with your own keystore, and replace Google's sample AdMob app ids in `AndroidManifest.xml` and `Info.plist` if you enable ads.

## Tests

```bash
npm test                 # unit tests: rights checks, providers, search ranking, shared helpers
npm run test:api         # live check of every Audius endpoint the apps use
npm run test:playback    # live check that stream URLs are complete songs, not clips
npm run build:web && npm run test:e2e   # real browser: plays tracks, passes 30 s, plays to the end, search
npm run test:backend -- https://sahu-music.vercel.app   # accounts API end to end (creates and deletes a test account)
cd apps/mobile && flutter test
```

Details and the manual checklist for device testing are in [docs/TESTING.md](docs/TESTING.md).

## Deployment

Vercel (website, admin console and API) with a Neon database, source on GitHub: every push to `main` deploys. Step by step in [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Project layout

```
apps/web        website + PWA          apps/admin     admin dashboard
apps/mobile     Flutter app            packages/api   providers, rights, ranking
packages/models shared types           packages/shared branding, categories, validation
api             backend (Vercel Function)  db           database migrations
scripts         build, admin, APK, live tests
docs            deployment, sources, testing
```
