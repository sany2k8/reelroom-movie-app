import fs from "node:fs";
import path from "node:path";
import express from "express";
import helmet from "helmet";
import compression from "compression";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import pinoHttp from "pino-http";
import { config } from "./config.js";
import { logger } from "./logger.js";
import { attachProfile, requireAuth } from "./middleware/auth.js";
import { errorHandler, notFound } from "./middleware/errors.js";
import { authRouter } from "./routes/auth.js";
import { moviesRouter } from "./routes/movies.js";
import { streamRouter } from "./routes/stream.js";
import { libraryRouter } from "./routes/library.js";
import { getScanState } from "./services/catalog.js";
import { tmdbEnabled } from "./services/tmdb.js";

export function createApp() {
  const app = express();

  // ngrok/cloudflared terminate TLS in front of us; without this the rate
  // limiter buckets every viewer under the tunnel's own IP.
  app.set("trust proxy", config.trustProxy ? 1 : false);
  app.disable("x-powered-by");

  app.use(
    pinoHttp({
      logger,
      // Range requests are one line per chunk otherwise — thousands per film.
      autoLogging: { ignore: (req) => req.url.startsWith("/api/stream") && Boolean(req.headers.range) },
      customLogLevel: (_req, res, err) => {
        if (err || res.statusCode >= 500) return "error";
        if (res.statusCode >= 400) return "warn";
        return "debug";
      },
      // The default serializers dump every header on every request, which
      // buries the lines that matter.
      serializers: {
        req: (req) => ({ method: req.method, url: req.url }),
        res: (res) => ({ status: res.statusCode }),
      },
    }),
  );

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
          fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
          imgSrc: ["'self'", "data:", "blob:", "https://i.ytimg.com"],
          mediaSrc: ["'self'", "blob:"],
          // Trailers play through YouTube's no-cookie embed.
          frameSrc: ["https://www.youtube-nocookie.com", "https://www.youtube.com"],
          connectSrc: ["'self'"],
          objectSrc: ["'none'"],
          baseUri: ["'self'"],
          formAction: ["'self'"],
        },
      },
      // Video + YouTube embeds break under the strict cross-origin defaults.
      crossOriginEmbedderPolicy: false,
      crossOriginResourcePolicy: { policy: "same-site" },
      referrerPolicy: { policy: "no-referrer" },
    }),
  );

  // Video bytes must not go through gzip — it wastes CPU and breaks nothing but
  // throughput. Everything else compresses well.
  app.use(
    compression({
      filter: (req, res) =>
        !req.path.startsWith("/api/stream") &&
        !req.path.startsWith("/api/download") &&
        compression.filter(req, res),
    }),
  );

  app.use(express.json({ limit: "64kb" }));
  app.use(cookieParser());
  app.use(attachProfile);

  app.get("/api/health", (_req, res) => {
    res.json({
      status: "ok",
      uptimeSeconds: Math.round(process.uptime()),
      catalog: getScanState(),
      tmdb: tmdbEnabled() ? "enabled" : "disabled",
      version: process.env.npm_package_version ?? "2.0.0",
    });
  });

  app.use(
    "/api",
    rateLimit({
      windowMs: 60_000,
      limit: 600,
      standardHeaders: "draft-7",
      legacyHeaders: false,
      // Streaming is many small ranged requests; limiting it stalls playback.
      skip: (req) => req.path.startsWith("/stream") || req.path.startsWith("/img"),
    }),
  );

  app.use("/api/auth", authRouter);

  // Everything past this point requires a session — including the video itself.
  app.use("/api/movies", requireAuth, moviesRouter);
  app.use("/api/library", requireAuth, libraryRouter);
  app.use("/api", requireAuth, streamRouter);

  app.use(
    "/posters",
    requireAuth,
    express.static(config.paths.posters, { maxAge: "7d", fallthrough: true }),
  );

  app.use("/api", notFound);

  serveFrontend(app);

  app.use(errorHandler);
  return app;
}

function serveFrontend(app) {
  const dist = config.paths.frontend;
  const indexFile = path.join(dist, "index.html");

  if (!fs.existsSync(indexFile)) {
    logger.warn({ dist }, "frontend.build_missing — run `npm run build` in frontend/");
    app.get("*", (_req, res) => {
      res
        .status(503)
        .type("html")
        .send(
          "<h1>SunFlix</h1><p>Frontend build not found. Run <code>npm --prefix frontend run build</code>, or use the Vite dev server on :5173.</p>",
        );
    });
    return;
  }

  // Hashed asset filenames can be cached hard; index.html never can, or a
  // deploy leaves clients pinned to a stale bundle.
  app.use(express.static(dist, { maxAge: "1y", index: false, etag: true }));
  app.get("*", (_req, res) => {
    res.set("Cache-Control", "no-store");
    res.sendFile(indexFile);
  });
}
