/** Fields kept server-side only — absolute paths and raw API payloads. */
const INTERNAL = ["technical", "tmdb", "sortTitle"];

export function toPublicMovie(movie, extras = {}) {
  if (!movie) return null;
  const clone = { ...movie };
  for (const key of INTERNAL) delete clone[key];
  return { ...clone, ...extras };
}

/** The trimmed shape used by grids and rails — keeps list payloads small. */
export function toCardMovie(movie, extras = {}) {
  if (!movie) return null;
  return {
    id: movie.id,
    title: movie.title,
    year: movie.year,
    genres: movie.genres,
    category: movie.category,
    rating: movie.rating,
    quality: movie.quality,
    runtimeMinutes: movie.runtimeMinutes,
    durationSeconds: movie.durationSeconds,
    poster: movie.poster,
    backdrop: movie.backdrop,
    certification: movie.certification,
    addedAt: movie.addedAt,
    ...extras,
  };
}
