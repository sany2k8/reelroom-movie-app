import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { config } from "../config.js";
import { logger } from "../logger.js";

const VIDEO_EXTENSIONS = new Set([".mp4", ".m4v", ".mkv", ".webm", ".mov", ".avi"]);

/** Keeps every resolved path inside the media root, whatever the key claims. */
function resolveKey(key) {
  const root = path.resolve(config.paths.movies);
  const full = path.resolve(path.join(root, key));
  if (full !== root && !full.startsWith(root + path.sep)) {
    throw new Error(`Refusing to access a path outside the media root: ${key}`);
  }
  return full;
}

export function createLocalStorage() {
  return {
    kind: "local",
    describe: () => config.paths.movies,

    async list() {
      try {
        const entries = await fsp.readdir(config.paths.movies, { withFileTypes: true });
        const files = entries.filter(
          (e) => e.isFile() && VIDEO_EXTENSIONS.has(path.extname(e.name).toLowerCase()),
        );
        return Promise.all(
          files.map(async (e) => {
            const stat = await fsp.stat(path.join(config.paths.movies, e.name));
            return { key: e.name, size: stat.size, mtime: stat.mtime };
          }),
        );
      } catch (err) {
        logger.error({ err: err.message, dir: config.paths.movies }, "storage.list_failed");
        return [];
      }
    },

    /** Sidecar subtitles and anything else living beside the videos. */
    async listAll() {
      try {
        return await fsp.readdir(config.paths.movies);
      } catch {
        return [];
      }
    },

    async stat(key) {
      try {
        const stat = await fsp.stat(resolveKey(key));
        return { size: stat.size, mtime: stat.mtime };
      } catch {
        return null;
      }
    },

    async exists(key) {
      try {
        await fsp.access(resolveKey(key));
        return true;
      } catch {
        return false;
      }
    },

    async readText(key) {
      return fsp.readFile(resolveKey(key), "utf-8");
    },

    createReadStream(key, range) {
      return fs.createReadStream(resolveKey(key), range);
    },

    /** ffprobe reads the file directly — no download, no signing. */
    async probeInput(key) {
      return resolveKey(key);
    },

    async signedUrl() {
      return null; // Local files are always proxied through the app.
    },
  };
}
