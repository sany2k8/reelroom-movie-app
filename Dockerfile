# syntax=docker/dockerfile:1

# ---- stage 1: build the frontend bundle ----
FROM node:22.11-bookworm-slim AS ui

WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# ---- stage 2: backend deps (better-sqlite3 needs a toolchain to build) ----
FROM node:22.11-bookworm-slim AS deps

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm ci --omit=dev

# ---- stage 3: runtime ----
FROM node:22.11-bookworm-slim AS runtime

# ffprobe reads real durations, resolution and audio tracks off each file.
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg tini \
  && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
WORKDIR /app

COPY --from=deps /app/backend/node_modules ./backend/node_modules
COPY backend/ ./backend/
COPY --from=ui /app/frontend/dist ./frontend/dist

# Never run as root — this process reads a whole media directory.
RUN useradd --system --uid 10001 --create-home sunflix \
  && mkdir -p /app/data \
  && chown -R sunflix:sunflix /app
USER sunflix

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# tini reaps zombies and forwards SIGTERM so shutdown stays graceful.
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "backend/src/index.js"]
