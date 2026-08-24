import fs from "node:fs";
import { config } from "../config.js";
import { logger } from "../logger.js";
import { getStorage } from "../storage/index.js";
import { scan, getCatalog } from "./catalog.js";
import { autoFulfilRequests } from "./requests.js";

let stop = null;

/**
 * A file copied into the media folder fires a create event the instant it
 * appears — long before the copy finishes. Probing then reads a truncated file
 * and records a nonsense duration, so wait for the size to stop moving first.
 */
async function waitUntilStable(keys) {
  const storage = getStorage();
  const deadline = Date.now() + 30 * 60 * 1000; // A very large file still finishes.
  const sizes = new Map();

  while (Date.now() < deadline) {
    let allStable = true;

    for (const key of keys) {
      const stat = await storage.stat(key);
      if (!stat) continue;
      const previous = sizes.get(key);
      if (previous?.size !== stat.size) {
        sizes.set(key, { size: stat.size, since: Date.now() });
        allStable = false;
      } else if (Date.now() - previous.since < config.watch.stableSeconds * 1000) {
        allStable = false;
      }
    }

    if (allStable) return true;
    await new Promise((r) => setTimeout(r, config.watch.stableSeconds * 1000));
  }

  logger.warn({ keys }, "watch.stability_timeout");
  return false;
}

async function reconcile(reason) {
  const storage = getStorage();
  const known = new Set(getCatalog().map((m) => m.file));
  const present = (await storage.list()).map((e) => e.key);

  const added = present.filter((key) => !known.has(key));
  const removed = [...known].filter((key) => !present.includes(key));
  if (added.length === 0 && removed.length === 0) return;

  logger.info({ reason, added, removed }, "watch.change_detected");

  if (added.length) await waitUntilStable(added);

  const before = new Set(getCatalog().map((m) => m.id));
  await scan();
  const imported = getCatalog().filter((m) => !before.has(m.id));

  if (imported.length) {
    logger.info({ titles: imported.map((m) => m.title) }, "watch.imported");
    // A new arrival may be something somebody asked for on the request board.
    autoFulfilRequests(imported);
  }
}

/** Local folders get real filesystem events; object stores get polled. */
function watchLocal(onChange) {
  let timer = null;
  const watcher = fs.watch(config.paths.movies, { persistent: false }, () => {
    // Events arrive in bursts (one per chunk on some platforms) — coalesce them.
    clearTimeout(timer);
    timer = setTimeout(() => void onChange("fs-event"), 1500);
  });

  watcher.on("error", (err) => logger.warn({ err: err.message }, "watch.fs_error"));
  return () => {
    clearTimeout(timer);
    watcher.close();
  };
}

function watchPolling(onChange) {
  const interval = setInterval(
    () => void onChange("poll"),
    config.watch.pollSeconds * 1000,
  );
  interval.unref();
  return () => clearInterval(interval);
}

export function startWatcher() {
  if (!config.watch.enabled) {
    logger.info("watch.disabled");
    return () => {};
  }

  const storage = getStorage();
  const safeReconcile = (reason) =>
    reconcile(reason).catch((err) => logger.error({ err: err.message }, "watch.reconcile_failed"));

  stop = storage.kind === "local" ? watchLocal(safeReconcile) : watchPolling(safeReconcile);

  logger.info(
    {
      driver: storage.kind,
      mode: storage.kind === "local" ? "fs-events" : `poll/${config.watch.pollSeconds}s`,
      stableSeconds: config.watch.stableSeconds,
    },
    "watch.started",
  );

  return stopWatcher;
}

export function stopWatcher() {
  stop?.();
  stop = null;
}

/** Exposed so the admin panel's "check now" button reuses the same path. */
export const checkNow = () => reconcile("manual");
