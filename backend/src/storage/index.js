import { config } from "../config.js";
import { logger } from "../logger.js";
import { createLocalStorage } from "./local.js";
import { createS3Storage } from "./s3.js";

/**
 * One place that knows where media lives. Everything else — the catalog scanner,
 * ffprobe, the streaming route, the import watcher — talks to this interface, so
 * moving from a local folder to a bucket is a config change, not a rewrite.
 *
 * Contract:
 *   kind, describe()
 *   list()                     video objects: [{ key, size, mtime }]
 *   listAll()                  every object key (used to find sidecar subtitles)
 *   stat(key)                  { size, mtime } | null
 *   exists(key)                boolean
 *   readText(key)              string
 *   createReadStream(key, {start, end})
 *   probeInput(key)            a path or URL ffprobe can open
 *   signedUrl(key, ttl)        direct URL, or null when bytes must be proxied
 */
let storage = null;

export async function initStorage() {
  storage = config.storage.driver === "s3" ? await createS3Storage() : createLocalStorage();
  logger.info({ driver: storage.kind, location: storage.describe() }, "storage.ready");
  return storage;
}

export function getStorage() {
  if (!storage) throw new Error("Storage used before initStorage()");
  return storage;
}
