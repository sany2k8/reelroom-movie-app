import { db } from "../db/index.js";
import { logger } from "../logger.js";

const statements = {
  insert: db.prepare(`
    INSERT INTO requests (profile_id, title, year, note)
    VALUES (@profileId, @title, @year, @note)
  `),
  byId: db.prepare("SELECT * FROM requests WHERE id = ?"),
  list: db.prepare(`
    SELECT r.*,
           p.name AS requester,
           (SELECT COUNT(*) FROM request_votes v WHERE v.request_id = r.id) AS votes
    FROM requests r
    JOIN profiles p ON p.id = r.profile_id
    WHERE (@status IS NULL OR r.status = @status)
    ORDER BY
      CASE r.status WHEN 'open' THEN 0 ELSE 1 END,
      votes DESC,
      r.created_at DESC
  `),
  openRequests: db.prepare("SELECT * FROM requests WHERE status = 'open'"),
  resolve: db.prepare(`
    UPDATE requests
       SET status = @status, movie_id = @movieId, resolved_by = @resolvedBy,
           resolved_at = datetime('now')
     WHERE id = @id
  `),
  remove: db.prepare("DELETE FROM requests WHERE id = ?"),
  addVote: db.prepare(
    "INSERT OR IGNORE INTO request_votes (request_id, profile_id) VALUES (?, ?)",
  ),
  removeVote: db.prepare("DELETE FROM request_votes WHERE request_id = ? AND profile_id = ?"),
  myVotes: db.prepare("SELECT request_id FROM request_votes WHERE profile_id = ?"),
  countOpen: db.prepare("SELECT COUNT(*) AS n FROM requests WHERE status = 'open'"),
};

function rowToRequest(row, myVotes) {
  return {
    id: row.id,
    title: row.title,
    year: row.year,
    note: row.note,
    status: row.status,
    movieId: row.movie_id,
    requester: row.requester,
    profileId: row.profile_id,
    votes: row.votes ?? 0,
    hasVoted: myVotes?.has(row.id) ?? false,
    createdAt: row.created_at,
    resolvedAt: row.resolved_at,
  };
}

export function createRequest({ profileId, title, year, note }) {
  try {
    const { lastInsertRowid } = statements.insert.run({
      profileId,
      title: title.trim(),
      year: year ?? null,
      note: note?.trim() || null,
    });
    logger.info({ title, profileId }, "request.created");
    return rowToRequest({ ...statements.byId.get(lastInsertRowid), requester: null });
  } catch (err) {
    // The partial unique index is what rejects a duplicate open request.
    if (String(err.message).includes("UNIQUE")) {
      const conflict = new Error("You've already requested that.");
      conflict.code = "DUPLICATE_REQUEST";
      throw conflict;
    }
    throw err;
  }
}

export function listRequests(profileId, status = null) {
  const myVotes = new Set(statements.myVotes.all(profileId).map((r) => r.request_id));
  return statements.list.all({ status }).map((row) => rowToRequest(row, myVotes));
}

export const openRequestCount = () => statements.countOpen.get().n;

export function resolveRequest({ id, status, movieId = null, resolvedBy }) {
  statements.resolve.run({ id, status, movieId, resolvedBy });
  return rowToRequest({ ...statements.byId.get(id), requester: null });
}

export function deleteRequest(id) {
  return statements.remove.run(id).changes > 0;
}

export function voteRequest({ requestId, profileId, active }) {
  if (active) statements.addVote.run(requestId, profileId);
  else statements.removeVote.run(requestId, profileId);
  return active;
}

/** Loose match — "maharaja" should satisfy a request typed as "Maharaja (2024)". */
function titlesMatch(a, b) {
  const normalise = (v) =>
    v.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
  const left = normalise(a);
  const right = normalise(b);
  return left === right || left.includes(right) || right.includes(left);
}

/**
 * Called by the import watcher: anything newly on the shelf closes the request
 * that asked for it, so nobody has to remember to tick it off.
 */
export function autoFulfilRequests(newMovies) {
  const open = statements.openRequests.all();
  if (!open.length) return [];

  const closed = [];
  for (const request of open) {
    const hit = newMovies.find(
      (m) =>
        titlesMatch(m.title, request.title) &&
        (!request.year || !m.year || Math.abs(m.year - request.year) <= 1),
    );
    if (!hit) continue;

    statements.resolve.run({
      id: request.id,
      status: "fulfilled",
      movieId: hit.id,
      resolvedBy: null,
    });
    closed.push({ request: request.title, movieId: hit.id });
  }

  if (closed.length) logger.info({ closed }, "request.auto_fulfilled");
  return closed;
}
