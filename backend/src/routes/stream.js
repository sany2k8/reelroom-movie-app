import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { Router } from "express";
import { config } from "../config.js";
import { logger } from "../logger.js";
import { getMovie } from "../services/catalog.js";
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

/** Resolves a catalog id to a real file, refusing anything outside /movies. */
function resolveMovieFile(id) {
  const movie = getMovie(id);
  if (!movie) throw new HttpError(404, "Movie not found", "NOT_FOUND");

  const filePath = path.join(config.paths.movies, movie.file);
  if (!path.resolve(filePath).startsWith(path.resolve(config.paths.movies))) {
    throw new HttpError(400, "Invalid path", "BAD_PATH");
  }
  if (!fs.existsSync(filePath)) {
    throw new HttpError(404, "Video file is missing from the movies folder", "FILE_MISSING");
  }
  return { movie, filePath };
}

streamRouter.get("/stream/:id", (req, res) => {
  const { movie, filePath } = resolveMovieFile(req.params.id);
  const { size } = fs.statSync(filePath);
  const contentType = MIME[path.extname(movie.file).toLowerCase()] ?? "application/octet-stream";
  const range = req.headers.range;

  if (!range) {
    res.writeHead(200, {
      "Content-Length": size,
      "Content-Type": contentType,
      "Accept-Ranges": "bytes",
      "Cache-Control": "private, max-age=0",
    });
    fs.createReadStream(filePath).pipe(res);
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

  const stream = fs.createReadStream(filePath, { start, end });
  stream.on("error", (err) => {
    logger.error({ err: err.message, id: req.params.id }, "stream.read_failed");
    res.destroy();
  });
  // Seeking aborts the previous request constantly; tear the read down with it.
  req.on("close", () => stream.destroy());
  stream.pipe(res);
});

streamRouter.get("/download/:id", (req, res) => {
  const { movie, filePath } = resolveMovieFile(req.params.id);
  res.download(filePath, movie.file);
});

/** SRT is converted on the fly — browsers only understand WebVTT. */
function srtToVtt(srt) {
  const body = srt
    .replace(/\r+/g, "")
    .replace(/^\uFEFF/, "")
    .replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, "$1.$2");
  return `WEBVTT\n\n${body}`;
}

streamRouter.get(
  "/subtitles/:id/:file",
  asyncRoute(async (req, res) => {
    const movie = getMovie(req.params.id);
    if (!movie) throw new HttpError(404, "Movie not found", "NOT_FOUND");

    const track = movie.subtitles.find((s) => s.file === req.params.file);
    if (!track) throw new HttpError(404, "Subtitle track not found", "NOT_FOUND");

    const filePath = path.join(config.paths.movies, track.file);
    if (!path.resolve(filePath).startsWith(path.resolve(config.paths.movies))) {
      throw new HttpError(400, "Invalid path", "BAD_PATH");
    }

    const raw = await fsp.readFile(filePath, "utf-8");
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
