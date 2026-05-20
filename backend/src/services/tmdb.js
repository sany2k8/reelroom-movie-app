import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { config } from "../config.js";
import { logger } from "../logger.js";

const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // metadata barely changes; refresh monthly

export const tmdbEnabled = () => Boolean(config.tmdb.apiKey);

function cachePath(key) {
  const hash = crypto.createHash("sha1").update(key).digest("hex");
  return path.join(config.paths.tmdbCache, `${hash}.json`);
}

async function readCache(key) {
  try {
    const raw = await fsp.readFile(cachePath(key), "utf-8");
    const entry = JSON.parse(raw);
    // Stale entries are still returned when the API is unreachable — see get().
    return { ...entry, stale: Date.now() - entry.at > CACHE_TTL_MS };
  } catch {
    return null;
  }
}

async function writeCache(key, data) {
  await fsp.mkdir(config.paths.tmdbCache, { recursive: true });
  await fsp.writeFile(cachePath(key), JSON.stringify({ at: Date.now(), data }), "utf-8");
}

/**
 * TMDB hands out two credentials on the same settings page: a v3 API key
 * (32 hex chars, passed as ?api_key=) and a v4 Read Access Token (a JWT, passed
 * as a Bearer header). Pasting the wrong one is the single most common setup
 * mistake, so accept either rather than 401-ing on a perfectly valid token.
 */
const usesBearerToken = () => config.tmdb.apiKey.startsWith("eyJ");

async function get(endpoint, params = {}) {
  const query = new URLSearchParams({ language: config.tmdb.language, ...params });
  if (!usesBearerToken()) query.set("api_key", config.tmdb.apiKey);

  // Cache key deliberately excludes the credential.
  const cacheKey = `${endpoint}?${new URLSearchParams({ ...params, lang: config.tmdb.language })}`;
  const cached = await readCache(cacheKey);
  if (cached && !cached.stale) return cached.data;

  const url = `${config.tmdb.baseUrl}${endpoint}?${query}`;
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(12_000),
      headers: usesBearerToken()
        ? { Authorization: `Bearer ${config.tmdb.apiKey}`, accept: "application/json" }
        : undefined,
    });
    if (res.status === 401) {
      // Loud, because every other symptom of this is just "metadata is missing".
      logger.error(
        "TMDB rejected the credential (401). Check TMDB_API_KEY — it must be either the v3 API key or the v4 Read Access Token from themoviedb.org/settings/api",
      );
      throw new Error("TMDB 401");
    }
    if (!res.ok) throw new Error(`TMDB ${res.status}`);
    const data = await res.json();
    await writeCache(cacheKey, data);
    return data;
  } catch (err) {
    if (cached) {
      logger.warn({ endpoint, err: err.message }, "tmdb.using_stale_cache");
      return cached.data;
    }
    logger.warn({ endpoint, err: err.message }, "tmdb.request_failed");
    return null;
  }
}

/** Best-effort title match. Year narrows it a lot when we have one. */
export async function searchMovie(title, year) {
  if (!tmdbEnabled()) return null;
  const params = { query: title, include_adult: "false" };
  if (year) params.year = String(year);

  let data = await get("/search/movie", params);
  if (!data?.results?.length && year) {
    data = await get("/search/movie", { query: title, include_adult: "false" });
  }
  return data?.results?.[0] ?? null;
}

export async function movieDetails(tmdbId) {
  if (!tmdbEnabled()) return null;
  return get(`/movie/${tmdbId}`, {
    append_to_response: "credits,videos,images,release_dates",
    include_image_language: "en,null",
  });
}

/** Flattens the TMDB payload into exactly the fields the UI renders. */
export function shapeDetails(details) {
  if (!details) return {};

  const trailer = (details.videos?.results ?? [])
    .filter((v) => v.site === "YouTube" && ["Trailer", "Teaser"].includes(v.type))
    .sort((a, b) => (b.official ? 1 : 0) - (a.official ? 1 : 0))[0];

  const cast = (details.credits?.cast ?? []).slice(0, 20).map((c) => ({
    id: c.id,
    name: c.name,
    character: c.character || null,
    profilePath: c.profile_path || null,
  }));

  const crew = details.credits?.crew ?? [];
  const directors = crew.filter((c) => c.job === "Director").map((c) => c.name);
  const writers = crew
    .filter((c) => ["Screenplay", "Writer", "Story"].includes(c.job))
    .map((c) => c.name);

  const certification = (details.release_dates?.results ?? [])
    .flatMap((r) => r.release_dates ?? [])
    .map((r) => r.certification)
    .find((c) => c);

  return {
    tmdbId: details.id,
    imdbId: details.imdb_id || null,
    tagline: details.tagline || null,
    overview: details.overview || null,
    rating: details.vote_average ? Number(details.vote_average.toFixed(1)) : null,
    voteCount: details.vote_count || null,
    genres: (details.genres ?? []).map((g) => g.name),
    releaseDate: details.release_date || null,
    runtimeMinutes: details.runtime || null,
    posterPath: details.poster_path || null,
    backdropPath: details.backdrop_path || null,
    originalLanguage: details.original_language || null,
    productionCountries: (details.production_countries ?? []).map((c) => c.iso_3166_1),
    trailerKey: trailer?.key ?? null,
    certification: certification || null,
    cast,
    directors: [...new Set(directors)],
    writers: [...new Set(writers)].slice(0, 4),
  };
}

/**
 * Images are proxied and cached on disk rather than hot-linked, so the app keeps
 * working offline and the tunnel doesn't leak viewer IPs to TMDB's CDN.
 */
export async function cachedImage(size, imagePath) {
  const safeSize = /^(w\d{2,4}|original)$/.test(size) ? size : "w500";
  const safePath = imagePath.replace(/[^A-Za-z0-9._-]/g, "");
  if (!safePath) return null;

  const file = path.join(config.paths.imageCache, safeSize, safePath);
  if (fs.existsSync(file)) return file;

  const url = `${config.tmdb.imageBaseUrl}/${safeSize}/${safePath}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) throw new Error(`TMDB image ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    await fsp.mkdir(path.dirname(file), { recursive: true });
    await fsp.writeFile(file, buf);
    return file;
  } catch (err) {
    logger.warn({ err: err.message, imagePath }, "tmdb.image_failed");
    return null;
  }
}
