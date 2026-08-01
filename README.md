# Reelroom

A private streaming app for your own movie files. Drop videos into `movies/`, and Reelroom reads
them, enriches them from TMDB, and serves a modern browsing-and-playback experience — behind a PIN,
so it stays yours even when you expose it through ngrok or cloudflared.

Built to be *shaped* like a production streaming site (hero carousel, faceted browse, custom player,
per-profile watch state) while running entirely on one machine.

## Stack

| Layer | Choice |
|---|---|
| API | Node 20+, Express 4, ESM |
| Data | SQLite via `better-sqlite3` (WAL), append-only migrations |
| Media | HTTP range streaming; `ffprobe` for duration/resolution/audio |
| Metadata | TMDB v3, cached to disk (JSON + images) |
| Auth | Shared room PIN → hashed session token in an httpOnly cookie |
| UI | React 18 + TypeScript (strict) + Vite + Tailwind + react-router + zustand |
| Hardening | helmet CSP, rate limiting, compression, `pino` structured logs |

## Architecture

```mermaid
flowchart LR
    UI[React + Vite<br/>:5192 dev / dist in prod] -->|/api| API[Express<br/>:3000]

    API --> AUTH[auth<br/>PIN + sessions]
    API --> CAT[catalog service]
    API --> LIB[library service]
    API --> STR[stream routes]

    CAT --> FS[(movies/ + posters/)]
    CAT --> PROBE[ffprobe]
    CAT --> TMDB[TMDB API]
    TMDB --> CACHE[(data/tmdb + data/images)]
    CAT --> SNAP[(data/catalog.json)]

    AUTH --> DB[(SQLite<br/>data/reelroom.db)]
    LIB --> DB
    STR -->|206 byte ranges| FS

    TUNNEL[ngrok / cloudflared] --> API
```

The catalog lives in memory, rebuilt from disk on boot and snapshotted to `data/catalog.json` so
restarts are instant. SQLite holds only what is per-person: profiles, sessions, watch progress,
watchlist, favourites, player preferences.

### Playback and resume

```mermaid
sequenceDiagram
    participant B as Browser
    participant A as Express
    participant D as SQLite
    participant F as movies/

    B->>A: GET /api/movies/:id  (session cookie)
    A->>D: progress + list flags for this profile
    A-->>B: movie + progress.position

    Note over B: player offers "Resume at 31:31"

    B->>A: GET /api/stream/:id   Range: bytes=0-
    A->>F: createReadStream(start, end)
    A-->>B: 206 Partial Content

    loop every 10s while playing
        B->>A: PUT /api/library/progress/:id
        A->>D: upsert position/duration
    end

    Note over B: tab closes
    B->>A: sendBeacon POST /api/library/progress/:id
    A->>D: final position
```

## Setup

### Prerequisites

- **Node 20+** (`node -v`)
- **ffmpeg**, which provides `ffprobe` — `brew install ffmpeg`. Optional but strongly recommended:
  without it you lose real durations, resolution and the quality badges.

### Step 0 — shared config (do this once, before either app)

Both apps read the **same `.env` at the project root**. There is no `backend/.env` or
`frontend/.env` — the backend resolves the root path itself, so it works no matter which directory
you launch it from.

```bash
cp .env.example .env
```

Edit `.env` and set:

| Key | Notes |
|---|---|
| `REELROOM_PIN` | The Room PIN on the login screen. Change it before tunnelling. |
| `SESSION_SECRET` | `openssl rand -hex 32`. Rotating it signs everyone out. |
| `TMDB_API_KEY` | Optional but recommended — see [Where each field comes from](#where-each-field-comes-from). |

### Backend (API, port 3000)

```bash
cd backend
```

```bash
npm install
```

```bash
npm run dev
```

`npm run dev` uses `node --watch` and restarts on save. For production, `npm start` instead.

Verify it on its own, without the UI:

```bash
curl -s http://localhost:3000/api/health
```

You should get `status: ok`, a catalog count, and whether TMDB is enabled. `PORT=3011 npm run dev`
moves it if 3000 is taken.

The backend is **self-sufficient**: it scans your films, serves the API, and — if `frontend/dist`
exists — serves the built UI too. You do not need the frontend dev server running to use the app.

### Frontend (UI, port 5192)

```bash
cd frontend
```

```bash
npm install
```

```bash
npm run dev
```

Open **http://localhost:5192**. Vite proxies `/api` and `/posters` to the backend on **:3000**, so
the backend must already be running or every request 502s.

If you moved the backend port, point the proxy at it:

```bash
API_PORT=3011 npm run dev
```

Other frontend commands:

```bash
npm run typecheck    # tsc --noEmit — the gate; must pass
```

```bash
npm run build        # emits frontend/dist, which the backend then serves
```

### Which mode do I want?

|  | Two servers (dev) | One server (production-style) |
|---|---|---|
| Commands | `backend: npm run dev` + `frontend: npm run dev` | `npm run build` in `frontend/`, then `npm start` in `backend/` |
| Open | http://localhost:5192 | http://localhost:3000 |
| Hot reload | yes | no — rebuild to see changes |
| **Use this for tunnelling** | no | **yes** — tunnel :3000 |

### Root shortcuts

From the project root, these just wrap the per-app commands above:

```bash
npm run setup      # npm install in both
```

```bash
npm run serve      # build the UI, then start the API on :3000
```

```bash
npm run dev:api    # same as: cd backend && npm run dev
```

```bash
npm run dev:ui     # same as: cd frontend && npm run dev
```

**Docker** (builds both, one container, :3000):

```bash
docker compose up --build
```

## Exposing it over a tunnel

Start the app on :3000 first (`npm run serve`), then put a tunnel in front of it. Either tool works;
both terminate TLS for you, which is why `TRUST_PROXY=true` is the default.

**cloudflared** — free, no account needed for a quick share:

```bash
cloudflared tunnel --url http://localhost:3000
```

It prints a `https://<random-words>.trycloudflare.com` URL. That address is ephemeral — it changes
every restart. Install it with `brew install cloudflared`.

For a URL that survives restarts, you need a Cloudflare account and a domain on it:

```bash
cloudflared tunnel login
```

```bash
cloudflared tunnel create reelroom
```

```bash
cloudflared tunnel route dns reelroom reelroom.yourdomain.com
```

```bash
cloudflared tunnel run --url http://localhost:3000 reelroom
```

**ngrok** — same idea:

```bash
ngrok http 3000
```

### Before you share the link

1. **Change `REELROOM_PIN` in `.env`** and restart. The default `1234` is for local testing only.
2. Keep `NODE_ENV=development` unless you have a reason to switch — in `production` the session
   cookie becomes secure-only, which is correct over the https tunnel but breaks sign-in over plain
   `http://localhost:3000`.
3. Your **upload bandwidth is the bottleneck**, not this server. There's no transcoding, so a 1080p
   file streams at its full bitrate to every viewer at once.

The PIN gate covers everything including `/api/stream`, `/api/download` and `/posters`, so a leaked
tunnel URL alone gets nobody in. Sign-in is rate-limited to 10 attempts per 15 minutes per IP.

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
