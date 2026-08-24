import path from "node:path";
import { pipeline } from "node:stream/promises";
import { Router } from "express";
import { config } from "../config.js";
import { logger } from "../logger.js";
import { getMovie } from "../services/catalog.js";
import { getStorage } from "../storage/index.js";
import { cachedImage } from "../services/tmdb.js";
import { HttpError, asyncRoute } from "../middleware/errors.js";

export const streamRouter = Router();

const MIME = {
  ".mp4": "video/mp4",
  ".m4v": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  ".mkv": "video/x-matroska",
  ".avi": "video/x-msvideo",
};

/** Resolves a catalog id to a storage key, and confirms the object still exists. */
async function resolveMovie(id) {
  const movie = getMovie(id);
  if (!movie) throw new HttpError(404, "Movie not found", "NOT_FOUND");

  const storage = getStorage();
  if (!(await storage.exists(movie.file))) {
    throw new HttpError(404, "Video file is missing from storage", "FILE_MISSING");
  }
  return { movie, storage };
}

streamRouter.get(
  "/stream/:id",
  asyncRoute(async (req, res) => {
    const { movie, storage } = await resolveMovie(req.params.id);

    // Object stores can hand the player a presigned URL so the bytes never
    // transit this server. Opt-in, because the URL is bearer-ish until it expires.
    const direct = await storage.signedUrl(movie.file);
    if (direct) return res.redirect(302, direct);

    const stat = await storage.stat(movie.file);
    const size = stat.size;
    const contentType = MIME[path.extname(movie.file).toLowerCase()] ?? "application/octet-stream";
    const range = req.headers.range;

    if (!range) {
      res.writeHead(200, {
        "Content-Length": size,
        "Content-Type": contentType,
        "Accept-Ranges": "bytes",
        "Cache-Control": "private, max-age=0",
      });
      const stream = await storage.createReadStream(movie.file);
      await pipeline(stream, res).catch(() => undefined);
      return;
    }

    const [rawStart, rawEnd] = range.replace(/bytes=/, "").split("-");
    const start = Number.parseInt(rawStart, 10) || 0;
    const end = rawEnd ? Number.parseInt(rawEnd, 10) : size - 1;

    if (Number.isNaN(start) || start >= size || end >= size || start > end) {
      res.writeHead(416, { "Content-Range": `bytes */${size}` });
      res.end();
      return;
    }

    res.writeHead(206, {
      "Content-Range": `bytes ${start}-${end}/${size}`,
      "Accept-Ranges": "bytes",
      "Content-Length": end - start + 1,
      "Content-Type": contentType,
      "Cache-Control": "private, max-age=0",
    });

    const stream = await storage.createReadStream(movie.file, { start, end });
    // Seeking aborts the previous request constantly; pipeline tears the read
    // down with the response instead of leaking a handle per seek.
    await pipeline(stream, res).catch((err) => {
      if (!["ERR_STREAM_PREMATURE_CLOSE", "ECONNRESET", "EPIPE"].includes(err.code)) {
        logger.warn({ err: err.message, id: req.params.id }, "stream.aborted");
      }
    });
  }),
);

streamRouter.get(
  "/download/:id",
  asyncRoute(async (req, res) => {
    const { movie, storage } = await resolveMovie(req.params.id);

    const direct = await storage.signedUrl(movie.file);
    if (direct) return res.redirect(302, direct);

    if (storage.kind === "local") {
      return res.download(path.join(config.paths.movies, movie.file), movie.file);
    }

    const stat = await storage.stat(movie.file);
    res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(movie.file)}"`);
    res.setHeader("Content-Length", stat.size);
    res.setHeader("Content-Type", "application/octet-stream");
    const stream = await storage.createReadStream(movie.file);
    await pipeline(stream, res).catch(() => undefined);
  }),
);

/** SRT is converted on the fly — browsers only understand WebVTT. */
function srtToVtt(srt) {
  const body = srt
    .replace(/\r+/g, "")
    .replace(/^﻿/, "")
    .replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, "$1.$2");
  return `WEBVTT\n\n${body}`;
}

streamRouter.get(
  "/subtitles/:id/:file",
  asyncRoute(async (req, res) => {
    const movie = getMovie(req.params.id);
    if (!movie) throw new HttpError(404, "Movie not found", "NOT_FOUND");

    // Only tracks the scanner already associated with this film are readable —
    // the client never gets to name an arbitrary object.
    const track = movie.subtitles.find((s) => s.file === req.params.file);
    if (!track) throw new HttpError(404, "Subtitle track not found", "NOT_FOUND");

    const raw = await getStorage().readText(track.file);
    res.type("text/vtt");
    res.send(path.extname(track.file).toLowerCase() === ".srt" ? srtToVtt(raw) : raw);
  }),
);

streamRouter.get(
  "/img/:size/:file",
  asyncRoute(async (req, res) => {
    const file = await cachedImage(req.params.size, req.params.file);
    if (!file) throw new HttpError(404, "Image unavailable", "NOT_FOUND");
    // Immutable: TMDB image paths are content-addressed.
    res.set("Cache-Control", "public, max-age=2592000, immutable");
    res.sendFile(file);
  }),
);
