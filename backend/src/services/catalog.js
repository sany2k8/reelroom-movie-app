import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { config } from "../config.js";
import { getStorage } from "../storage/index.js";
import { logger } from "../logger.js";
import { probe, qualityLabel } from "./media.js";
import { searchMovie, movieDetails, shapeDetails, tmdbEnabled } from "./tmdb.js";

const VIDEO_EXTENSIONS = new Set([".mp4", ".m4v", ".mkv", ".webm", ".mov", ".avi"]);
const SUBTITLE_EXTENSIONS = new Set([".vtt", ".srt"]);
const POSTER_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp", ".avif"];

/** Browsers can only play what they can play — the rest needs a transcode or a download. */
const BROWSER_PLAYABLE = new Set([".mp4", ".m4v", ".webm", ".mov"]);

/**
 * TMDB gives us a language, not a "category". This is the same shelf-labelling
 * cinehub24 does (Hollywood / Bollywood / Tamil / …) derived from real metadata
 * instead of a hand-maintained field.
 */
const LANGUAGE_CATEGORY = {
  en: "Hollywood",
  hi: "Bollywood",
  ta: "Tamil",
  ml: "Malayalam",
  te: "Telugu",
  kn: "Kannada",
  bn: "Bengali",
  mr: "Marathi",
  pa: "Punjabi",
  ko: "Korean",
  ja: "Japanese",
  zh: "Chinese",
  fr: "French",
  es: "Spanish",
  de: "German",
  it: "Italian",
  ru: "Russian",
  ar: "Arabic",
  tr: "Turkish",
  th: "Thai",
};

let catalog = [];
let lastScan = null;
let scanning = false;

export const getCatalog = () => catalog;
export const getMovie = (id) => catalog.find((m) => m.id === id) ?? null;
export const getScanState = () => ({ lastScan, scanning, count: catalog.length });

function slugify(value) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Pulls "Movie Name (2019)" or "Movie.Name.2019.1080p.BluRay" apart into a
 * searchable title and a year, so a plain folder of files enriches correctly.
 */
export function parseFilename(filename) {
  const base = path.basename(filename, path.extname(filename));

  let working = base.replace(/[._]+/g, " ").replace(/\s+/g, " ").trim();

  let year = null;
  const yearMatch = working.match(/\b(19\d{2}|20\d{2})\b/);
  if (yearMatch) {
    year = Number(yearMatch[1]);
    working = working.slice(0, yearMatch.index);
  }

  // Strip release-group noise that would wreck the TMDB search.
  working = working
    .replace(
      /\b(2160p|1080p|720p|480p|4k|uhd|hdr|bluray|blu-ray|brrip|bdrip|webrip|web-dl|webdl|hdrip|dvdrip|hevc|x264|x265|h264|h265|aac|ac3|dts|ddp5?1?|10bit|dual audio|multi|esub|hq)\b/gi,
      " ",
    )
    .replace(/[([{].*?[)\]}]/g, " ")
    .replace(/[-–—]+$/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return { title: working || base, year };
}

async function readOverrides() {
  try {
    const raw = await fsp.readFile(config.paths.overrides, "utf-8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error("movies.json must contain an array");
    return parsed;
  } catch (err) {
    if (err.code !== "ENOENT") {
      logger.warn({ err: err.message }, "catalog.overrides_unreadable");
    }
    return [];
  }
}

async function listVideoFiles() {
  const entries = await getStorage().list();
  return entries.sort((a, b) => a.key.localeCompare(b.key));
}

async function findSubtitles(videoFile) {
  const base = path.basename(videoFile, path.extname(videoFile));
  try {
    const entries = await getStorage().listAll();
    return entries
      .filter((name) => {
        const ext = path.extname(name).toLowerCase();
        return SUBTITLE_EXTENSIONS.has(ext) && name.startsWith(base);
      })
      .map((name) => {
        const withoutExt = path.basename(name, path.extname(name));
        const tag = withoutExt.slice(base.length).replace(/^[.\-_]/, "");
        return { lang: tag || "en", label: tag ? tag.toUpperCase() : "English", file: name };
      });
  } catch {
    return [];
  }
}

function findLocalPoster(override, title, videoFile) {
  const candidates = [];
  if (override?.poster) candidates.push(override.poster);

  const bases = [path.basename(videoFile, path.extname(videoFile)), title, slugify(title)];
  for (const base of bases) {
    for (const ext of POSTER_EXTENSIONS) candidates.push(`${base}${ext}`);
  }

  for (const candidate of candidates) {
    const full = path.join(config.paths.posters, candidate);
    if (full.startsWith(config.paths.posters) && fs.existsSync(full)) {
      return `/posters/${encodeURIComponent(candidate)}`;
    }
  }
  return null;
}

async function buildEntry(entry, overridesByFile, previousById) {
  const videoFile = entry.key;
  const override = overridesByFile.get(videoFile.toLowerCase()) ?? {};

  const parsed = parseFilename(videoFile);
  const title = override.title ?? parsed.title;
  const year = override.year ?? parsed.year ?? null;
  const id = String(override.id ?? (slugify(`${title}-${year ?? ""}`) || slugify(videoFile)));

  const previous = previousById.get(id);
  const unchanged =
    previous && previous.file === videoFile && previous.sizeBytes === entry.size && previous.tmdbId;

  // A file that hasn't changed keeps its enrichment — a rescan of a big library
  // shouldn't re-probe and re-fetch everything.
  const technical = unchanged
    ? previous.technical
    : (await probe(await getStorage().probeInput(videoFile))) ?? previous?.technical ?? null;

  let tmdb = unchanged ? previous.tmdb : null;
  if (!tmdb && tmdbEnabled() && override.tmdb !== false) {
    const hit = override.tmdbId
      ? { id: override.tmdbId }
      : await searchMovie(override.searchTitle ?? title, year);
    if (hit) tmdb = shapeDetails(await movieDetails(hit.id));
  }

  const ext = path.extname(videoFile).toLowerCase();
  const genres = override.genre ?? override.genres ?? tmdb?.genres ?? [];
  const language = override.language ?? tmdb?.originalLanguage ?? null;
  const category =
    override.category ?? (language ? LANGUAGE_CATEGORY[language] ?? "World" : "Uncategorised");

  const localPoster = findLocalPoster(override, title, videoFile);
  const poster =
    localPoster ?? (tmdb?.posterPath ? `/api/img/w500${tmdb.posterPath}` : "/posters/placeholder.svg");
  const backdrop = tmdb?.backdropPath ? `/api/img/w1280${tmdb.backdropPath}` : null;

  const subtitles = (await findSubtitles(videoFile)).map((s) => ({
    ...s,
    url: `/api/subtitles/${encodeURIComponent(id)}/${encodeURIComponent(s.file)}`,
  }));

  const durationSeconds =
    technical?.durationSeconds ||
    (tmdb?.runtimeMinutes ? tmdb.runtimeMinutes * 60 : 0) ||
    parseDurationString(override.duration);

  return {
    id,
    title,
    year: year ?? (tmdb?.releaseDate ? Number(tmdb.releaseDate.slice(0, 4)) : null),
    sortTitle: title.replace(/^(the|a|an)\s+/i, "").toLowerCase(),
    file: videoFile,
    sizeBytes: entry.size,
    addedAt: new Date(entry.mtime).toISOString(),

    description: override.description ?? tmdb?.overview ?? null,
    tagline: tmdb?.tagline ?? null,
    genres,
    category,
    language,
    rating: override.rating ?? tmdb?.rating ?? null,
    voteCount: tmdb?.voteCount ?? null,
    certification: tmdb?.certification ?? null,

    durationSeconds,
    runtimeMinutes: durationSeconds ? Math.round(durationSeconds / 60) : null,
    quality: technical ? qualityLabel(technical.height) : null,
    width: technical?.width ?? null,
    height: technical?.height ?? null,
    videoCodec: technical?.videoCodec ?? null,
    audioTracks: technical?.audioTracks ?? [],

    poster,
    backdrop,
    trailerKey: tmdb?.trailerKey ?? null,
    cast: (tmdb?.cast ?? []).map((c) => ({
      ...c,
      profile: c.profilePath ? `/api/img/w185${c.profilePath}` : null,
    })),
    directors: tmdb?.directors ?? [],
    writers: tmdb?.writers ?? [],
    tmdbId: tmdb?.tmdbId ?? null,
    imdbId: tmdb?.imdbId ?? null,

    subtitles,
    playableInBrowser: BROWSER_PLAYABLE.has(ext),
    container: ext.replace(".", ""),

    // Kept out of API responses; only used to skip work on the next rescan.
    technical,
    tmdb,
  };
}

function parseDurationString(value) {
  if (!value) return 0;
  const minutes = Number(String(value).match(/(\d+)\s*min/i)?.[1]);
  return Number.isFinite(minutes) ? minutes * 60 : 0;
}

async function loadSnapshot() {
  try {
    const raw = await fsp.readFile(config.paths.catalogSnapshot, "utf-8");
    return JSON.parse(raw);
  } catch {
    return { movies: [], scannedAt: null };
  }
}

async function saveSnapshot() {
  await fsp.mkdir(config.paths.data, { recursive: true });
  await fsp.writeFile(
    config.paths.catalogSnapshot,
    JSON.stringify({ scannedAt: lastScan, movies: catalog }, null, 2),
    "utf-8",
  );
}

export async function scan({ force = false } = {}) {
  if (scanning) return getScanState();
  scanning = true;
  const startedAt = Date.now();

  try {
    const [overrides, files] = await Promise.all([readOverrides(), listVideoFiles()]);
    // Keyed case-insensitively: macOS filesystems are case-preserving but not
    // case-sensitive, so a movies.json entry written as "maareesan.mp4" must
    // still match a file on disk named "Maareesan.mp4".
    const overridesByFile = new Map(
      overrides.filter((o) => o.file).map((o) => [o.file.toLowerCase(), o]),
    );

    const snapshot = force ? { movies: [] } : await loadSnapshot();
    const previousById = new Map((snapshot.movies ?? []).map((m) => [m.id, m]));

    const built = [];
    for (const entry of files) {
      try {
        built.push(await buildEntry(entry, overridesByFile, previousById));
      } catch (err) {
        logger.error({ err: err.message, file: entry.key }, "catalog.entry_failed");
      }
    }

    catalog = built;
    lastScan = new Date().toISOString();
    await saveSnapshot();

    logger.info(
      { count: catalog.length, ms: Date.now() - startedAt, tmdb: tmdbEnabled() },
      "catalog.scanned",
    );
  } finally {
    scanning = false;
  }

  return getScanState();
}

/** Loads the snapshot immediately, then refreshes in the background. */
export async function initCatalog() {
  const snapshot = await loadSnapshot();
  if (snapshot.movies?.length) {
    catalog = snapshot.movies;
    lastScan = snapshot.scannedAt;
    logger.info({ count: catalog.length }, "catalog.snapshot_loaded");
    scan().catch((err) => logger.error({ err: err.message }, "catalog.background_scan_failed"));
  } else {
    await scan();
  }
}

/** Everything the filter sidebar needs, derived from what is actually on disk. */
export function facets() {
  const genres = new Set();
  const categories = new Set();
  const years = new Set();
  const qualities = new Set();

  for (const m of catalog) {
    m.genres.forEach((g) => genres.add(g));
    if (m.category) categories.add(m.category);
    if (m.year) years.add(m.year);
    if (m.quality) qualities.add(m.quality);
  }

  return {
    genres: [...genres].sort(),
    categories: [...categories].sort(),
    years: [...years].sort((a, b) => b - a),
    qualities: [...qualities],
    letters: [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ#"],
    total: catalog.length,
  };
}
