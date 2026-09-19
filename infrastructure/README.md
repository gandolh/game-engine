# infrastructure/ — the Farm Valley sim server image

**Scope: this directory builds an image. It does not deploy anything.**

That boundary is the whole point of this file, and it is the answer to
[audit-59](../corpus/todos/closed/2026-09-18-audit-59-deploy-not-in-version-control.md), which found
this repo carrying *two* deploy stories and shipping neither.

## What is here

| file | what it is |
|---|---|
| `Dockerfile` | two stages (`deps`, `prod`) building the Farm Valley **sim server** from source under `tsx`. Build context is the **repo root**, not this directory. |
| `docker-compose.yml` | builds that image and publishes it on **loopback only** (`127.0.0.1:${PORT}`), `restart: unless-stopped`. |
| `.env.example` | copy to `.env` — compose's `env_file:` requires it to exist even though every variable has a default. |

```bash
cp infrastructure/.env.example infrastructure/.env
docker compose -f infrastructure/docker-compose.yml up --build
```

**Only the sim runs in this image.** The three static clients (Farm Valley, Citadel, Hollow) and the
docs site are built from the same checkout with `npm run build` / the per-game build scripts and
served as **files**; none of them belong in the container. The `Dockerfile`'s header says the same
thing and is the more detailed version of it.

## What is deliberately NOT here

**The deployment configuration** — the reverse proxy that fronts this container and serves those
static files, the service definition that keeps it running, the host layout, and the release
procedure — **is maintained outside this repository and is not duplicated here.**

This is a decision, not an omission. One copy of that configuration exists and it is the one that
runs; a second copy living here would drift from it, and a drifted copy of deploy config is worse
than no copy, because it reads as authoritative. The same repo already learned this the expensive
way: a `deploy.ts` + process-manager narrative sat in `corpus/wiki/` for three months describing a
mechanism that was never in the tree, and it was still being cited as current.

**So: do not add a proxy config, a service unit, a deploy script or a release runbook to this repo.**
If you need them, they are not lost — they are simply not this repository's to hold.

## What this repo IS the source of truth for

The **contract between the image and whatever runs it**. Keep these accurate here, because nothing
downstream can re-derive them:

- **Port.** The server reads `process.env["PORT"] ?? 8787`
  ([`games/farm/server/src/index.ts`](../games/farm/server/src/index.ts)); the `Dockerfile` defaults
  it again via `ENV`, and compose publishes it. Three places, one value — change them together.
- **Transport.** It is a **WebSocket**, so whatever fronts it must upgrade the connection, not just
  proxy HTTP. This is the detail most likely to be got wrong and it fails at runtime, not at build.
- **Loopback binding.** Compose publishes to `127.0.0.1` on purpose. The container is not meant to be
  reachable from outside the host except through the proxy.
- **Node `>=24`**, pinned in the root `package.json` `engines` field and matching `node:24-alpine`
  here. This is the pin backed by a real constraint; the others follow it.
- **The wasm artifacts must be in the image.** The `prod` stage `RUN test -f
  engine/wasm-modules/dist/pathfinding.wasm || exit 1` makes this **self-enforcing** rather than
  asserted in a comment, because two committed files once disagreed about it and the runtime resolved
  the disagreement by warning and carrying on (audit-40). In production the server now **exits**
  instead of degrading to the JS pathfinder, which is a different code path and would silently change
  what players see.

## What is not verified from here

**Nothing here has been built or run in the environment this file was written in — there is no Docker
daemon in the dev sandbox.** The `Dockerfile` and compose file are reviewed-correct, not
execution-verified. Run `docker compose -f infrastructure/docker-compose.yml build` somewhere that
has a daemon before trusting a change to either.

And even then: **a green `docker compose build` proves the image builds. It does not prove the deploy
works.** The
proxy's WebSocket upgrade, the restart behaviour under a real host, and the static-file layout are
all outside this repository and cannot be gated by anything in it — which is exactly how audit-40's
`.dockerignore` bug survived: the only committed deploy path was one nobody built.

What would actually verify it: build the image, run it, and open the live game through the real
proxy — a client that connects and renders off the server exercises the port, the upgrade and the
wasm load in one go. That has to happen where the deployment config lives, not here.
