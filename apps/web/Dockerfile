# Multi-stage build for the ClipFlow Next.js web app.
#
# Stage 1: pnpm fetch + install dependencies (incl. workspace packages)
# Stage 2: build the Next.js standalone bundle
# Stage 3: runtime image — node + the standalone server only
#
# Mirrors apps/worker/Dockerfile in shape (see comments there for the
# pnpm-store + workspace package reasoning). The standalone output keeps
# the final image small: node + a few hundred KB of compiled JS, ~190 MB
# total instead of ~600 MB.
#
# Pre-conditions the host must satisfy for `docker build` to succeed:
#   1. apps/web/next.config.js exports `output: "standalone"` and
#      `outputFileTracingRoot` pointed at the monorepo root. Without
#      `output: "standalone"`, the apps/web/.next/standalone directory
#      referenced below does not exist and the CMD has no entrypoint.
#   2. pnpm-lock.yaml is committed (frozen-lockfile refuses without it).
#
# Build context: the repo ROOT (set by docker-compose.yml's `context: .`)
# — never apps/web/. The Dockerfile COPY paths assume /app is the workspace
# root so apps/<pkg>, packages/<pkg>, pnpm-workspace.yaml, and the root
# package.json all resolve.

# ---- Stage 1: deps ----
# Use Debian-slim (the default for `node:<ver>-slim` is bookworm-slim).
# Alpine is smaller but Next.js + @prisma/client's transitive native deps
# have tripped Alpine's musl libc before, and the worker Dockerfile chose
# bookworm-slim for the same reason — stay consistent.
FROM node:24.13.0-slim AS deps

# Pin pnpm to match the workspace's `packageManager` field exactly.
# corepack reads package.json and fails loud on a drift, instead of
# silently pulling whatever's on PATH.
RUN corepack enable

WORKDIR /app

# Copy workspace manifests + the root lockfile first so the install layer
# caches independently of source code changes. Every app's package.json is
# needed because pnpm's workspace resolution reads them all at install
# time (even when filtering with `--filter web...`).
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY turbo.json ./
COPY apps/web/package.json ./apps/web/package.json
COPY packages ./packages
COPY apps/api/package.json ./apps/api/package.json
COPY apps/worker/package.json ./apps/worker/package.json

# Frozen lockfile so a CI build with a stale lockfile fails loud rather
# than silently rewriting it. `--filter web...` pulls the web app AND
# every transitive workspace dependency (config, types, etc.) in
# topological order — without the trailing `...`, the workspace
# packages never reach apps/web/node_modules and the next stage's
# `next build` would fail to resolve `@clipflow/config`.
RUN pnpm install --frozen-lockfile --filter web...

# ---- Stage 2: build ----
# `output: "standalone"` puts the production bundle at
# apps/web/.next/standalone/, preserving the apps/web/ source path. The
# server entrypoint lands at apps/web/.next/standalone/apps/web/server.js
# (yes, "apps/web" twice — that's how `outputFileTracingRoot` mirrors the
# project root inside the trace bundle).
FROM node:24.13.0-slim AS build

RUN corepack enable
WORKDIR /app

# Bring in installed node_modules from the deps stage. We don't re-run
# `pnpm install` here because lockfile + manifest changes already busted
# the deps layer; only source changes land in this stage.
COPY --from=deps /app /app

# Now copy the sources. apps/web first (the app we're building), then
# the workspaces it transitively depends on. We only copy what the web
# actually uses — apps/api and apps/worker sources are not needed for
# `next build`.
COPY apps/web ./apps/web
COPY packages ./packages

# Build the web app + every workspace package it depends on. The trailing
# `...` tells turbo/pnpm to include all transitive workspace deps in
# topological order. Internal packages (e.g. @clipflow/types) declare
# `main: "./dist/index.js"`, so their src/ has to be compiled to dist/
# BEFORE the web app's `next build` can resolve its imports. Without
# the `...` suffix, Node fails at runtime with `ERR_MODULE_NOT_FOUND`
# on packages/<name>/dist/index.js (the bug bug-048 surfaced for the
# worker's missing node_modules).
RUN pnpm --filter web... build

# ---- Stage 3: runtime ----
# node:24.13.0-slim is ~190 MB. Standalone output is a few hundred KB.
# Final image roughly matches the worker Dockerfile's size profile.
FROM node:24.13.0-slim AS runtime

# Non-root user. Next.js writes to /tmp for the fetch cache + image
# optimization cache, and a non-root user with a writable HOME keeps
# that working without juggling directory ownership. Mirrors the
# pattern apps/worker/Dockerfile uses for its own tmp/ scratch dir.
RUN groupadd --system --gid 1001 nodejs \
 && useradd --system --uid 1001 --gid nodejs --home /home/nodejs --shell /bin/bash --create-home nodejs

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
WORKDIR /app

# Standalone output structure (apps/web/.next/standalone/):
#   apps/web/server.js         ← Node entrypoint
#   apps/web/.next/...         ← build artifacts (chunks, manifests)
#   apps/web/public/           ← public dir, copied alongside by hand below
#   node_modules/...           ← traced subset of third-party deps
#   packages/.../dist/...      ← traced workspace package outputs
# The static chunks (.next/static) and the public/ dir are NOT inside
# the standalone bundle by default — they need to be copied alongside
# so the server can serve them at request time.
#
# IMPORTANT: pnpm uses isolated mode, so each package's direct deps live
# under apps/<pkg>/node_modules/<dep> as a *relative* symlink into
# node_modules/.pnpm/. The standalone bundle's `node_modules/` ships
# what the trace captured, but workspace-package symlinks into
# apps/web/node_modules/@clipflow/<pkg> are NOT inlined — they resolve
# at runtime through node's path resolver. Shipping apps/web/node_modules
# keeps those symlinks intact so the runtime import succeeds. Cost:
# we're shipping a subset of node_modules the standalone already has,
# but node's resolver hits apps/web/node_modules first, so it's a no-op
# for inlined deps and a hit for the workspace symlinks.
COPY --from=build --chown=nodejs:nodejs /app/apps/web/.next/standalone ./
COPY --from=build --chown=nodejs:nodejs /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=nodejs:nodejs /app/apps/web/public ./apps/web/public
COPY --from=build --chown=nodejs:nodejs /app/apps/web/node_modules ./apps/web/node_modules
COPY --from=build --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=build --chown=nodejs:nodejs /app/packages ./packages

USER nodejs

EXPOSE 3000

CMD ["node", "apps/web/server.js"]
