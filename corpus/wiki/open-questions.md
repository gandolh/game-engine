# Open Questions & Gaps

Live list of unresolved work and design questions. Items move out of here when a brief is written in [../briefs/](../briefs/) and back in (or get deleted) when answered.

## Code gaps (have a clear "next step")

_No code-level gaps tracked right now — the 2026-06-03 batch (briefs 24–30) all shipped. See Resolved below and [status.md](status.md)._

## Resolved

- **Sim → Web Worker move** — _resolved 2026-05-29._ The sim now runs in a Web Worker (`packages/farm-valley/src/worker/`); the main thread renders from per-tick `RenderSnapshot`s and interpolates between them. `postMessage` transport (no SharedArrayBuffer → no cross-origin-isolation headers). Determinism preserved and verified: `npm run sim` (no Worker) and the in-browser Worker run produce identical outcomes for a seed. See [decisions.md](decisions.md) → Concurrency.
- **Chunked tile layer on Canvas2D** — _resolved 2026-05-29 (brief [engine/07](../briefs/engine/done/07-chunked-tile-layer.md))._ Built the cached-static-backdrop variant: the renderer bakes the backdrop (tiles + fences + plot dirt) once into an offscreen canvas and blits it under the per-frame dynamic queue. Chunking wasn't needed at 40×40. Canvas2D stayed locked; no WebGPU revival.
- **Asymmetric / fifth personality (variance injector)** — _resolved 2026-05-29 (brief [game/23](../briefs/game/done/23-fifth-personality-or-shock.md), Direction B)._ Chose the mid-game **shock** over a fifth personality. `ShockSystem` fires a one-time blight on the run midpoint, wiping a deterministically-chosen (crop-holding) farmer's planted plots and broadcasting `ONT_SIMULATION.SHOCK`. On-by-default, tunable/disable-able via `bootstrapSim({ shock })`. Preserves the "moments matter, no balance work" stance — it's a story beat, not a balance lever.
- **WASM pathfinder loaded but possibly idle** — _resolved 2026-05-29 (brief [engine/05](../briefs/engine/done/05-pathfinder-into-movement.md))._ Audit confirmed the pathfinder is **load-bearing**, not idle: `TravelSystem.findPath()` computes real routes on the walkable grid and farmers walk them waypoint-by-waypoint, routing around the void via roads. Added a game-grid around-obstacle test (`travel.test.ts` "routes around the void") and corrected the stale "loaded but not yet routed" claim in [architecture.md](architecture.md).
- **`act.ts` buy-seed bypass** — _resolved 2026-05-29._ `ActSystem`'s `buy-seed` intent now emits an `ONT_SHOP.SELL` (item: "seed") message to the shopkeeper instead of mutating the daily slate inline; `ShopkeeperSystem.handleSell` is the single owner of slate consumption + gold checks. Accepted behavior change: seeds now land ~1 tick after the ACT (ActSystem runs before ShopkeeperSystem), which shifts the deterministic outcome for a given seed. The duplicated slate-consume logic in `act.ts` is gone.
- **Auctions dead on the field (no agent bids)** — _resolved 2026-06-03 (brief [game/24](../briefs/game/done/24-auction-bidding-golden-bean.md))._ The `golden_bean` is now a valuable good (resell ×3 / gift for trust) and all four personalities bid; live runs show 20/20 auctions producing winners. Also surfaced + fixed two latent bugs: `EncounterTradeSystem` was never registered post-Worker-migration (peer trades/gifts dead live), and `sell-from-wall` cost 0 AP.
- **Visual flatness + no sense of time** — _resolved 2026-06-03 (briefs [game/26](../briefs/game/done/26-day-night-seasonal-grading.md), [game/30](../briefs/game/done/30-procedural-ground-texture.md))._ Day/night + seasonal color wash (tick-synced) and per-tile ground-noise texture, both render-only and seed-deterministic. The "no sense of time passing" half drove the long-day redesign below.
- **One-decision-per-day felt static** — _resolved 2026-06-03 (briefs [game/27](../briefs/game/done/27-long-days-intraday-timeline.md), [game/28](../briefs/game/done/28-ap-economy-rework.md), [game/29](../briefs/game/done/29-irrigation-crop-death.md))._ Long days (ticksPerDay 1200), intra-day phase timeline + sleep, AP economy (growing budget, sleep gate, free travel, friend discounts), and irrigation with crop death. **The feared rebalancing did not materialize** — day stayed the economic unit and survival reflexes keep agents productive, so 100-day outcomes match the prior baseline and determinism held throughout.
- **Top-right UI panels overlap** — _resolved 2026-06-03 (brief [game/25](../briefs/game/done/25-panel-overlap-fix.md))._ Shared right-column flex container.

### Resolved design question

- **Book of Shaders fit** — _researched 2026-06-03._ It targets GPU GLSL/WebGL and is "all rights reserved"; this project is locked to Canvas2D ([decisions.md](decisions.md) → Renderer). Verdict: **the code/tooling does not fit; the math does.** Briefs 26 (color mixing / day-night curve) and 30 (value noise) reimplemented its *algorithms* in JS — no copied code, no WebGL, no Canvas2D revisit.

## Recently shipped (2026-05-29 swarm)

The final 8 briefs all landed; see [status.md](status.md) and [log.md](../log.md) for detail:

- **Decision rationale trace (BDI "why")** → [game/done/19-decision-trace.md](../briefs/game/done/19-decision-trace.md). The Brief 11 focus mode was the stated trigger; ships the *lightweight* current/next-intention + reason ring buffer for the focused farmer, not a full reasoning log.
- Determinism harness + analytics ([engine/06](../briefs/engine/done/06-determinism-harness-and-analytics.md)), playback controls ([game/16](../briefs/game/done/16-playback-controls.md)), save/replay ([game/17](../briefs/game/done/17-save-replay.md)), seed picker ([game/18](../briefs/game/done/18-seed-picker.md)), event feed ([game/20](../briefs/game/done/20-event-feed.md)), complete auctions ([game/21](../briefs/game/done/21-complete-auctions.md)), seasons/weather arcs ([game/22](../briefs/game/done/22-seasons-weather-arcs.md)).
