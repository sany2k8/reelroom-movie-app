import { Router } from "express";
import { z } from "zod";
import { getCatalog, getMovie } from "../services/catalog.js";
import {
  clearProgress,
  continueWatching,
  getPrefs,
  listMovieIds,
  saveProgress,
  setPrefs,
  toggleListItem,
} from "../services/library.js";
import { toCardMovie } from "../services/serialize.js";
import { HttpError } from "../middleware/errors.js";

export const libraryRouter = Router();

const progressSchema = z.object({
  position: z.coerce.number().min(0),
  duration: z.coerce.number().min(0),
});

function handleProgress(req, res) {
  if (!getMovie(req.params.movieId)) throw new HttpError(404, "Movie not found", "NOT_FOUND");

  const parsed = progressSchema.safeParse(req.body ?? {});
  if (!parsed.success) throw new HttpError(400, parsed.error.issues[0].message, "INVALID_INPUT");

  res.json(
    saveProgress({
      profileId: req.profile.id,
      movieId: req.params.movieId,
      ...parsed.data,
    }),
  );
}

libraryRouter.put("/progress/:movieId", handleProgress);
// navigator.sendBeacon can only POST, and it is what saves the final position
// when a tab is closed mid-film.
libraryRouter.post("/progress/:movieId", handleProgress);

libraryRouter.delete("/progress/:movieId", (req, res) => {
  res.json({ removed: clearProgress(req.profile.id, req.params.movieId) });
});

libraryRouter.get("/continue", (req, res) => {
  const byId = new Map(getCatalog().map((m) => [m.id, m]));
  const items = continueWatching(req.profile.id)
    .filter((p) => byId.has(p.movieId))
    .map((p) => toCardMovie(byId.get(p.movieId), { progress: p }));
  res.json({ items });
});

const listParam = z.enum(["watchlist", "favourite"]);

libraryRouter.get("/lists/:list", (req, res) => {
  const parsed = listParam.safeParse(req.params.list);
  if (!parsed.success) throw new HttpError(404, "Unknown list", "NOT_FOUND");

  const byId = new Map(getCatalog().map((m) => [m.id, m]));
  const items = listMovieIds(req.profile.id, parsed.data)
    .map((id) => byId.get(id))
    .filter(Boolean)
    .map((m) => toCardMovie(m, { [parsed.data === "watchlist" ? "inWatchlist" : "isFavourite"]: true }));

  res.json({ items, total: items.length });
});

libraryRouter.put("/lists/:list/:movieId", (req, res) => {
  const parsed = listParam.safeParse(req.params.list);
  if (!parsed.success) throw new HttpError(404, "Unknown list", "NOT_FOUND");
  if (!getMovie(req.params.movieId)) throw new HttpError(404, "Movie not found", "NOT_FOUND");

  const active = req.body?.active !== false;
  toggleListItem({
    profileId: req.profile.id,
    movieId: req.params.movieId,
    list: parsed.data,
    active,
  });

  res.json({ list: parsed.data, movieId: req.params.movieId, active });
});

libraryRouter.get("/prefs", (req, res) => {
  res.json(getPrefs(req.profile.id));
});

const prefsSchema = z.object({
  volume: z.coerce.number().min(0).max(1),
  muted: z.coerce.boolean(),
  rate: z.coerce.number().min(0.25).max(4),
});

libraryRouter.put("/prefs", (req, res) => {
  const parsed = prefsSchema.safeParse(req.body ?? {});
  if (!parsed.success) throw new HttpError(400, parsed.error.issues[0].message, "INVALID_INPUT");
  res.json(setPrefs(req.profile.id, parsed.data));
});
