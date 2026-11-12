# SAHU MUSIC mobile app (Android + iOS)

Flutter app with Riverpod, just_audio and audio_service. It plays complete songs from Audius, live radio and the Internet Archive in the background with lock-screen controls, and original film songs in YouTube's official player (youtube_player_iframe) when a YouTube key is set.

```bash
flutter pub get
flutter run
```

Optional build-time settings (`--dart-define=NAME=value`):

| Name | Purpose |
| --- | --- |
| `API_BASE_URL` | The SAHU MUSIC website whose `/api` holds accounts and synced libraries. Default `https://sahu-music.vercel.app`. The app only ever holds the signed-in user's session token, never database credentials. |
| `YOUTUBE_API_KEY` | Original film songs. They open on a YouTube video screen (visible, no background play, as YouTube requires). Without it, the rest of the app works. |
| `AUDIUS_APP_NAME` | Name reported to Audius. |
| `DEMO_MODE=true` | Use the built-in original sample audio only. |
| `ADS_ENABLED=true`, `ADMOB_BANNER_ANDROID`, `ADMOB_BANNER_IOS` | Optional AdMob banner. Off by default. |

Build an APK for the website's download page from the repository root: `npm run apk`.

Release checklist:

- Sign with your own keystore (`android/app/build.gradle.kts` uses the debug key for release builds).
- Replace Google's sample AdMob app ids in `android/app/src/main/AndroidManifest.xml` and `ios/Runner/Info.plist` if you enable ads.
- iOS builds need a Mac with Xcode (`flutter build ipa`).

`android/gradle.properties` sets `kotlin.incremental=false`; without it the Gradle build fails on Windows when the project and the pub cache are on different drives.
