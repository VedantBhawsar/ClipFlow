# Multi-stage build for the ClipFlow worker.
#
# Stage 1: pnpm fetch + install dependencies (incl. workspace packages)
# Stage 2: build the TypeScript bundle
# Stage 3: runtime image — node + ffmpeg + built JS only
#
# Why multi-stage: the builder carries TypeScript + devDeps + a full pnpm
# store; the runtime image only needs node + ffmpeg + the compiled JS +
# production node_modules. Final image is roughly 600 MB instead of 1.2 GB.

# ---- Stage 1: deps ----
# Use Debian-slim instead of Alpine because ffmpeg's apt package is only
# reliably available on Debian. The bookworm variant keeps glibc, which is
# what node-gyp-built deps (e.g. @prisma/client) expect.
FROM node:22-bookworm-slim AS deps

# ffmpeg is only needed in the runtime stage, but corepack needs to be
# available here too so we can pin pnpm. Install pnpm via corepack so the
# version matches package.json's `packageManager` field exactly.
RUN corepack enable

WORKDIR /app

# Copy the workspace manifest + lockfile first so the install layer caches
# independently of source code changes.
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages ./packages
COPY apps/worker/package.json ./apps/worker/package.json
COPY apps/api/package.json ./apps/api/package.json
COPY apps/web/package.json ./apps/web/package.json
COPY turbo.json ./

# Use --frozen-lockfile so a CI build with a stale lockfile fails loud
# rather than silently rewriting it.
RUN pnpm install --frozen-lockfile --ignore-scripts --filter worker... --filter @clipflow/db

# ---- Stage 2: build ----
# tsconfig outDir is ./dist, so the compiled JS lands in apps/worker/dist.
# The db package's postinstall generates the Prisma client into a path
# that the worker imports from — we copy the generated `.prisma` folder
# over too so the runtime stage doesn't need to re-generate.
FROM node:22-bookworm-slim AS build

RUN corepack enable
WORKDIR /app

COPY --from=deps /app /app
COPY apps/worker ./apps/worker

ARG DATABASE_URL=postgresql://dummy:dummy@dummy:5432/dummy
ENV DATABASE_URL=$DATABASE_URL

RUN pnpm --filter @clipflow/db prisma:generate

# IMPORTANT: build the worker AND every workspace package it depends on
# (e.g. @clipflow/youtube-upload), not just the worker itself. The
# trailing "..." tells turbo/pnpm to include all transitive workspace
# dependencies in topological order. Without this, internal packages
# never get a dist/ folder, and if their package.json "main"/"exports"
# points at dist/index.js, Node fails at runtime trying to resolve
# compiled-style ".js" imports against nonexistent files (the
# ERR_MODULE_NOT_FOUND on packages/youtube-upload/src/publish-video.js
# we hit before).
RUN pnpm --filter worker... build

# ---- Stage 3: runtime ----
# node:22-bookworm-slim is ~180 MB; ffmpeg adds ~150 MB. Total ~330 MB.
FROM node:22-bookworm-slim AS runtime

# ffmpeg + ffprobe (split into its own layer so it caches independently
# of the node_modules layer — apt-get is slow and rarely changes).
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# Non-root user — bullmq + s3 clients write to /tmp/clipflow-extract-*
# and a non-root user with a writable HOME is the simplest way to keep
# that working without juggling directory ownership.
RUN groupadd --system --gid 1001 nodejs \
 && useradd --system --uid 1001 --gid nodejs --home /home/nodejs --shell /bin/bash --create-home nodejs

ENV NODE_ENV=production
ENV FFMPEG_PATH=/usr/bin/ffmpeg
WORKDIR /app

# Copy the built JS + the workspace node_modules pruned to just the
# worker's needs. pnpm deploy would do this surgically; here we copy
# the relevant subtrees by hand because pnpm deploy requires
# `package.json` fields we don't currently set.
#
# IMPORTANT: pnpm uses isolated mode by default, so each package's
# direct deps live under apps/<pkg>/node_modules/<dep> as a *relative*
# symlink into node_modules/.pnpm/. We MUST ship apps/worker/node_modules
# alongside the root node_modules, otherwise the worker's direct imports
# (e.g. `import { Redis } from "ioredis"`) crash with ERR_MODULE_NOT_FOUND
# at runtime even though .pnpm/ioredis@*/node_modules/ioredis/ exists.
#
# `packages` now comes from the build stage (not deps), since it contains
# the compiled dist/ output for every internal package (e.g.
# @clipflow/youtube-upload) produced by `pnpm --filter worker... build`
# above. Copying it from `deps` would only have source, not dist.
COPY --from=build --chown=nodejs:nodejs /app/apps/worker/dist ./apps/worker/dist
COPY --from=build --chown=nodejs:nodejs /app/apps/worker/package.json ./apps/worker/package.json
COPY --from=build --chown=nodejs:nodejs /app/apps/worker/node_modules ./apps/worker/node_modules
COPY --from=build --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=build --chown=nodejs:nodejs /app/packages ./packages

# Temp dir for ffmpeg extraction. mkdtemp at runtime, so we just need
# /tmp to be writable.
USER nodejs

# Worker doesn't expose a port; HEALTHCHECK would just verify the
# process is alive, which docker's restart policy already covers.

CMD ["node", "apps/worker/dist/index.js"]