import { Router } from "express";
import { z } from "zod";
import { db } from "../db/index.js";
import { config } from "../config.js";
import { logger } from "../logger.js";
import { getCatalog, getMovie, getScanState, scan } from "../services/catalog.js";
import { checkNow } from "../services/watcher.js";
import { getStorage } from "../storage/index.js";
import { tmdbEnabled } from "../services/tmdb.js";
import { listProfiles, setProfileAdmin } from "../services/auth.js";
import { openRequestCount } from "../services/requests.js";
import { HttpError, asyncRoute } from "../middleware/errors.js";
import fsp from "node:fs/promises";

export const adminRouter = Router();

const sessionRows = db.prepare(`
  SELECT s.token, s.user_agent, s.created_at, s.expires_at, p.name, p.id AS profile_id
  FROM sessions s JOIN profiles p ON p.id = s.profile_id
  WHERE s.expires_at > datetime('now')
  ORDER BY s.created_at DESC
`);
const deleteSession = db.prepare("DELETE FROM sessions WHERE token = ?");
const deleteProfileSessions = db.prepare("DELETE FROM sessions WHERE profile_id = ?");
const progressRows = db.prepare(`
  SELECT pr.movie_id, pr.position, pr.duration, pr.updated_at, p.name
  FROM progress pr JOIN profiles p ON p.id = pr.profile_id
  ORDER BY pr.updated_at DESC LIMIT 20
`);

adminRouter.get(
  "/overview",
  asyncRoute(async (req, res) => {
    const catalog = getCatalog();
    const storage = getStorage();

    const totalBytes = catalog.reduce((sum, m) => sum + (m.sizeBytes ?? 0), 0);
    const missingArtwork = catalog.filter((m) => m.poster.endsWith("placeholder.svg")).length;
    const unmatched = catalog.filter((m) => !m.tmdbId);

    res.json({
      profile: req.profile,
      catalog: {
        ...getScanState(),
        totalBytes,
        missingArtwork,
        unmatched: unmatched.map((m) => ({ id: m.id, title: m.title, file: m.file })),
        noSubtitles: catalog.filter((m) => m.subtitles.length === 0).length,
        unplayable: catalog
          .filter((m) => !m.playableInBrowser)
          .map((m) => ({ id: m.id, title: m.title, container: m.container })),
      },
      storage: { driver: storage.kind, location: storage.describe() },
      tmdb: tmdbEnabled() ? "enabled" : "disabled",
      watch: config.watch,
      openRequests: openRequestCount(),
      profiles: listProfiles(),
      recentActivity: progressRows.all().map((r) => ({
        movieId: r.movie_id,
        title: getMovie(r.movie_id)?.title ?? r.movie_id,
        who: r.name,
        percent: r.duration ? Math.round((r.position / r.duration) * 100) : 0,
        at: r.updated_at,
      })),
    });
  }),
);

adminRouter.post(
  "/rescan",
  asyncRoute(async (req, res) => {
    const force = req.query.force === "true";
    logger.info({ by: req.profile.name, force }, "admin.rescan");
    res.json(await scan({ force }));
  }),
);

/** Same code path the watcher uses, for when you don't want to wait for a poll. */
adminRouter.post(
  "/check-now",
  asyncRoute(async (_req, res) => {
    await checkNow();
    res.json(getScanState());
  }),
);

const overrideSchema = z.object({
  tmdbId: z.coerce.number().int().positive().optional().nullable(),
  searchTitle: z.string().trim().max(200).optional(),
  title: z.string().trim().max(200).optional(),
  year: z.coerce.number().int().min(1880).max(2100).optional().nullable(),
  category: z.string().trim().max(60).optional(),
});

/**
 * Writes into movies.json rather than a database table, so the override layer
 * stays a single human-editable file — the admin panel and a text editor can't
 * disagree about what the truth is.
 */
adminRouter.put(
  "/movies/:id/override",
  asyncRoute(async (req, res) => {
    const movie = getMovie(req.params.id);
    if (!movie) throw new HttpError(404, "Movie not found", "NOT_FOUND");

    const parsed = overrideSchema.safeParse(req.body ?? {});
    if (!parsed.success) throw new HttpError(400, parsed.error.issues[0].message, "INVALID_INPUT");

    let overrides = [];
    try {
      overrides = JSON.parse(await fsp.readFile(config.paths.overrides, "utf-8"));
      if (!Array.isArray(overrides)) overrides = [];
    } catch {
      overrides = [];
    }

    const index = overrides.findIndex(
      (o) => o.file && o.file.toLowerCase() === movie.file.toLowerCase(),
    );
    const patch = Object.fromEntries(
      Object.entries(parsed.data).filter(([, v]) => v !== undefined && v !== ""),
    );
    const entry = { ...(index >= 0 ? overrides[index] : { file: movie.file }), ...patch };

    if (index >= 0) overrides[index] = entry;
    else overrides.push(entry);

    await fsp.writeFile(config.paths.overrides, JSON.stringify(overrides, null, 2) + "\n", "utf-8");
    logger.info({ file: movie.file, patch, by: req.profile.name }, "admin.override_written");

    await scan({ force: true });
    res.json({ override: entry, movie: getMovie(req.params.id) });
  }),
);

adminRouter.get("/sessions", (_req, res) => {
  res.json({
    items: sessionRows.all().map((s) => ({
      // The raw token is a credential; a short prefix is enough to identify a row.
      id: s.token.slice(0, 12),
      token: s.token,
      profileId: s.profile_id,
      name: s.name,
      userAgent: s.user_agent,
      createdAt: s.created_at,
      expiresAt: s.expires_at,
    })),
  });
});

adminRouter.delete("/sessions/:token", (req, res) => {
  res.json({ revoked: deleteSession.run(req.params.token).changes > 0 });
});

adminRouter.delete("/profiles/:id/sessions", (req, res) => {
  const changes = deleteProfileSessions.run(Number(req.params.id)).changes;
  logger.info({ profileId: req.params.id, changes, by: req.profile.name }, "admin.sessions_revoked");
  res.json({ revoked: changes });
});

adminRouter.put("/profiles/:id/admin", (req, res) => {
  const id = Number(req.params.id);
  const makeAdmin = req.body?.isAdmin !== false;

  // Don't allow the room to end up with nobody who can administer it.
  if (!makeAdmin) {
    const admins = listProfiles().filter((p) => p.isAdmin);
    if (admins.length <= 1 && admins[0]?.id === id) {
      throw new HttpError(400, "That's the only admin left", "LAST_ADMIN");
    }
  }

  setProfileAdmin(id, makeAdmin);
  res.json({ id, isAdmin: makeAdmin });
});
