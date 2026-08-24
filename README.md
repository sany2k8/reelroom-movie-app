# ReelRoom Movie App

A simple movie app to browse and search movies. This repository contains the source for the ReelRoom frontend and/or backend (depending on the project layout).

<img width="1815" height="812" alt="frontend" src="https://github.com/user-attachments/assets/78fc2b51-8926-440c-8507-b9f8afb70c41" />

## Features
- Browse movies
- Search by title
- Details and trailers (if available)
- Stream with all video player controls

## Quick start

Prerequisites:
- Node.js 16+ (if this is a Node project)
- npm or yarn

Install dependencies

```bash
npm install
# or
# yarn install
```

Run the project (example)

```bash
npm start
# or
# npm run dev
```

Run tests

```bash
npm test
```

## Contributing
Thanks for your interest in contributing! See CONTRIBUTING.md for details on how to contribute.

## Adding films

Drop a video into `movies/`. That is the whole required step — the filename is parsed for title and
year (`Movie.Name.2019.1080p.BluRay.mp4` works), `ffprobe` reads the real duration, resolution and
audio tracks, and TMDB fills in rating, synopsis, genres, cast, backdrop and trailer.

The catalog refreshes on every boot. To force a full re-fetch:

```bash
npm run rescan
```

`movies.json` is optional and purely an **override** layer, matched to a file by `file` (case
insensitive):

```json
[
  {
    "file": "maareesan.mp4",
    "id": "1",
    "title": "Maareesan",
    "year": 2025,
    "genre": ["Thriller", "Drama"],
    "description": "…",
    "poster": "maareesan.webp",
    "category": "Tamil",
    "tmdbId": 1234567
  }
]
```

Every field is optional. `id` sets the URL slug (omit it and one is derived from the title).
`"tmdb": false` opts a title out of enrichment entirely; `tmdbId` pins a specific match when the
title search guesses wrong.

## Storage

Media lives behind a storage adapter, so moving from a folder to a bucket is config, not a rewrite.
The catalog scanner, ffprobe, the streaming route and the import watcher all talk to the same
interface.

**Local (default)** — reads `MOVIES_DIR`:

```bash
STORAGE_DRIVER=local
```

**S3-compatible** — AWS S3, Cloudflare R2, MinIO or Backblaze B2. Install the SDK first:

```bash
npm --prefix backend install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
```

Then set `STORAGE_DRIVER=s3`, `S3_BUCKET`, credentials, and `S3_ENDPOINT` for anything that isn't
AWS. ffprobe reads a presigned URL and range-requests only the header, so scanning doesn't download
your library.

By default the app proxies video bytes from the bucket, which keeps the PIN gate in front of every
request. Setting `S3_SIGNED_URLS=true` instead redirects the player straight to a presigned URL —
much cheaper, but that URL then works for anyone holding it until it expires.

| | Local | S3 |
|---|---|---|
| New files detected by | filesystem events | polling (`WATCH_POLL_SECONDS`) |
| Bytes served by | this app | this app, or a presigned redirect |
| Needs the AWS SDK | no | yes |

## Auto-import

New files are picked up without a restart — drop one in and it appears. Because a copy fires an
event the moment the file appears, the watcher waits for the size to stop changing
(`WATCH_STABLE_SECONDS`, default 8s) before probing, so a half-copied 2 GB file never gets imported
with a nonsense duration. Deletions are noticed too. Set `WATCH_ENABLED=false` to turn it off.

## Requests

`/requests` is a shared board — anyone signed in can ask for a film, vote on somebody else's
request, and withdraw their own. Admins can mark one added or declined.

Requests close themselves: when the watcher imports a file whose title matches an open request, it
is marked fulfilled and linked to the new film, so nobody has to tick it off manually.

## Admin

`/admin` is visible only to admins and covers library health (size, films missing artwork, films
with no TMDB match, files that won't play in a browser), scan controls, storage and auto-import
status, profile management, and active sessions with per-session revoke.

The first profile to sign in becomes the admin. If that isn't the right person, promote someone from
the host machine:

```bash
npm --prefix backend run make-admin -- <profile name>
```

Run it with no name to list profiles and see who is currently an admin.

Fixing a wrong TMDB match writes into `movies.json` rather than a hidden table, so the admin panel
and a text editor never disagree about the truth.

## Where each field comes from

Three sources, in strict priority order: **`movies.json` → TMDB → the file itself**. Anything you set
by hand always wins.

| Field | Source | Notes |
|---|---|---|
| Title, year | filename, or `movies.json` | `Movie.Name.2019.1080p.BluRay.mp4` → `Movie Name` + `2019` |
| **Rating** (⭐ 0–10) | TMDB `vote_average` | Needs `TMDB_API_KEY`. Blank without it. |
| Synopsis, tagline | TMDB `overview` | |
| **Genres** | TMDB | Drives the genre filter and the homepage genre rails |
| **Category** (Hollywood / Tamil / …) | derived from TMDB `original_language` | See below |
| Cast + headshots, director, writers | TMDB `credits` | |
| Backdrop, trailer | TMDB `images` / `videos` | Trailer is a YouTube embed |
| Certification (U/A, PG-13…) | TMDB `release_dates` | |
| Poster | `posters/` if present, else TMDB | Local artwork **wins** over TMDB |
| **Duration, resolution, quality badge** | `ffprobe`, reading the actual file | Never trusts a hand-typed runtime |
| Audio tracks, codec, file size | `ffprobe` + `stat` | Shown in the detail page's File panel |

**Category** is not a TMDB field — it's mapped from the film's original language in
`LANGUAGE_CATEGORY` (`backend/src/services/catalog.js`): `en → Hollywood`, `hi → Bollywood`,
`ta → Tamil`, `ml → Malayalam`, `te → Telugu`, `ko → Korean`, and so on. Anything unmapped becomes
`World`; with no TMDB data at all it shows `Uncategorised`. Override it per film with `"category"` in
`movies.json`, or add a language to that map.

**To enable TMDB**: put a free key from https://www.themoviedb.org/settings/api into `TMDB_API_KEY` in
`.env`, restart, then `npm run rescan`. Responses are cached to `data/tmdb/` for 30 days and images
to `data/images/`, so it works offline afterwards. Without a key the app runs fine — you just get
titles, durations and quality badges and nothing else.

**If TMDB matches the wrong film**, set `"tmdbId"` in `movies.json` to the number in the TMDB URL
(`themoviedb.org/movie/**1234567**-title`), or `"searchTitle"` to give the search a cleaner string,
then rescan. `"tmdb": false` opts a title out entirely.

**Subtitles**: put a `.vtt` or `.srt` next to the video with the same base name — `Maareesan.mp4` +
`Maareesan.en.srt`. SRT is converted to WebVTT on the fly.

## Layout

```text
backend/src/
  routes/      HTTP only — parse, call a service, serialize
  services/    catalog, tmdb, media (ffprobe), library, auth, serialize
  middleware/  auth guard, error handler
  db/          connection + append-only migrations
frontend/src/
  pages/       Home, Browse, Detail, Watch, ListPage, Login
  components/  Navbar, HeroCarousel, MovieRail, PosterCard, FilterSidebar, player/
  store/       zustand: session, toasts
  api.ts       the single typed API client
movies/        your video files (+ optional sidecar subtitles)
posters/       optional local artwork; TMDB fills the gaps
data/          SQLite, TMDB cache, catalog snapshot — all generated
legacy/        the original single-file server + static pages, superseded by backend/
```

## Features

**Browse** — hero carousel; Continue Watching, Recently Added, Top Rated and auto-generated genre
rails; faceted browse with rating range, category, genre, year, quality and A–Z, all URL-driven and
shareable; grid/list toggle; sort by added/title/year/rating/runtime/random; infinite scroll; search
across title, cast, director and genre (`/` focuses it).

**Detail** — backdrop hero, rating, certification, runtime, quality badge, genres as filter links,
cast carousel, director/writer credits, YouTube trailer modal, real file details (size, resolution,
codec, audio tracks), and a "More like this" rail scored on shared genres.

**Player** — custom controls, buffered-range scrub bar with hover time preview, volume memory,
0.5×–2× speed, subtitles, picture-in-picture, fullscreen, resume prompt, next-up on ended, and
keyboard shortcuts (space/k, ←/→, j/l, ↑/↓, f, m, c, p, 0–9, home/end).

**Per profile** — sign in with a name and the room PIN; watch progress, watchlist, favourites and
player preferences are stored per profile and follow you across devices.

## Conventions & gotchas

- **Migrations run at import time.** `db/index.js` calls `migrate()` at module load, not from
  `main()`. Services build their prepared statements at import time too, and ESM evaluates those
  before any function body runs — calling `migrate()` from `main()` throws `no such table: profiles`.
- **`movies.json` matching is case-insensitive.** macOS is case-preserving but not case-sensitive, so
  an entry written `maareesan.mp4` must still find `Maareesan.mp4` on disk. Compare raw strings and
  the override silently does nothing.
- **`sendBeacon` can only POST.** The progress endpoint is registered for both PUT and POST for
  exactly that reason — it is what saves your position when a tab closes mid-film.
- **Never gzip the video routes.** `compression` is filtered to skip `/api/stream` and
  `/api/download`; compressing an already-compressed 2 GB file burns CPU for nothing.
- **`.mkv` and `.avi` won't play in browsers.** They are catalogued and downloadable, and the player
  says so instead of failing silently. `playableInBrowser` on each entry is the flag. Re-encode to
  H.264/AAC MP4 with ffmpeg if you want in-browser playback.
- **Streaming is exempt from the rate limiter.** Seeking fires many small ranged requests; limiting
  them stalls playback.
- **The catalog snapshot is a cache, not truth.** Delete `data/catalog.json` (or run
  `npm run rescan`) whenever enrichment looks stale or wrong.
- **TMDB images are proxied, not hot-linked.** `/api/img/:size/:path` caches to `data/images`, so the
  app works offline after the first load and viewers' IPs never reach TMDB's CDN.
- **No transcoding or adaptive bitrate.** Every file streams at whatever it already is; your upload
  bandwidth is the bottleneck over a tunnel, not this server.

## Future features

- Transcoding support for unsupported file types
- Better metadata extraction
- Use cloud storage instead of local storage
