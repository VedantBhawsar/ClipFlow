# Multi-stage build for the ClipFlow API (Express 4 + TypeScript).
#
# Stage 1: pnpm fetch + install dependencies (incl. workspace packages)
# Stage 2: build the TypeScript bundle + generate the Prisma client
# Stage 3: runtime image — node + the compiled JS only
#
# Mirrors apps/web/Dockerfile + apps/worker/Dockerfile in shape. The api
# has no native apt deps (ffmpeg lives in the worker), but it imports
# bcrypt + @prisma/client which carry native bindings, so we stay on
# Debian-slim — Alpine's musl has tripped native rebuilds before.
#
# Pre-conditions the host must satisfy for `docker build` to succeed:
#   1. pnpm-lock.yaml is committed (frozen-lockfile refuses without it).
#   2. DATABASE_URL / JWT_SECRET / ENCRYPTION_KEY are supplied at run
#      time via env_file / `environment:` in docker-compose — the image
#      does NOT bake secrets in.
#
# Build context: the repo ROOT (set by docker-compose.yml's `context: .`)
# — never apps/api/. The Dockerfile COPY paths assume /app is the workspace
# root so apps/<pkg>, packages/<pkg>, pnpm-workspace.yaml, and the root
# package.json all resolve.

# ---- Stage 1: deps ----
FROM node:24.13.0-slim AS deps

# Pin pnpm to match the workspace's `packageManager` field exactly.
# corepack reads package.json and fails loud on a drift, instead of
# silently pulling whatever's on PATH.
RUN corepack enable

WORKDIR /app

# Copy workspace manifests + the root lockfile first so the install layer
# caches independently of source code changes. Every app's package.json is
# needed because pnpm's workspace resolution reads them all at install
# time (even when filtering with `--filter api...`).
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY turbo.json ./
COPY packages ./packages
COPY apps/api/package.json ./apps/api/package.json
COPY apps/web/package.json ./apps/web/package.json
COPY apps/worker/package.json ./apps/worker/package.json

# Frozen lockfile so a CI build with a stale lockfile fails loud rather
# than silently rewriting it. `--filter api...` pulls the api app AND
# every transitive workspace dependency (@clipflow/db, @clipflow/s3,
# @clipflow/youtube-upload, @clipflow/config, @clipflow/types,
# @clipflow/crypto) in topological order — without the trailing `...`,
# the workspace packages never reach apps/api/node_modules and the next
# stage's `tsc` build would fail to resolve `@clipflow/db`.
RUN pnpm install --frozen-lockfile --ignore-scripts --filter api...

# ---- Stage 2: build ----
# tsc outDir is ./dist, so the compiled JS lands in apps/api/dist.
# The db package's postinstall generates the Prisma client into a path
# that the api imports from — running prisma:generate explicitly here
# makes the generated client available to the runtime stage.
FROM node:24.13.0-slim AS build

RUN corepack enable
WORKDIR /app

# Bring in installed node_modules from the deps stage. We don't re-run
# `pnpm install` here because lockfile + manifest changes already busted
# the deps layer; only source changes land in this stage.
COPY --from=deps /app /app

# Now copy the sources. apps/api first (the app we're building), then
# the workspaces it transitively depends on.
COPY apps/api ./apps/api
COPY packages ./packages

RUN pnpm --filter @clipflow/db prisma:generate

# IMPORTANT: build the api AND every workspace package it depends on
# (e.g. @clipflow/youtube-upload, @clipflow/s3), not just the api
# itself. The trailing "..." tells turbo/pnpm to include all transitive
# workspace dependencies in topological order. Internal packages declare
# `main: "./dist/index.js"`, so their src/ has to be compiled to dist/
# BEFORE `tsc` can resolve their imports. Without the `...` suffix, the
# runtime would hit `ERR_MODULE_NOT_FOUND` on
# packages/<name>/dist/index.js (the same class of failure that hit the
# worker before — see the apps/worker/Dockerfile comment).
RUN pnpm --filter api... build

# ---- Stage 3: runtime ----
# node:24.13.0-slim is ~190 MB. The api's compiled dist is a few MB;
# node_modules + packages trim down to the subset the api actually
# loads at runtime. Final image roughly matches the web Dockerfile's
# size profile (no ffmpeg, so lighter than the worker).
FROM node:24.13.0-slim AS runtime

# Non-root user. The api process is stateless (no file IO outside
# stdout), but bcrypt + the Prisma client open .so files at runtime
# and need HOME to be writable for the engines cache. Mirrors the
# pattern apps/worker/Dockerfile uses for its own runtime user.
RUN groupadd --system --gid 1001 nodejs \
 && useradd --system --uid 1001 --gid nodejs --home /home/nodejs --shell /bin/bash --create-home nodejs

ENV NODE_ENV=production
# env.PORT defaults to 4000 in @clipflow/config (packages/config/src/index.ts).
# Override at run time via `environment: { PORT: ... }` in docker-compose.
ENV PORT=4000
WORKDIR /app

# IMPORTANT: pnpm uses isolated mode by default, so each package's
# direct deps live under apps/<pkg>/node_modules/<dep> as a *relative*
# symlink into node_modules/.pnpm/. We MUST ship apps/api/node_modules
# alongside the root node_modules, otherwise the api's direct imports
# (e.g. `import { Queue } from "bullmq"`, `import bcrypt from "bcrypt"`)
# crash with ERR_MODULE_NOT_FOUND at runtime even though the .pnpm/
# blobs are present. This is the same pitfall bug-048 surfaced for the
# worker — long comment here so the next person doesn't strip it.
#
# `packages` comes from the build stage (not deps), since it contains
# the compiled dist/ output for every internal package
# (@clipflow/youtube-upload, @clipflow/s3, @clipflow/db's generated
# client, etc.) produced by `pnpm --filter api... build` above. Copying
# from `deps` would only have source, not dist.
COPY --from=build --chown=nodejs:nodejs /app/apps/api/dist ./apps/api/dist
COPY --from=build --chown=nodejs:nodejs /app/apps/api/package.json ./apps/api/package.json
COPY --from=build --chown=nodejs:nodejs /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=build --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=build --chown=nodejs:nodejs /app/packages ./packages
RUN apt-get update -y && apt-get install -y openssl

USER nodejs

EXPOSE 4000

CMD ["node", "apps/api/dist/index.js"]