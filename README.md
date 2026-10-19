# Wave Playlist Downloader

A responsive playlist downloader interface. Milestones 1–7 are implemented: responsive UI and mock workflow, optional Spotify metadata import, Jamendo search and permission checks, match scoring and confirmation, quality selection, browser-direct downloads, device-local history and settings, ZIP packaging of user-selected completed files, regression checks, and deployment guidance.

## Requirements

- Node.js 20.9 or newer
- npm

## Install and run

```powershell
npm install
Copy-Item .env.local.example .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). With no Spotify credentials, the interface clearly uses sample data. To enable the Spotify integration, configure the environment variables below and restart the dev server.

For a production build:

```powershell
npm run build
npm start
```

Run the automated regression checks with:

```powershell
npm test
```

## What works

- Responsive dark interface with desktop sidebar and mobile navigation.
- Clearly labeled mock playlist import when Spotify credentials are absent.
- Playlist detail view with search, filters, selection, and illustrative match-confidence badges.
- Download manager with per-track queue states, retry of preparation failures, cancel of queued items, queue pause/resume, duplicate detection, and user-confirmed session history.
- TypeScript playlist and track models.
- Optional Spotify Authorization Code OAuth flow, with a server-only client secret and encrypted, HTTP-only token-session cookie.
- Server-side playlist metadata and track import, paginated in groups of 50, for playlists the connected user owns or collaborates on.
- OAuth state checking, access-token refresh, input validation, request throttles, and responses for missing credentials, expired authorization, playlist access errors, unavailable playlists, and Spotify rate or quota limits.
- Server-side Jamendo track search with an explicit `audiodownload_allowed` check and per-format file-availability probes before a format is listed.
- Candidate source links, Creative Commons license links when supplied, and provider stream previews.
- Clearly labeled Jamendo mock results with downloads disabled when no client ID is configured.
- Title, artist, and optional duration similarity scores to rank Jamendo candidates. Scores are suggestions only and users explicitly confirm the source recording.
- A reusable quality selector that ranks only the provider-confirmed formats: FLAC, then provider-described high-quality MP3 VBR, then OGG, then MP3 96 kbps. User settings can also restrict selection to lossless or higher-quality lossy formats.
- Source-reported quality details only. Jamendo does not provide sample rate, bit depth, or file-size metadata through these fields, so Wave displays those as unknown.
- A same-origin download-preparation endpoint rechecks Jamendo permission and the requested format, then hands the browser a direct Jamendo download URL. Audio is not stored or proxied by the app server.
- Device-local download history and audio-quality/batch-size preferences.
- Browser-side ZIP creation from files the user selects that match their confirmed download history. A JSON manifest records which history entries were included.

When provider credentials are absent, integrations use clearly labeled mock data. Demo candidates are not authorized and cannot enter the download queue. The browser manages actual transfers; Wave cannot reliably read cross-origin progress or pause/resume a native download. A track is recorded as saved only after the user confirms it appears in their Downloads folder. The ZIP builder reads selected local files in the browser and is limited to 400 MiB per archive.

## Spotify API credentials

Set `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`, `SPOTIFY_REDIRECT_URI`, and a random `SESSION_SECRET` (at least 32 characters) in `.env.local`. Generate the session key with:

```powershell
node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"
```

In the Spotify Developer Dashboard, register exactly `http://localhost:3000/api/spotify/callback` as the local redirect URI. For production, register the deployment's HTTPS `/api/spotify/callback` URL and set `SPOTIFY_REDIRECT_URI` to that exact value. Add the same settings to your host's server-side environment variables. Restart the app after changing local variables. Never commit `.env.local`, expose `SPOTIFY_CLIENT_SECRET`, or enter a Spotify password into Wave.

Connect Spotify from the import screen. Wave requests only the `playlist-read-private` scope. Spotify's current playlist-items endpoint only returns items when the connected account owns the playlist or collaborates on it; a public link alone does not grant API item access. Development Mode has Spotify account/app restrictions, including an app-owner Premium requirement and a five-user allowlist cap for new apps. Check your Dashboard and [Spotify's current quota-mode documentation](https://developer.spotify.com/documentation/web-api/concepts/quota-modes) before deployment. [Spotify's playlist-items reference](https://developer.spotify.com/documentation/web-api/reference/get-playlists-items) documents the owner/collaborator access rule.

## Jamendo

Create a Jamendo developer application and set its `JAMENDO_CLIENT_ID` in `.env.local`. This credential stays in the server API route. Restart the dev server after changing it. The search uses Jamendo's `/v3.0/tracks` endpoint and the file endpoint's documented format options (`flac`, `ogg`, `mp32`, `mp31`). A format appears only when Jamendo reports download permission and its file endpoint confirms a redirect for that format. The search UI shows source and license links and a provider preview where available. Review the current [Jamendo API Terms of Use](https://devportal.jamendo.com/api_terms_of_use) and each track's Creative Commons license for your use case. See [Jamendo's track search reference](https://developer.jamendo.com/v3.0/tracks) and [track file reference](https://developer.jamendo.com/v3.0/tracks/file). Spotify content must never be downloaded or used to facilitate stream ripping, as stated in [Spotify's Get Playlist API policy notes](https://developer.spotify.com/documentation/web-api/reference/get-playlist).

## Manual walkthrough

1. Without Spotify credentials, paste a playlist URL such as `https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M` to load the labeled sample playlist.
2. With credentials set, connect an allowlisted Spotify account, then import a playlist owned by or shared collaboratively with that account. Review metadata, Spotify attribution, and **Load more tracks** pagination.
3. With Jamendo configured, choose **Search Jamendo** for a track. Review the raw candidate, similarity score, license/source links, preview, explicit permission status, and verified formats. Confirm a source recording before it becomes queue eligible.
4. Change quality settings, add confirmed tracks to the queue, start a browser handoff, and confirm an item as saved only after checking the browser's Downloads folder. Verify sanitized names and duplicate suffixes.
5. Open History, select completed files from Downloads, and create a ZIP. Check the archive includes only matching user-confirmed files and a manifest. Reload the page to confirm history and settings persist locally.
6. Try invalid URLs and playlists the connected account cannot access. Disconnect/reconnect to exercise Spotify authorization. Resize the browser to inspect mobile layout.
7. On Android, open the deployed HTTPS site in Chrome. Check portrait and landscape layout, keyboard focus and dismissal, navigation, playlist scrolling, and browser download handling. Repeat the core import and queue flow in Windows Edge. The automated mobile-layout check guards key responsive CSS rules; it does not replace these device checks.

When Spotify is configured, playlist metadata is live; when Jamendo is configured, its search results and format availability are live. Otherwise each feature uses a labeled mock mode. Mock candidates cannot be confirmed or downloaded. Native browser downloads do not expose reliable transfer progress to Wave; Wave reports them as sent and waits for user confirmation. The cross-origin server may override the requested filename; use your browser's Save As option to rename it if needed. ZIP creation is local in the browser and requires selecting the downloaded files again.

## Deployment notes

This project uses the Next.js App Router and can run on a platform supporting Next.js server routes. Use HTTPS in production and configure `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`, `SPOTIFY_REDIRECT_URI`, `SESSION_SECRET`, and `JAMENDO_CLIENT_ID` in the host's encrypted environment settings as needed. Register the exact HTTPS Spotify callback URL in the Spotify Dashboard. Token sessions are encrypted server-side using `SESSION_SECRET`. The included request throttles are process-local and suitable only for a single-instance personal setup; use a shared limiter for multiple instances. Do not store downloaded audio persistently on a shared server. Complete the Android Chrome and Windows Edge device checks above against the target deployment before release.

## Automated checks

`npm test` runs the regression suite for playlist URL validation and pagination, match scoring, quality selection, queue eligibility, safe filenames, API error handling, app throttling, Jamendo permission and format failures, missing credentials, and responsive CSS rules. Run `npm run build` before deployment to type-check and compile the production app. The mobile CSS check is not a substitute for testing on a physical Android device.
