# Citadel — overview

**Citadel** is the second game in this monorepo, built on the same shared `@engine/core` as Farm Valley. It is a settlement / light-RTS sim: grow a town's economy through settlement *tiers*, keep villagers fed and happy, and survive raids, sieges, fire, and disease. It is younger and more actively-evolving than Farm Valley — treat the briefs/todos below as the live spec and **verify against code** before relying on any detail here.

## Packages

- [`@citadel/sim-core`](../../games/citadel/sim-core/) — the deterministic Citadel sim (systems, world/terrain, entities, snapshot). Imports `@engine/core`; never imports a renderer or the Farm packages.
- [`@citadel/client`](../../games/citadel/client/) — the browser client (Vite, port 5174). Unlike Farm Valley (which runs its sim server-side), **Citadel runs the sim in an in-browser Web Worker** ([sim-worker.ts](../../games/citadel/client/src/worker/sim-worker.ts)) and posts snapshots to the main thread over `postMessage`.
- [`@tool/citadel-sim`](../../tools/citadel-sim/) — headless Citadel sim runner (`npm run sim:citadel`). Drives `bootstrapSim()` directly (no Worker). Ships several scenarios via the `SCENARIO` env var: `grow` (default), `starve`, `siege`, `sack`, `fire`, `disease`.

## Sim systems

Registered in [sim-bootstrap.ts](../../games/citadel/sim-core/src/sim-bootstrap.ts). The system files live in [systems/](../../games/citadel/sim-core/src/systems/):

- **Economy / population**: `production`, `villager-system`, `immigration`, `needs-happiness`, `trader`, `tiers` (settlement-tier progression with thresholds + locks), `road-connectivity`, `day-clock`.
- **Threats**: `raid-spawn`, `raider-movement`, `siege-resolution`, `fire-system`, `disease-system`.

Terrain + walkability come from [world/terrain.ts](../../games/citadel/sim-core/src/world/terrain.ts) (`generateTerrain`, `isWalkable`, `TerrainType`); villagers are defined in [entities/villager.ts](../../games/citadel/sim-core/src/entities/villager.ts).

## Shared invariants

Citadel obeys the same engine-level rules as Farm Valley:
- **Determinism** via the seeded [`Rng`](../../engine/core/src/runtime/rng.ts) — no `Math.random`/`Date.now` in sim code; tick output depends only on tick count. `bootstrapSim()` stays transport-agnostic (Worker, headless).
- **EDG32 palette** enforced by the same guard test (it now walks `engine/`, `games/`, `tools/`).

## Briefs & todos

There is no Farm-Valley-style "done brief" archive for Citadel yet; work is tracked as todos. See [briefs/citadel-apr.md](../briefs/citadel-apr.md) and the `corpus/todos/*citadel-*` files (e.g. the `citadel-00-BUILD-ORDER` epic and the 21–33 series: windowed-grid render, incremental build queue, PlayerState refactor, territory/influence, PvP armies, per-player PvE). Fold durable Citadel findings into this page as the design settles.
