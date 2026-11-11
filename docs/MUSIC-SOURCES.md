# Music sources, full-length playback and rights

## The rule

SAHU MUSIC plays complete songs only. A track is playable when all of these hold:

1. its source explicitly allows it to be streamed (or, for YouTube, embedded);
2. it is a full-length stream, not a preview clip;
3. it comes from the source's official API;
4. an admin has not blocked or rejected it (`music_rights` table).

The check lives in `packages/api/src/rights.ts` (`unavailableReason`, `isPlayable`) and runs on every list and again right before playback starts. The Flutter app applies the same rule (`lib/models.dart`, `lib/services/`).

## Sources

| Source | Key | What it gives | How it plays |
| --- | --- | --- | --- |
| **YouTube** | free API key (optional) | **Original film songs** from the labels' own channels (T-Series, Sony Music India, Zee Music, Saregama, Tips…) | YouTube's official embedded player, visible on screen |
| **Audius** | none | Full songs uploaded by creators: Hindi, Punjabi, covers, remixes, independent artists | in-app audio, background playback |
| **Live radio** (Radio Browser) | none | Bollywood, retro Hindi and bhajan stations playing full songs non-stop | in-app audio, background playback, marked LIVE |
| **Internet Archive** | none | Openly licensed full recordings: bhajans, old Indian records, Hindi uploads | in-app audio, background playback |
| Jamendo | free client id (optional) | Creative Commons tracks | in-app audio |
| Apple previews | none | 30-second clips only | **off by default** |
| Demo | none | Original tones synthesized in the app | used only when nothing else is reachable |

### YouTube (original film songs)

Original Bollywood songs belong to music labels. No free API streams them as audio. YouTube is the free, legal way: the labels upload the songs themselves and allow them to be embedded.

How SAHU MUSIC uses it, following YouTube's API terms:

- Search and song details come from the **YouTube Data API v3**. Only embeddable, public, not age-restricted videos between 1 and 20 minutes are listed. Label and artist channels ("T-Series", "… - Topic", "…VEVO") are ranked first.
- Playback uses **only YouTube's official IFrame player**. The audio is never extracted, downloaded or played on its own.
- The player **stays visible** (at least 200×200 px): on the website it floats above the mini player or fills the full player; in the Android app it has its own screen.
- **No background playback**: on phones the video pauses when the app is hidden. Other sources keep playing in the background as before.
- YouTube shows its own ads inside its player. SAHU MUSIC does not add any ads over it.

**Setting it up (free):**

1. Open the Google Cloud console and create a project.
2. Enable **YouTube Data API v3**.
3. Credentials → Create credentials → **API key**.
4. Restrict the key: application restriction "Websites" with your site's address (for the Android app, a separate key restricted to the app), API restriction "YouTube Data API v3".
5. Website: set `NEXT_PUBLIC_YOUTUBE_API_KEY` and rebuild. Android: build with `--dart-define=YOUTUBE_API_KEY=…`.

**Quota:** 10,000 units a day for free. A search costs 100 units (about 100 typed searches a day per key), the chart costs 1. SAHU MUSIC therefore asks YouTube only for searches the listener types and for the "Bollywood Top Songs" chart, never to fill category rows, and caches every answer for 6 hours (on the website also in the browser). When the quota runs out, search still works with the other sources and shows a message for YouTube.

Without a key, everything else works and the "Bollywood Top Songs" category is hidden.

### Live radio (Radio Browser)

[Radio Browser](https://www.radio-browser.info) is a free, community-run directory of radio stations. SAHU MUSIC lists only stations the directory last checked as working and only HTTPS streams (a secure site cannot play plain-HTTP audio). Stations publish their own streams and hold their broadcast licences; SAHU MUSIC plays the public stream.

Radio items are marked **LIVE**: they have no length, cannot be seeked and never end by themselves. Categories: Bollywood Radio, Retro Hindi Radio, Bhakti Radio. Station names and tags also appear in search.

### Internet Archive

Only items whose uploader declared an open licence (Creative Commons or public domain) and that are not access-restricted are used; only the original MP3 files between 45 seconds and 25 minutes, without duplicate bitrate copies. Because the licence is the uploader's claim, an admin can block any item under **Rights verification**.

The Archive can be slow. The app waits at most 4.5 seconds for it so search stays fast; a late answer is cached and appears on the next search.

### Audius

- Playback URL: `https://api.audius.co/v1/tracks/{track_id}/stream` (the full track). `preview_cid` and preview URLs are never used.
- A track is rejected when `is_streamable` is not true, or it is stream-gated, deleted, unlisted, unavailable, or has `stream_conditions`.

### Jamendo

The free API tier is for non-commercial apps. Each track's Creative Commons licence is stored; commercial use is derived from it, and an unknown licence stays "unconfirmed".

## Search ranking

`packages/api/src/rank.ts` (and the same rules in the Flutter app):

1. title match with what was typed (exact, starts with, contains, then word by word);
2. official label or artist upload first (+30);
3. Hindi and Indian music ahead of the rest;
4. popularity;
5. uploads under 45 seconds sink to the bottom; unrelated results are dropped.

## Opting in to 30-second previews

Set `NEXT_PUBLIC_ITUNES_PREVIEWS=true`. Preview tracks are then listed with a "Preview" badge. Leave it `false` to never list or play a clip.

## Adding a source

Implement `MusicProvider` (`packages/api/src/provider.ts`), build each track's rights with `evaluateRights`, and register it in `MusicService`. Set `onDemandSearch` if searches cost a daily quota and `answerWithinMs` if the source is slow. Only add sources that allow full playback through an official API or player.
