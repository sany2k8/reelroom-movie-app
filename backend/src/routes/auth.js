import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import {
  SESSION_COOKIE,
  cookieOptions,
  createSession,
  destroySession,
  findOrCreateProfile,
  listProfiles,
  verifyPin,
} from "../services/auth.js";
import { HttpError } from "../middleware/errors.js";
import { logger } from "../logger.js";

export const authRouter = Router();

// The PIN is short by design, so brute force has to be made expensive here.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many sign-in attempts. Try again in a few minutes.", code: "RATE_LIMITED" },
});

const loginSchema = z.object({
  name: z.string().trim().min(1, "Who's watching?").max(40),
  pin: z.string().min(1, "PIN is required"),
});

authRouter.get("/session", (req, res) => {
  res.json({ profile: req.profile, profiles: req.profile ? listProfiles() : [] });
});

authRouter.post("/login", loginLimiter, (req, res) => {
  const parsed = loginSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    throw new HttpError(400, parsed.error.issues[0].message, "INVALID_INPUT");
  }

  const { name, pin } = parsed.data;
  if (!verifyPin(pin)) {
    logger.warn({ name, ip: req.ip }, "auth.bad_pin");
    throw new HttpError(401, "That PIN doesn't match.", "BAD_PIN");
  }

  const profile = findOrCreateProfile(name);
  const token = createSession(profile.id, req.get("user-agent"));
  res.cookie(SESSION_COOKIE, token, cookieOptions());

  logger.info({ profile: profile.name }, "auth.login");
  res.json({
    profile: { id: profile.id, name: profile.name, avatarSeed: profile.avatar_seed },
  });
});

authRouter.post("/logout", (req, res) => {
  destroySession(req.cookies?.[SESSION_COOKIE]);
  res.clearCookie(SESSION_COOKIE, { ...cookieOptions(), maxAge: undefined });
  res.json({ ok: true });
});
