# Open Questions & Gaps

Live list of unresolved work and design questions. Items move out of here when a brief is written in [../briefs/](../briefs/) and back in (or get deleted) when answered.

## Code gaps (have a clear "next step")

_No code-level gaps tracked right now — see Resolved below._

## Resolved

- **Sim → Web Worker move** — _resolved 2026-05-29._ The sim now runs in a Web Worker (`packages/farm-valley/src/worker/`); the main thread renders from per-tick `RenderSnapshot`s and interpolates between them. `postMessage` transport (no SharedArrayBuffer → no cross-origin-isolation headers). Determinism preserved and verified: `npm run sim` (no Worker) and the in-browser Worker run produce identical outcomes for a seed. See [decisions.md](decisions.md) → Concurrency.
- **Chunked tile layer on Canvas2D** — _resolved 2026-05-29 (brief [engine/07](../briefs/engine/done/07-chunked-tile-layer.md))._ Built the cached-static-backdrop variant: the renderer bakes the backdrop (tiles + fences + plot dirt) once into an offscreen canvas and blits it under the per-frame dynamic queue. Chunking wasn't needed at 40×40. Canvas2D stayed locked; no WebGPU revival.
- **Asymmetric / fifth personality (variance injector)** — _resolved 2026-05-29 (brief [game/23](../briefs/game/done/23-fifth-personality-or-shock.md), Direction B)._ Chose the mid-game **shock** over a fifth personality. `ShockSystem` fires a one-time blight on the run midpoint, wiping a deterministically-chosen (crop-holding) farmer's planted plots and broadcasting `ONT_SIMULATION.SHOCK`. On-by-default, tunable/disable-able via `bootstrapSim({ shock })`. Preserves the "moments matter, no balance work" stance — it's a story beat, not a balance lever.
- **WASM pathfinder loaded but possibly idle** — _resolved 2026-05-29 (brief [engine/05](../briefs/engine/done/05-pathfinder-into-movement.md))._ Audit confirmed the pathfinder is **load-bearing**, not idle: `TravelSystem.findPath()` computes real routes on the walkable grid and farmers walk them waypoint-by-waypoint, routing around the void via roads. Added a game-grid around-obstacle test (`travel.test.ts` "routes around the void") and corrected the stale "loaded but not yet routed" claim in [architecture.md](architecture.md).
- **`act.ts` buy-seed bypass** — _resolved 2026-05-29._ `ActSystem`'s `buy-seed` intent now emits an `ONT_SHOP.SELL` (item: "seed") message to the shopkeeper instead of mutating the daily slate inline; `ShopkeeperSystem.handleSell` is the single owner of slate consumption + gold checks. Accepted behavior change: seeds now land ~1 tick after the ACT (ActSystem runs before ShopkeeperSystem), which shifts the deterministic outcome for a given seed. The duplicated slate-consume logic in `act.ts` is gone.

## Now has a brief (was an open question)

These were design/perf questions; they now have task specs in [../briefs/](../briefs/) and will move to `done/` when implemented:

- **Decision rationale trace (BDI "why")** → [game/todo/19-decision-trace.md](../briefs/game/todo/19-decision-trace.md). The Brief 11 focus mode shipped, which was the stated trigger to revisit this; the brief surfaces the *lightweight* current/next-intention + reason, not a full reasoning log.
