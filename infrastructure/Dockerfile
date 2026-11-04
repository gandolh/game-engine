# syntax=docker/dockerfile:1-labs
# Farm Valley's sim server — the Node half of the WebGL2 game.
#
# Build context is the REPO ROOT. `npm ci` validates the lockfile against the
# FULL workspace set the root package.json declares ("engine/*", "games/*/*",
# "tools/*", "docs"), so every one of those manifests has to be present or the
# install bails. The source is small; node_modules is not, and it is built here
# rather than shipped.
#
# The server runs as BUILT JavaScript, started by `node` directly: no npm, no
# tsx and no node_modules in the runtime stage. The `build` stage bundles
# @farm/server and the workspace packages it imports (raw .ts, which Node
# cannot load) into one ES module with Vite — games/farm/server/vite.build.config.ts
# says why a bundler rather than tsc. The bundle lands in dist/, at the same
# depth as src/, because the server finds pathfinding.wasm relative to its own
# file (`../../../../engine/wasm-modules/dist/`).
#
# Until 2026-11-04 this image ran from SOURCE under tsx, started through
# `npm run server`, and kept every dev dependency at runtime. The owner decided
# that day that the apps on the box run built JavaScript: the box's RAM is
# shared by every app in the estate, and the two npm wrappers, the tsx loader
# and its esbuild service were resident for nothing.
#
# The committed wasm artifacts the sim reads (pathfinding.wasm and friends)
# come from the build context, which required un-ignoring them in
# .dockerignore, whose `**/dist` rule had been stripping them (audit-40). That
# claim is CHECKED in the prod stage below rather than asserted here: a comment
# cannot fail.
#
# Only the SIM runs here. The three static clients built from this same
# checkout — farm-valley, citadel, hollow — and the docs site are built on the
# deploy machine and uploaded to Caddy as files; none of them belong in this
# image.

FROM node:24-alpine AS deps
RUN apk add --no-cache python3 make g++
WORKDIR /app
COPY package.json package-lock.json ./
# Every workspace manifest, globbed so a newly-added game or tool is picked up
# without a per-workspace COPY line to keep in sync.
COPY --parents engine/*/package.json ./
COPY --parents games/*/*/package.json ./
COPY --parents tools/*/package.json ./
COPY docs/package.json ./docs/
RUN npm ci

FROM deps AS build
COPY tsconfig.base.json ./
COPY engine ./engine
COPY games ./games
RUN npm run build -w @farm/server

FROM node:24-alpine AS prod
LABEL org.opencontainers.image.title="Farm Valley sim server"
WORKDIR /app
COPY --from=build /app/games/farm/server/dist ./games/farm/server/dist
COPY engine/wasm-modules/dist ./engine/wasm-modules/dist
# audit-40: make the wasm contract SELF-ENFORCING. Two committed files used to disagree about
# whether the artifacts reach the image, and the runtime resolved the disagreement by warning and
# carrying on. Fail the BUILD instead — it costs nothing and it cannot drift out of date.
RUN test -f engine/wasm-modules/dist/pathfinding.wasm \
  || (echo "FATAL: engine/wasm-modules/dist/pathfinding.wasm is missing from the build context." \
      && echo "       Check .dockerignore — its '**/dist' rule matches this tracked directory." \
      && exit 1)
ENV NODE_ENV=production \
    PORT=8787
EXPOSE 8787
# node is PID 1 here; the server handles SIGTERM itself, so `docker stop` still shuts it down cleanly.
CMD ["node", "games/farm/server/dist/index.mjs"]
