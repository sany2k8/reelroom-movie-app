import { createApp } from "./app.js";
import { config } from "./config.js";
import { logger } from "./logger.js";
// Importing the db module runs the migrations, which every service depends on.
import { pruneExpiredSessions, db } from "./db/index.js";
import { initCatalog } from "./services/catalog.js";
import { tmdbEnabled } from "./services/tmdb.js";

const HOUR_MS = 60 * 60 * 1000;

async function main() {
  pruneExpiredSessions();
  await initCatalog();

  const app = createApp();
  const server = app.listen(config.port, () => {
    logger.info(
      { port: config.port, env: config.env, tmdb: tmdbEnabled() },
      `SunFlix running on http://localhost:${config.port}`,
    );
    if (!tmdbEnabled()) {
      logger.warn("TMDB_API_KEY is not set — ratings, cast and backdrops will be missing");
    }
    if (config.pin === "1234") {
      logger.warn("Using the default PIN (1234). Set SUNFLIX_PIN before exposing a tunnel.");
    }
  });

  // Long-lived video responses would otherwise keep the process alive forever.
  server.keepAliveTimeout = 65_000;
  server.headersTimeout = 70_000;

  const sweep = setInterval(pruneExpiredSessions, HOUR_MS);
  sweep.unref();

  const shutdown = (signal) => {
    logger.info({ signal }, "shutdown.start");
    server.close(() => {
      db.close();
      logger.info("shutdown.complete");
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("unhandledRejection", (err) => logger.error({ err }, "unhandled_rejection"));
}

main().catch((err) => {
  logger.error({ err: err.message, stack: err.stack }, "startup.failed");
  process.exit(1);
});
