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

## Status notes (verified 2026-06-21)

First real-GPU solo playtest (prior reviews were headless): **WebGPU renders correctly**
(terrain + sub-tile dither, building/villager sprites, HUD, day/night) and the full v1
loop works — spaced, road-connected economy → founder → bread chain → immigration →
stable growth (verified to Day 199). Three solo-blocking bugs were fixed (see the
2026-06-21 log entry): Well/Healer were missing from the toolbar (the only fire/disease
mitigation, unbuildable); placement commands were dropped while paused; speed buttons
didn't resume. **Plan-while-paused** now works via `CitadelSimResult.applyCommands(ctx)`
(off-tick, determinism-safe). Two gotchas remain for players (not bugs): bootstrap is
**founding-window-gated** (place a connected economy early or deadlock), and **fire
punishes tight clusters** by design — space buildings ~5–8 tiles and connect with roads
(roads are firebreaks). MP-RTS live wiring holes from [todo 38](../todos/2026-06-19-citadel-38-implementation-review-problems.md)
are still open (solo is unaffected).

## Rendering & assets

Citadel is **WebGPU-only** at runtime (no Canvas2D fallback). Terrain is baked into
the static layer (render-windowed on the large MP map — see the 2026-06-19 log entry);
buildings / villagers / raiders are `sprite-batch` quads.

**Sprites (2026-06-19).** Entities are real **pixel-art sprites**, not flat colored
boxes. The art lives as ASCII `PixelRecipe`s under
[client/src/render/sprites/](../../games/citadel/client/src/render/sprites/) and is
rasterized + shelf-packed into **one in-process atlas at client boot**
(`createCitadelSpriteAtlas` in `sprites/atlas.ts`) — no committed PNGs, no `npm run`
build step (unlike Farm Valley's `@farm/atlas-recipes` → `npm run atlas` committed-PNG
pipeline, which Citadel can't import: games never import each other). The atlas keeps a
1×1 white `px` frame that every tinted-box path still uses (ghost, light-pool, wear,
road/wall autotile, house-cluster border, ambient crowd). Per-type frame mapping +
tinting live in `quads.ts`:
- **Buildings** sample `bld/<type>` tinted white (recipe colors show); a burning
  building multiplies its tint toward orange. ~20 building types have art; a type without
  a recipe falls back to a tinted box (never requests a missing frame). Road/wall/gate
  keep their pre-existing autotile/inset-box rendering.
- **Villagers / raiders** are grey-ramp silhouettes (`vil/person`, `raider`); the
  per-instance tint (FSM-state color / red) multiplies into a shaded colored figure, so
  state still reads at a glance.

The recipe palette (`sprites/palette.ts`) derives every swatch from an `EDG.*` constant
via `rgbOf`, so it's EDG32-clean by construction (a test re-asserts it). Rasterize +
pack are pure (deterministic, headlessly tested); only the canvas/`createImageBitmap`
step is browser-only. **Phase 2 (not done):** textured terrain tiles, road/wall autotile
sprites, a gate sprite, MP owner-color differentiation.

**Visual polish (2026-06-21).** Render-only ideas borrowed from `tiny-world-builder`:
elevation-biased terrain dither, a directional NW-sun building drop-shadow
(`LAYER_SHADOW`), a deeper-night/stronger-dusk wash, and extra procedural detail in the
sprite generators (roof shingles, wall seams, doorstep, fort ashlar courses). All
render-only, EDG32-clean, sim untouched. See the 2026-06-21 log entry.

**PLANNED — true isometric (render+art epic).** A staged brief
([../todos/2026-06-21-citadel-true-isometric.md](../todos/2026-06-21-citadel-true-isometric.md))
scopes converting Citadel to a true isometric (2:1 dimetric diamond-grid) projection.
It is **render + input + art only — `@citadel/sim-core` and determinism are
untouched** (iso is a *display* of the existing axis-aligned tile grid). Cost ≈ 70%
art (re-authoring the top-down sprite library at the iso angle) / 30% code (the
`screenToTile` inverse in `transform.ts` + painter's-order depth sort are the risk
centres). Must not land half-done — a partial projection swap breaks placement. The
sprite library described above is still **top-down**; Stage 4 re-authors it.

## Briefs & todos

There is no Farm-Valley-style "done brief" archive for Citadel yet; work is tracked as todos. See [briefs/citadel-apr.md](../briefs/citadel-apr.md) and the `corpus/todos/*citadel-*` files (e.g. the `citadel-00-BUILD-ORDER` epic and the 21–33 series: windowed-grid render, incremental build queue, PlayerState refactor, territory/influence, PvP armies, per-player PvE). Fold durable Citadel findings into this page as the design settles.
