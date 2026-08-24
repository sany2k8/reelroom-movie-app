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

  // The first profile to sign in owns the room; it can promote others.
  `ALTER TABLE profiles ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0;`,

  `CREATE TABLE IF NOT EXISTS requests (
     id          INTEGER PRIMARY KEY AUTOINCREMENT,
     profile_id  INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
     title       TEXT NOT NULL,
     year        INTEGER,
     note        TEXT,
     status      TEXT NOT NULL DEFAULT 'open'
                 CHECK (status IN ('open', 'fulfilled', 'declined')),
     movie_id    TEXT,
     resolved_by INTEGER REFERENCES profiles(id) ON DELETE SET NULL,
     created_at  TEXT NOT NULL DEFAULT (datetime('now')),
     resolved_at TEXT
   );`,

  `CREATE INDEX IF NOT EXISTS idx_requests_status ON requests (status, created_at DESC);`,

  // One open request per title per person; re-asking bumps nothing.
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_requests_unique_open
     ON requests (profile_id, title COLLATE NOCASE)
     WHERE status = 'open';`,

  `CREATE TABLE IF NOT EXISTS request_votes (
     request_id INTEGER NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
     profile_id INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
     created_at TEXT NOT NULL DEFAULT (datetime('now')),
     PRIMARY KEY (request_id, profile_id)
   );`,

  // Profiles that existed before is_admin arrived all defaulted to 0, which
  // would leave an established install with no way into the admin panel.
  // Promote the oldest profile, but only if nobody is an admin already.
  `UPDATE profiles SET is_admin = 1
    WHERE id = (SELECT id FROM profiles ORDER BY created_at, id LIMIT 1)
      AND NOT EXISTS (SELECT 1 FROM profiles WHERE is_admin = 1);`,
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
