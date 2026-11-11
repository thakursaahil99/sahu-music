# SAHU MUSIC

**Har Gaana, Ek Jagah.** A free-first music streaming ecosystem: website, installable PWA, Android and iOS apps, and an admin dashboard, all on one Supabase backend.

Every song plays **in full**. The app only lists tracks whose source authorises complete streaming.

| Part | Folder | Stack |
| --- | --- | --- |
| Website + PWA | `apps/web` | Next.js 15 (static export), React 19, TypeScript, Tailwind |
| Admin dashboard | `apps/admin` | Next.js 15 (static export) |
| Android / iOS app | `apps/mobile` | Flutter, Riverpod, just_audio, audio_service |
| Music providers, rights checks, search ranking | `packages/api` | TypeScript |
| Shared models and branding | `packages/models`, `packages/shared` | TypeScript |
| Database, RLS, edge function | `supabase` | PostgreSQL |

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

Requires Node.js 18.18 or newer.

```bash
npm install
npm run dev          # http://localhost:3000
```

That is enough to browse, search and play music. Favourites, playlists and history are saved in the browser.

Admin dashboard (needs Supabase, see below):

```bash
npm run dev:admin    # http://localhost:3001
```

## Original film songs (YouTube) in one step

Create a free YouTube Data API key (steps in [docs/MUSIC-SOURCES.md](docs/MUSIC-SOURCES.md)), then:

```bash
npm run youtube -- YOUR_API_KEY
```

It checks the key, saves it to `apps/web/.env.local`, builds the Android APK with it and rebuilds the website.

## Configuration

Copy `.env.example` to `apps/web/.env.local` (and to `apps/admin/.env.local` for the admin app). Every variable is optional.

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Accounts, synced library, admin dashboard. Use the **anon** key only. |
| `NEXT_PUBLIC_AUDIUS_APP_NAME` | Name your client reports to Audius. |
| `NEXT_PUBLIC_YOUTUBE_API_KEY` | Original film songs in YouTube's official player. Free; restrict it to your site's address. See [docs/MUSIC-SOURCES.md](docs/MUSIC-SOURCES.md). |
| `NEXT_PUBLIC_RADIO`, `NEXT_PUBLIC_ARCHIVE` | `false` switches off live radio or the Internet Archive. Both on by default. |
| `NEXT_PUBLIC_JAMENDO_CLIENT_ID` | Enables Jamendo (free tier is for non-commercial use). |
| `NEXT_PUBLIC_ITUNES_PREVIEWS` | `true` opts in to 30-second preview clips, marked "Preview". Default `false`. |
| `NEXT_PUBLIC_APK_URL` | Link for the "Download APK" button when the APK is hosted elsewhere. |
| `NEXT_PUBLIC_DEMO_MODE` | `true` forces demo mode (original synthesized sample audio). |
| `NEXT_PUBLIC_SITE_URL` | Public URL, used for SEO metadata and the sitemap. |
| `NEXT_PUBLIC_ADSENSE_CLIENT`, `NEXT_PUBLIC_ADSENSE_SLOT` | Optional display ad slot. Empty means no ad code is loaded. |

Never put the Supabase `service_role` key in any app. Both web apps refuse to start a client with it.

## Supabase (free tier)

1. Create a project at supabase.com.
2. In the SQL editor run the files in `supabase/migrations` in order (`…0001_schema.sql` → `…0004_…`).
3. Put the project URL and anon key in the `.env.local` files.
4. Sign up in the website, then make yourself an admin (SQL editor):

   ```sql
   update public.profiles set role = 'admin'
   where id = (select id from auth.users where email = 'you@example.com');
   ```

5. Optional: `supabase functions deploy sync-catalogue` for server-side catalogue sync.

Row Level Security is on for every table. Guests read only publicly approved data; users change only their own playlists, favourites, history and preferences; only admins manage the catalogue. A database trigger refuses to make a song public unless it has an approved rights record with streaming permission.

## Mobile app (Flutter)

```bash
cd apps/mobile
flutter pub get
flutter run                      # guest mode on Audius
flutter run --dart-define=SUPABASE_URL=https://xxx.supabase.co --dart-define=SUPABASE_ANON_KEY=xxx
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
cd apps/mobile && flutter test
```

Details and the manual checklist for device testing are in [docs/TESTING.md](docs/TESTING.md).

## Deployment

Static hosting on Cloudflare Pages, backend on Supabase, source on GitHub. Step by step in [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Project layout

```
apps/web        website + PWA          apps/admin     admin dashboard
apps/mobile     Flutter app            packages/api   providers, rights, ranking
packages/models shared types           packages/shared branding, categories, validation
supabase        migrations + functions scripts        icons, APK, live tests
docs            deployment, sources, testing
```
