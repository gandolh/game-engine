# Task 02 — The Farm Valley server runs built JavaScript, started by node

## Context

The VPS has 3.7 GiB of RAM shared by every app in the estate, and the owner
doesn't want to upgrade it (vps-deploy's `memory-on-the-box` research,
2026-11-04). The Farm Valley sim's container (`farm-valley-sim` on the box)
runs from source under tsx, started through `npm`: `CMD ["npm", "run",
"server"]`, which runs `npm start -w @farm/server`, then tsx. On 2026-11-04
the tsx process held 12 MB with 41 MB in swap and the two `npm` wrappers
about 15 MB plus swap; the container used 27 MB.

The owner decided on 2026-11-04 that the apps on the box run built
JavaScript and start with `node` directly. This revisits the Dockerfile's
"runs from SOURCE under tsx" choice for the server; record that where the
choice is written down.

## Files you OWN

- The `@farm/server` workspace's build setup (a `build` script, emit
  config), and the workspaces it imports only as far as the build needs
- `infrastructure/Dockerfile` (a build stage; the runtime stage runs `node`
  on the output) and the compose file if paths change
- `README.md`, docs pages that name the start command
- `corpus/wiki/` pages that say the server runs under tsx, `status.md`,
  `log.md`

## What to do

1. Build the server to JavaScript (`tsc`, or a bundler if workspace imports
   of raw `.ts` or the WASM pathfinder make `tsc` awkward; say which and
   why). Keep the dev scripts on tsx.
2. The runtime image runs `CMD ["node", "<built entry>"]`: no `npm`, no
   `tsx`.
3. Check the sim still runs deterministically from the built output (the
   existing determinism check, not the heavy suites).
4. Measure the container idle before and after (`docker stats`; Docker is up
   locally).

## Acceptance

- The image builds, the container starts and serves a client; the server
  workspace's light tests pass.
- `npm` and `tsx` aren't in the runtime process tree (`docker top`).
- The outcome gives idle memory before and after. The deploy is the owner's
  step from vps-deploy.

## Outcome (2026-11-04)

Done. The image runs `CMD ["node", "games/farm/server/dist/index.mjs"]`. `docker top` on the new
container shows one process, `node games/farm/server/dist/index.mjs`: no npm, no tsx, no esbuild.

**Build tool: Vite**, through `npm run build -w @farm/server`
([vite.build.config.ts](../../../games/farm/server/vite.build.config.ts)), not `tsc`. Every workspace
package the server imports exports raw `.ts` with extensionless imports. Node loads neither, and the
`.js`-suffix ban rules out emitting them, so `tsc` would have meant emit setups in three workspaces
and still failed at import time. Vite is already the root's bundler for the clients, so no
dependency was added and the lockfile is unchanged. It also resolves the engine's `*.glsl?raw`
imports, though tree-shaking drops the renderer anyway. `ws` is inlined (`ssr.noExternal`), so the
runtime stage ships no `node_modules`. The bundle is one 601 kB ES module, unminified so stack
traces stay readable. The config is not named `vite.config.ts` because `vitest run` would pick it up.
The dev scripts stay on tsx: `npm run server` and `npm run dev` are unchanged.

**The WASM pathfinder was not a build problem.** The server reads `pathfinding.wasm` from disk,
relative to its own file, so the only rule is placement: the bundle sits in `dist/`, at the same
depth as `src/`. The image keeps `/app/games/farm/server/dist/` and `/app/engine/wasm-modules/dist/`.

**The Dockerfile** has three stages now: `deps` (unchanged `npm ci`), `build` (copies `engine/` and
`games/`, runs the build), and `prod` (`node:24-alpine`, the bundle, `engine/wasm-modules/dist` from
the context, the audit-40 `RUN test -f`, then `node`). The header records the revisit: until
2026-11-04 the image ran the source under tsx through `npm run server`. `dockerignore.test.ts` gained
three checks on the prod stage: `CMD` is `node` on the bundle, no instruction names npm, tsx or
`node_modules`, and the bundle is copied to the depth the wasm path needs. Its ordering check now
fails if either line is missing. Run against the old Dockerfile, 4 of its 12 tests fail.

**Measured locally** (Docker Desktop, no memory pressure, `docker stats` 30 s after start, before
any client):

| | before (tsx) | after (node) |
|---|---|---|
| idle memory | 188 MiB | 27 MiB |
| after one 3-day client run | 264 MiB | 112 MiB |
| processes | 5: `npm run server`, `npm start`, the tsx CLI, node with the tsx loader, the esbuild service | 1: `node` |
| image size | 720 MB | 171 MB |

The box had swapped most of the old tree out (27 MB resident there), so its saving will show as
less swap rather than the same 161 MiB. `docker stop` still shuts down cleanly: node is PID 1 and the
server handles SIGTERM itself.

**Checks.** Typecheck of `@farm/server` and its dependencies; the server's light tests (114 pass,
including the byte-identical host runs); the existing determinism check
(`CHECK_DETERMINISM=1 MAX_DAYS=2 TICKS_PER_DAY=20 PATHFINDER=wasm SEEDS=12648430,1,42 npm run sim`,
MATCH ×3). From the built output: a WebSocket client sent `init` (seed `0xc0ffee`, 3 days at 20
ticks) to each container twice and got `attach`, the static layer and snapshots up to `gameOver`.
Within each container the two runs matched, and between them the static layer, the final snapshot
and all 59 shared ticks were byte-identical to the tsx container's. The bundle was also run locally
with `NODE_ENV=production` from another directory and found the wasm.

**Brief vs code.** None of the brief's facts were wrong. The compose file did not need changing,
because the service, target, port and image tag are the same. One header claim in the Dockerfile
does not match the code: it says `npm ci` needs every workspace manifest present. The root's
`portal` workspace (added 2026-11-03) is not copied into the `deps` stage, and `npm ci` passed
without it. The claim was left as it was and is noted here.

**vps-deploy** needs no change. Its farm-valley stack names no start command (compose does), and its
`sources` already ship everything the build stage reads. The deploy is the owner's step.

**Open.** Two calls were made conservatively. `ws` is bundled rather than shipped as
`node_modules/ws`. The container still runs as root, as before; a `USER node` line is a separate
hardening change.
