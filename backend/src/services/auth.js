import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { db } from "../db/index.js";
import { config } from "../config.js";
import { logger } from "../logger.js";

export const SESSION_COOKIE = "sunflix_session";

// Hashed once at boot so PIN checks are constant-time-ish and the plaintext
// never sits in a comparison. The PIN itself still only lives in the env.
const pinHash = bcrypt.hashSync(config.pin, 10);

const statements = {
  findProfile: db.prepare("SELECT * FROM profiles WHERE name = ? COLLATE NOCASE"),
  insertProfile: db.prepare("INSERT INTO profiles (name, avatar_seed) VALUES (?, ?)"),
  getProfile: db.prepare("SELECT * FROM profiles WHERE id = ?"),
  listProfiles: db.prepare("SELECT id, name, avatar_seed FROM profiles ORDER BY created_at"),
  insertSession: db.prepare(
    "INSERT INTO sessions (token, profile_id, user_agent, expires_at) VALUES (?, ?, ?, ?)",
  ),
  findSession: db.prepare(
    "SELECT * FROM sessions WHERE token = ? AND expires_at > datetime('now')",
  ),
  deleteSession: db.prepare("DELETE FROM sessions WHERE token = ?"),
};

export const verifyPin = (pin) => bcrypt.compareSync(String(pin ?? ""), pinHash);

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function findOrCreateProfile(name) {
  const trimmed = String(name ?? "").trim().slice(0, 40);
  if (!trimmed) throw new Error("Profile name is required");

  const existing = statements.findProfile.get(trimmed);
  if (existing) return existing;

  const seed = crypto.randomBytes(4).toString("hex");
  const { lastInsertRowid } = statements.insertProfile.run(trimmed, seed);
  logger.info({ profile: trimmed }, "auth.profile_created");
  return statements.getProfile.get(lastInsertRowid);
}

export const listProfiles = () =>
  statements.listProfiles.all().map((p) => ({ id: p.id, name: p.name, avatarSeed: p.avatar_seed }));

export function createSession(profileId, userAgent) {
  const token = crypto.randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + config.sessionMaxAgeMs).toISOString().replace("T", " ").slice(0, 19);
  // Only the hash is stored, so a leaked database can't be replayed as a login.
  statements.insertSession.run(hashToken(token), profileId, userAgent?.slice(0, 200) ?? null, expiresAt);
  return token;
}

export function resolveSession(token) {
  if (!token) return null;
  const row = statements.findSession.get(hashToken(token));
  if (!row) return null;
  const profile = statements.getProfile.get(row.profile_id);
  if (!profile) return null;
  return { id: profile.id, name: profile.name, avatarSeed: profile.avatar_seed };
}

export const destroySession = (token) =>
  token ? statements.deleteSession.run(hashToken(token)).changes > 0 : false;

export const cookieOptions = () => ({
  httpOnly: true,
  sameSite: "lax",
  // The tunnel terminates TLS, so in production the cookie must be secure-only.
  secure: config.isProd,
  maxAge: config.sessionMaxAgeMs,
  path: "/",
});
