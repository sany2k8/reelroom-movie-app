import { Router } from "express";
import { z } from "zod";
import { getCatalog, getMovie, facets, scan, getScanState } from "../services/catalog.js";
import { listFlags, progressMap } from "../services/library.js";
import { toCardMovie, toPublicMovie } from "../services/serialize.js";
import { HttpError, asyncRoute } from "../middleware/errors.js";

export const moviesRouter = Router();

const csv = z
  .string()
  .optional()
  .transform((v) => (v ? v.split(",").map((s) => s.trim()).filter(Boolean) : []));

const querySchema = z.object({
  q: z.string().trim().optional(),
  genre: csv,
  category: csv,
  quality: csv,
  year: csv,
  yearMin: z.coerce.number().int().optional(),
  yearMax: z.coerce.number().int().optional(),
  ratingMin: z.coerce.number().min(0).max(10).optional(),
  ratingMax: z.coerce.number().min(0).max(10).optional(),
  letter: z.string().length(1).optional(),
  list: z.enum(["watchlist", "favourite"]).optional(),
  sort: z.enum(["added", "title", "year", "rating", "runtime", "random"]).default("added"),
  order: z.enum(["asc", "desc"]).default("desc"),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(60).default(24),
});

/** Cheap fuzzy match across the fields a viewer would actually type. */
function matchesQuery(movie, q) {
  const haystack = [
    movie.title,
    movie.year,
    movie.category,
    movie.tagline,
    movie.description,
    ...(movie.genres ?? []),
    ...(movie.directors ?? []),
    ...(movie.cast ?? []).slice(0, 8).map((c) => c.name),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return q
    .toLowerCase()
    .split(/\s+/)
    .every((term) => haystack.includes(term));
}

function firstLetter(movie) {
  const ch = movie.sortTitle?.[0]?.toUpperCase() ?? "#";
  return /[A-Z]/.test(ch) ? ch : "#";
}

function applyFilters(movies, f, { watchlistIds } = {}) {
  return movies.filter((m) => {
    if (f.q && !matchesQuery(m, f.q)) return false;
    if (f.genre.length && !f.genre.some((g) => m.genres.includes(g))) return false;
    if (f.category.length && !f.category.includes(m.category)) return false;
    if (f.quality.length && !f.quality.includes(m.quality)) return false;
    if (f.year.length && !f.year.includes(String(m.year))) return false;
    if (f.yearMin != null && (m.year ?? 0) < f.yearMin) return false;
    if (f.yearMax != null && (m.year ?? 9999) > f.yearMax) return false;
    if (f.ratingMin != null && (m.rating ?? 0) < f.ratingMin) return false;
    if (f.ratingMax != null && (m.rating ?? 10) > f.ratingMax) return false;
    if (f.letter && firstLetter(m) !== f.letter.toUpperCase()) return false;
    if (watchlistIds && !watchlistIds.has(m.id)) return false;
    return true;
  });
}

const COMPARATORS = {
  added: (a, b) => new Date(a.addedAt) - new Date(b.addedAt),
  title: (a, b) => a.sortTitle.localeCompare(b.sortTitle),
  year: (a, b) => (a.year ?? 0) - (b.year ?? 0),
  rating: (a, b) => (a.rating ?? 0) - (b.rating ?? 0),
  runtime: (a, b) => (a.durationSeconds ?? 0) - (b.durationSeconds ?? 0),
};

function sortMovies(movies, sort, order) {
  if (sort === "random") return movies.sort(() => Math.random() - 0.5);
  const cmp = COMPARATORS[sort] ?? COMPARATORS.added;
  const sorted = movies.sort(cmp);
  return order === "desc" ? sorted.reverse() : sorted;
}

/** Merges each card with this viewer's own progress and list state. */
function decorate(movies, profileId) {
  const progress = progressMap(profileId);
  const flags = listFlags(profileId);

  return movies.map((m) =>
    toCardMovie(m, {
      progress: progress.get(m.id) ?? null,
      inWatchlist: flags.get(m.id)?.watchlist ?? false,
      isFavourite: flags.get(m.id)?.favourite ?? false,
    }),
  );
}

moviesRouter.get("/facets", (_req, res) => {
  res.json(facets());
});

moviesRouter.get("/", (req, res) => {
  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) throw new HttpError(400, parsed.error.issues[0].message, "INVALID_QUERY");
  const f = parsed.data;

  const watchlistIds = f.list
    ? new Set(
        [...listFlags(req.profile.id).entries()]
          .filter(([, v]) => v[f.list])
          .map(([id]) => id),
      )
    : null;

  const filtered = applyFilters([...getCatalog()], f, { watchlistIds });
  const sorted = sortMovies(filtered, f.sort, f.order);

  const start = (f.page - 1) * f.limit;
  const pageItems = sorted.slice(start, start + f.limit);

  res.json({
    items: decorate(pageItems, req.profile.id),
    page: f.page,
    limit: f.limit,
    total: sorted.length,
    totalPages: Math.max(1, Math.ceil(sorted.length / f.limit)),
    hasMore: start + f.limit < sorted.length,
  });
});

/**
 * Homepage payload in one request — hero carousel plus every rail — so the
 * first paint isn't a waterfall of six round trips.
 */
moviesRouter.get("/home", (req, res) => {
  const all = getCatalog();
  const progress = progressMap(req.profile.id);
  const flags = listFlags(req.profile.id);

  const card = (m) =>
    toCardMovie(m, {
      progress: progress.get(m.id) ?? null,
      inWatchlist: flags.get(m.id)?.watchlist ?? false,
      isFavourite: flags.get(m.id)?.favourite ?? false,
    });

  const hero = [...all]
    .filter((m) => m.backdrop || m.poster)
    .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))
    .slice(0, 6)
    .map((m) =>
      toPublicMovie(m, {
        progress: progress.get(m.id) ?? null,
        inWatchlist: flags.get(m.id)?.watchlist ?? false,
        isFavourite: flags.get(m.id)?.favourite ?? false,
      }),
    );

  const byId = new Map(all.map((m) => [m.id, m]));
  const continueWatching = [...progress.values()]
    .filter((p) => !p.completed && p.position >= 15 && byId.has(p.movieId))
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
    .map((p) => card(byId.get(p.movieId)));

  const recentlyAdded = [...all]
    .sort((a, b) => new Date(b.addedAt) - new Date(a.addedAt))
    .slice(0, 20)
    .map(card);

  const topRated = [...all]
    .filter((m) => m.rating)
    .sort((a, b) => b.rating - a.rating)
    .slice(0, 20)
    .map(card);

  // Genre rails are built from what the library actually contains, so an empty
  // "Western" shelf never renders.
  const genreCounts = new Map();
  for (const m of all) {
    for (const g of m.genres) genreCounts.set(g, (genreCounts.get(g) ?? 0) + 1);
  }
  const genreRails = [...genreCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([genre]) => ({
      key: `genre:${genre}`,
      title: genre,
      href: `/movies?genre=${encodeURIComponent(genre)}`,
      items: all.filter((m) => m.genres.includes(genre)).slice(0, 20).map(card),
    }));

  const watchlist = [...flags.entries()]
    .filter(([, v]) => v.watchlist)
    .map(([id]) => byId.get(id))
    .filter(Boolean)
    .map(card);

  const rails = [
    continueWatching.length && {
      key: "continue",
      title: "Continue watching",
      href: "/movies?sort=added",
      items: continueWatching,
    },
    watchlist.length && { key: "watchlist", title: "Your watchlist", href: "/watchlist", items: watchlist },
    { key: "recent", title: "Recently added", href: "/movies?sort=added&order=desc", items: recentlyAdded },
    topRated.length && {
      key: "top",
      title: "Top rated",
      href: "/movies?sort=rating&order=desc",
      items: topRated,
    },
    ...genreRails,
  ].filter(Boolean);

  res.json({ hero, rails, stats: { total: all.length, ...getScanState() } });
});

moviesRouter.get("/:id", (req, res) => {
  const movie = getMovie(req.params.id);
  if (!movie) throw new HttpError(404, "Movie not found", "NOT_FOUND");

  const flags = listFlags(req.profile.id).get(movie.id) ?? {};
  const progress = progressMap(req.profile.id).get(movie.id) ?? null;

  // "More like this": shared genres first, then same category, never itself.
  const related = getCatalog()
    .filter((m) => m.id !== movie.id)
    .map((m) => ({
      movie: m,
      score:
        m.genres.filter((g) => movie.genres.includes(g)).length * 2 +
        (m.category === movie.category ? 1 : 0),
    }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || (b.movie.rating ?? 0) - (a.movie.rating ?? 0))
    .slice(0, 12)
    .map((r) => toCardMovie(r.movie));

  res.json({
    ...toPublicMovie(movie, {
      progress,
      inWatchlist: flags.watchlist ?? false,
      isFavourite: flags.favourite ?? false,
      streamUrl: `/api/stream/${encodeURIComponent(movie.id)}`,
      downloadUrl: `/api/download/${encodeURIComponent(movie.id)}`,
    }),
    related,
  });
});

moviesRouter.post(
  "/rescan",
  asyncRoute(async (req, res) => {
    const state = await scan({ force: req.query.force === "true" });
    res.json(state);
  }),
);
