import dotenv from "dotenv";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(here, "..", "..");

// The .env lives at the project root, but the backend runs from backend/.
dotenv.config({ path: path.join(ROOT, ".env") });

const bool = (fallback) =>
  z
    .enum(["true", "false", "1", "0"])
    .optional()
    .transform((v) => (v === undefined ? fallback : v === "true" || v === "1"));

const schema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),

  /** Shared household PIN. Anyone with the tunnel URL still needs this. */
  SUNFLIX_PIN: z.string().min(4).default("1234"),
  /** Signs the session cookie. Rotating it logs everybody out. */
  SESSION_SECRET: z.string().min(16).optional(),
  SESSION_DAYS: z.coerce.number().int().positive().default(30),

  /** Optional — without it the catalog falls back to movies.json only. */
  TMDB_API_KEY: z.string().optional(),
  TMDB_LANGUAGE: z.string().default("en-US"),

  MOVIES_DIR: z.string().optional(),
  POSTERS_DIR: z.string().optional(),
  DATA_DIR: z.string().optional(),

  /** ngrok / cloudflared sit in front of us, so X-Forwarded-* is trustworthy. */
  TRUST_PROXY: bool(true),
  /** Set to your public tunnel origin to lock CORS down further. */
  PUBLIC_ORIGIN: z.string().optional(),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n");
  throw new Error(`Invalid environment configuration:\n${issues}`);
}
const env = parsed.data;

const isProd = env.NODE_ENV === "production";

if (isProd && !env.SESSION_SECRET) {
  throw new Error("SESSION_SECRET is required when NODE_ENV=production");
}
if (isProd && env.SUNFLIX_PIN === "1234") {
  throw new Error("Refusing to start in production with the default SUNFLIX_PIN");
}

export const config = {
  env: env.NODE_ENV,
  isProd,
  port: env.PORT,

  pin: env.SUNFLIX_PIN,
  sessionSecret: env.SESSION_SECRET ?? crypto.randomBytes(32).toString("hex"),
  sessionMaxAgeMs: env.SESSION_DAYS * 24 * 60 * 60 * 1000,

  tmdb: {
    apiKey: env.TMDB_API_KEY || null,
    language: env.TMDB_LANGUAGE,
    baseUrl: "https://api.themoviedb.org/3",
    imageBaseUrl: "https://image.tmdb.org/t/p",
  },

  paths: {
    root: ROOT,
    movies: env.MOVIES_DIR ? path.resolve(ROOT, env.MOVIES_DIR) : path.join(ROOT, "movies"),
    posters: env.POSTERS_DIR ? path.resolve(ROOT, env.POSTERS_DIR) : path.join(ROOT, "posters"),
    data: env.DATA_DIR ? path.resolve(ROOT, env.DATA_DIR) : path.join(ROOT, "data"),
    overrides: path.join(ROOT, "movies.json"),
    frontend: path.join(ROOT, "frontend", "dist"),
  },

  trustProxy: env.TRUST_PROXY,
  publicOrigin: env.PUBLIC_ORIGIN ?? null,
};

config.paths.db = path.join(config.paths.data, "sunflix.db");
config.paths.tmdbCache = path.join(config.paths.data, "tmdb");
config.paths.imageCache = path.join(config.paths.data, "images");
config.paths.catalogSnapshot = path.join(config.paths.data, "catalog.json");
