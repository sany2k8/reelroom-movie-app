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

/**
 * Admin owns the library itself — rescans, metadata fixes, session revocation.
 * Separate from requireAuth so a guest on the tunnel can never reach it.
 */
export function requireAdmin(req, res, next) {
  if (!req.profile) {
    return res.status(401).json({ error: "Not signed in", code: "UNAUTHENTICATED" });
  }
  if (!req.profile.isAdmin) {
    return res.status(403).json({ error: "Admins only", code: "FORBIDDEN" });
  }
  next();
}
