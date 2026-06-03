# Open Questions & Gaps

Live list of unresolved work and design questions. Items move out of here when a brief is written in [../briefs/](../briefs/) and back in (or get deleted) when answered.

## Code gaps (have a clear "next step")

- **Auctions are dead on the field** — _found 2026-06-03 (Playwright run), brief filed [game/24](../briefs/game/todo/24-auction-bidding-golden-bean.md)._ Brief 21's English/FPSB/Vickrey machinery is correct and tested, but **no agent ever bids**: the shopkeeper auctions a `golden_bean` that has zero in-sim value, so every auction closes "no winner" and the Activity feed is ~all auction-no-winner lines. The fix gives the bean real value (resale + gifting) and wires per-personality bidding.

## Resolved

- **Sim → Web Worker move** — _resolved 2026-05-29._ The sim now runs in a Web Worker (`packages/farm-valley/src/worker/`); the main thread renders from per-tick `RenderSnapshot`s and interpolates between them. `postMessage` transport (no SharedArrayBuffer → no cross-origin-isolation headers). Determinism preserved and verified: `npm run sim` (no Worker) and the in-browser Worker run produce identical outcomes for a seed. See [decisions.md](decisions.md) → Concurrency.
- **Chunked tile layer on Canvas2D** — _resolved 2026-05-29 (brief [engine/07](../briefs/engine/done/07-chunked-tile-layer.md))._ Built the cached-static-backdrop variant: the renderer bakes the backdrop (tiles + fences + plot dirt) once into an offscreen canvas and blits it under the per-frame dynamic queue. Chunking wasn't needed at 40×40. Canvas2D stayed locked; no WebGPU revival.
- **Asymmetric / fifth personality (variance injector)** — _resolved 2026-05-29 (brief [game/23](../briefs/game/done/23-fifth-personality-or-shock.md), Direction B)._ Chose the mid-game **shock** over a fifth personality. `ShockSystem` fires a one-time blight on the run midpoint, wiping a deterministically-chosen (crop-holding) farmer's planted plots and broadcasting `ONT_SIMULATION.SHOCK`. On-by-default, tunable/disable-able via `bootstrapSim({ shock })`. Preserves the "moments matter, no balance work" stance — it's a story beat, not a balance lever.
- **WASM pathfinder loaded but possibly idle** — _resolved 2026-05-29 (brief [engine/05](../briefs/engine/done/05-pathfinder-into-movement.md))._ Audit confirmed the pathfinder is **load-bearing**, not idle: `TravelSystem.findPath()` computes real routes on the walkable grid and farmers walk them waypoint-by-waypoint, routing around the void via roads. Added a game-grid around-obstacle test (`travel.test.ts` "routes around the void") and corrected the stale "loaded but not yet routed" claim in [architecture.md](architecture.md).
- **`act.ts` buy-seed bypass** — _resolved 2026-05-29._ `ActSystem`'s `buy-seed` intent now emits an `ONT_SHOP.SELL` (item: "seed") message to the shopkeeper instead of mutating the daily slate inline; `ShopkeeperSystem.handleSell` is the single owner of slate consumption + gold checks. Accepted behavior change: seeds now land ~1 tick after the ACT (ActSystem runs before ShopkeeperSystem), which shifts the deterministic outcome for a given seed. The duplicated slate-consume logic in `act.ts` is gone.

## Now has a brief (was an open question)

Filed 2026-06-03 (grilling session — see [log.md](../log.md) and [status.md](status.md) § Now in todo):

- **Auctions never produce a winner** → [game/24](../briefs/game/todo/24-auction-bidding-golden-bean.md) (also listed under Code gaps above — it's a live bug, not just a design question).
- **Visual flatness — no atmosphere, no sense of time passing** → expanded into a four-part design: day/night + seasonal grading ([game/26](../briefs/game/todo/26-day-night-seasonal-grading.md)), and the gameplay redesign it dragged in — long days + intra-day timeline ([game/27](../briefs/game/todo/27-long-days-intraday-timeline.md)), AP economy rework ([game/28](../briefs/game/todo/28-ap-economy-rework.md)), irrigation & crop death ([game/29](../briefs/game/todo/29-irrigation-crop-death.md)). Plus procedural ground texture ([game/30](../briefs/game/todo/30-procedural-ground-texture.md)).
- **Top-right UI panels overlap** → [game/25](../briefs/game/todo/25-panel-overlap-fix.md).
- **Stale corpus index** (`index.md` listed shipped briefs under "todo") → [game/31](../briefs/game/todo/31-corpus-index-sync.md).

### Open design question carried by these briefs

- **Book of Shaders fit** — _researched 2026-06-03._ It targets GPU GLSL/WebGL and is "all rights reserved"; this project is locked to Canvas2D ([decisions.md](decisions.md) → Renderer). Verdict: **the code/tooling does not fit; the math does.** Briefs 26 (color mixing / day-night curve) and 30 (value noise / fBm) reimplement its *algorithms* in JS — they do **not** copy its code or adopt WebGL. No revisit of the Canvas2D decision is implied.

## Recently shipped (2026-05-29 swarm)

The final 8 briefs all landed; see [status.md](status.md) and [log.md](../log.md) for detail:

- **Decision rationale trace (BDI "why")** → [game/done/19-decision-trace.md](../briefs/game/done/19-decision-trace.md). The Brief 11 focus mode was the stated trigger; ships the *lightweight* current/next-intention + reason ring buffer for the focused farmer, not a full reasoning log.
- Determinism harness + analytics ([engine/06](../briefs/engine/done/06-determinism-harness-and-analytics.md)), playback controls ([game/16](../briefs/game/done/16-playback-controls.md)), save/replay ([game/17](../briefs/game/done/17-save-replay.md)), seed picker ([game/18](../briefs/game/done/18-seed-picker.md)), event feed ([game/20](../briefs/game/done/20-event-feed.md)), complete auctions ([game/21](../briefs/game/done/21-complete-auctions.md)), seasons/weather arcs ([game/22](../briefs/game/done/22-seasons-weather-arcs.md)).
