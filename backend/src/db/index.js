import fs from "node:fs";
import Database from "better-sqlite3";
import { config } from "../config.js";
import { logger } from "../logger.js";

fs.mkdirSync(config.paths.data, { recursive: true });

export const db = new Database(config.paths.db);

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
db.pragma("busy_timeout = 5000");

/**
 * Migrations are append-only. Never edit a shipped statement — add a new one,
 * or an existing install will be left on the old schema with no way back.
 */
const MIGRATIONS = [
  `CREATE TABLE IF NOT EXISTS profiles (
     id          INTEGER PRIMARY KEY AUTOINCREMENT,
     name        TEXT NOT NULL UNIQUE COLLATE NOCASE,
     avatar_seed TEXT NOT NULL,
     created_at  TEXT NOT NULL DEFAULT (datetime('now'))
   );`,

  `CREATE TABLE IF NOT EXISTS sessions (
     token      TEXT PRIMARY KEY,
     profile_id INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
     user_agent TEXT,
     created_at TEXT NOT NULL DEFAULT (datetime('now')),
     expires_at TEXT NOT NULL
   );`,

  `CREATE TABLE IF NOT EXISTS progress (
     profile_id  INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
     movie_id    TEXT NOT NULL,
     position    REAL NOT NULL DEFAULT 0,
     duration    REAL NOT NULL DEFAULT 0,
     completed   INTEGER NOT NULL DEFAULT 0,
     updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
     PRIMARY KEY (profile_id, movie_id)
   );`,

  `CREATE TABLE IF NOT EXISTS list_items (
     profile_id INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
     movie_id   TEXT NOT NULL,
     list       TEXT NOT NULL CHECK (list IN ('watchlist', 'favourite')),
     created_at TEXT NOT NULL DEFAULT (datetime('now')),
     PRIMARY KEY (profile_id, movie_id, list)
   );`,

  `CREATE INDEX IF NOT EXISTS idx_progress_profile_updated
     ON progress (profile_id, updated_at DESC);`,

  `CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions (expires_at);`,

  `CREATE TABLE IF NOT EXISTS player_prefs (
     profile_id INTEGER PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
     volume     REAL NOT NULL DEFAULT 1,
     muted      INTEGER NOT NULL DEFAULT 0,
     rate       REAL NOT NULL DEFAULT 1,
     updated_at TEXT NOT NULL DEFAULT (datetime('now'))
   );`,
];

/**
 * Idempotent. Called at module load below, because service modules prepare
 * their statements at import time — which happens before any main() body runs.
 */
export function migrate() {
  const applied = db.pragma("user_version", { simple: true });
  if (applied >= MIGRATIONS.length) return;

  const run = db.transaction(() => {
    for (let i = applied; i < MIGRATIONS.length; i += 1) {
      db.exec(MIGRATIONS[i]);
    }
    db.pragma(`user_version = ${MIGRATIONS.length}`);
  });
  run();

  logger.info({ from: applied, to: MIGRATIONS.length }, "db.migrated");
}

migrate();

export function pruneExpiredSessions() {
  const { changes } = db.prepare("DELETE FROM sessions WHERE expires_at < datetime('now')").run();
  if (changes) logger.debug({ changes }, "db.sessions_pruned");
  return changes;
}
