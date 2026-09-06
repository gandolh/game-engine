# syntax=docker/dockerfile:1-labs
# Farm Valley's sim server — the Node half of the WebGPU game.
#
# Build context is the REPO ROOT. `npm ci` validates the lockfile against the
# FULL workspace set the root package.json declares ("engine/*", "games/*/*",
# "tools/*", "docs"), so every one of those manifests has to be present or the
# install bails. The source is small; node_modules is not, and it is built here
# rather than shipped.
#
# Like just-a-bot, this runs from SOURCE under `tsx` (a devDependency), so the
# runtime stage keeps dev dependencies. The committed wasm artifacts the sim
# reads (pathfinding.wasm and friends) ride along with the source.
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

FROM node:24-alpine AS prod
LABEL org.opencontainers.image.title="Farm Valley sim server"
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json tsconfig.base.json ./
COPY engine ./engine
COPY games ./games
COPY tools ./tools
COPY docs/package.json ./docs/
ENV NODE_ENV=production \
    PORT=8787
EXPOSE 8787
CMD ["npm", "run", "server"]
