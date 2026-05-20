import { SESSION_COOKIE, resolveSession } from "../services/auth.js";

/** Attaches req.profile when a valid session cookie is present. Never rejects. */
export function attachProfile(req, _res, next) {
  req.profile = resolveSession(req.cookies?.[SESSION_COOKIE]) ?? null;
  next();
}

/**
 * Guards everything that isn't the login screen — including /api/stream, which
 * is the whole point of the gate when the app is exposed over a tunnel.
 */
export function requireAuth(req, res, next) {
  if (req.profile) return next();
  res.status(401).json({ error: "Not signed in", code: "UNAUTHENTICATED" });
}
