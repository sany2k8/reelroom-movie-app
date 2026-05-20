import { db } from "../db/index.js";

/** Below this we treat playback as "never really started". */
const MIN_RESUME_SECONDS = 15;
/** Past this we call it watched and stop offering a resume. */
const COMPLETE_RATIO = 0.94;

const statements = {
  upsertProgress: db.prepare(`
    INSERT INTO progress (profile_id, movie_id, position, duration, completed, updated_at)
    VALUES (@profileId, @movieId, @position, @duration, @completed, datetime('now'))
    ON CONFLICT (profile_id, movie_id) DO UPDATE SET
      position   = excluded.position,
      duration   = excluded.duration,
      completed  = excluded.completed,
      updated_at = datetime('now')
  `),
  getProgress: db.prepare(
    "SELECT movie_id, position, duration, completed, updated_at FROM progress WHERE profile_id = ? AND movie_id = ?",
  ),
  allProgress: db.prepare(
    "SELECT movie_id, position, duration, completed, updated_at FROM progress WHERE profile_id = ? ORDER BY updated_at DESC",
  ),
  deleteProgress: db.prepare("DELETE FROM progress WHERE profile_id = ? AND movie_id = ?"),

  addListItem: db.prepare(
    "INSERT OR IGNORE INTO list_items (profile_id, movie_id, list) VALUES (?, ?, ?)",
  ),
  removeListItem: db.prepare(
    "DELETE FROM list_items WHERE profile_id = ? AND movie_id = ? AND list = ?",
  ),
  listItems: db.prepare(
    "SELECT movie_id, created_at FROM list_items WHERE profile_id = ? AND list = ? ORDER BY created_at DESC",
  ),
  allListItems: db.prepare("SELECT movie_id, list FROM list_items WHERE profile_id = ?"),

  getPrefs: db.prepare("SELECT volume, muted, rate FROM player_prefs WHERE profile_id = ?"),
  setPrefs: db.prepare(`
    INSERT INTO player_prefs (profile_id, volume, muted, rate, updated_at)
    VALUES (@profileId, @volume, @muted, @rate, datetime('now'))
    ON CONFLICT (profile_id) DO UPDATE SET
      volume = excluded.volume,
      muted  = excluded.muted,
      rate   = excluded.rate,
      updated_at = datetime('now')
  `),
};

function rowToProgress(row) {
  if (!row) return null;
  return {
    movieId: row.movie_id,
    position: row.position,
    duration: row.duration,
    completed: Boolean(row.completed),
    percent: row.duration ? Math.min(100, (row.position / row.duration) * 100) : 0,
    updatedAt: row.updated_at,
  };
}

export function saveProgress({ profileId, movieId, position, duration }) {
  const safePosition = Math.max(0, Number(position) || 0);
  const safeDuration = Math.max(0, Number(duration) || 0);
  const completed = safeDuration > 0 && safePosition / safeDuration >= COMPLETE_RATIO ? 1 : 0;

  statements.upsertProgress.run({
    profileId,
    movieId,
    // Snapping a finished title back to 0 means "Play" restarts it rather than
    // dropping the viewer onto the credits.
    position: completed ? 0 : safePosition,
    duration: safeDuration,
    completed,
  });

  return rowToProgress(statements.getProgress.get(profileId, movieId));
}

export const getProgress = (profileId, movieId) =>
  rowToProgress(statements.getProgress.get(profileId, movieId));

export const clearProgress = (profileId, movieId) =>
  statements.deleteProgress.run(profileId, movieId).changes > 0;

export function progressMap(profileId) {
  const map = new Map();
  for (const row of statements.allProgress.all(profileId)) {
    map.set(row.movie_id, rowToProgress(row));
  }
  return map;
}

/** Ordered most-recent-first, and only titles genuinely mid-watch. */
export function continueWatching(profileId) {
  return statements
    .allProgress.all(profileId)
    .map(rowToProgress)
    .filter((p) => !p.completed && p.position >= MIN_RESUME_SECONDS);
}

export function toggleListItem({ profileId, movieId, list, active }) {
  if (active) statements.addListItem.run(profileId, movieId, list);
  else statements.removeListItem.run(profileId, movieId, list);
  return active;
}

export const listMovieIds = (profileId, list) =>
  statements.listItems.all(profileId, list).map((r) => r.movie_id);

export function listFlags(profileId) {
  const flags = new Map();
  for (const row of statements.allListItems.all(profileId)) {
    const current = flags.get(row.movie_id) ?? { watchlist: false, favourite: false };
    current[row.list] = true;
    flags.set(row.movie_id, current);
  }
  return flags;
}

export function getPrefs(profileId) {
  const row = statements.getPrefs.get(profileId);
  return row
    ? { volume: row.volume, muted: Boolean(row.muted), rate: row.rate }
    : { volume: 1, muted: false, rate: 1 };
}

export function setPrefs(profileId, { volume, muted, rate }) {
  statements.setPrefs.run({
    profileId,
    volume: Math.min(1, Math.max(0, Number(volume) || 0)),
    muted: muted ? 1 : 0,
    rate: Math.min(4, Math.max(0.25, Number(rate) || 1)),
  });
  return getPrefs(profileId);
}
