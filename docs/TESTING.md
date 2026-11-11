# Testing

## Automated

| Command | What it proves |
| --- | --- |
| `npm test` | Rights checks, provider mapping, preview clips refused by default, search ranking, validation helpers |
| `npm run typecheck` | TypeScript in the website and the admin app |
| `npm run test:api` | Every Audius endpoint the apps call answers, with CORS, and a stream serves audio |
| `npm run test:playback` | For real tracks longer than 30 s: the playback URL is `/v1/tracks/{id}/stream`, the file size matches the full duration, and the end of the file can be read |
| `npm run build:web && npm run test:e2e` | In a headless Chrome/Edge with a temporary profile: tracks load, no "Preview" badge is shown, the audio's real duration is over 30 s, playback continues past 0:34, a track plays to its end and the next one starts, seeking works, the full player opens, search plays a result, the download page renders, the mobile layout has its navigation |
| `cd apps/mobile && flutter analyze && flutter test` | Flutter code analysis; rights rules, ranking, JSON snapshots, demo audio |

`test:e2e` looks for Chrome or Edge in the usual places; set `CHROME_PATH` otherwise. Set `SHOT_DIR` to a folder to save screenshots.

It also plays a live Bollywood radio station. To test the YouTube player, build with any value in `NEXT_PUBLIC_YOUTUBE_API_KEY` and run with `E2E_YOUTUBE=1`: the test answers the Data API calls itself and plays the sample video from YouTube's IFrame API docs in the real official player, checking it is visible and at least 200 px. Rebuild without the test key afterwards.

`test:playback` also checks a full-length Internet Archive file and a live radio stream.

The live tests need internet access and depend on what Audius returns that day.

## Manual checklist (needs real devices or accounts)

These cannot be automated from this repository.

**PWA**
- [ ] Android Chrome: menu → Install app; the icon opens the app full screen.
- [ ] Desktop Chrome/Edge: the "Install app" button appears and installs.
- [ ] iPhone Safari: Share → Add to Home Screen.
- [ ] Turn off the network: the app shell opens, the offline banner shows, playback reports that it needs a connection.
- [ ] Deploy a new `sw.js` version: the "new version available" notice appears and Update reloads.

**Android app**
- [ ] Install the APK, complete onboarding, continue as guest.
- [ ] Play a song, lock the phone: music continues and lock-screen controls work.
- [ ] Notification shows title, artist, artwork and previous / play-pause / next.
- [ ] Search by a song name; the matching title is first.
- [ ] Favourites, playlists and history survive closing the app.
- [ ] Bollywood Radio: a station plays, shows LIVE, keeps playing with the screen locked.
- [ ] With `YOUTUBE_API_KEY`: a YouTube result opens the video screen and plays; leaving the app pauses it.

**iOS app** (Mac with Xcode)
- [ ] `flutter run` on a device; background audio and Control Centre controls work.

**Accounts and admin** (Supabase configured)
- [ ] Sign up, confirm email, log in; library syncs between website and app.
- [ ] A second account cannot see the first account's private playlists.
- [ ] A non-admin account is refused by the admin dashboard.
- [ ] Admin: sync tracks → they are pending → approve one → it appears under "Verified by SAHU MUSIC".
- [ ] Admin: block a track by id → it disappears from search on next load.
- [ ] Trying to mark a song public without an approved rights record fails with a database error.
