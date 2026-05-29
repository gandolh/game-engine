# Open Questions & Gaps

Live list of unresolved work and design questions. Items move out of here when a brief is written in [../briefs/](../briefs/) and back in (or get deleted) when answered.

## Code gaps (have a clear "next step")

- **WASM pathfinder loaded but possibly idle.** `Pathfinder` is loaded at boot and `TravelSystem` consumes it conditionally, but it's unconfirmed whether agents path *around* obstacles or move straight-line. **Now briefed → [engine/todo/05-pathfinder-into-movement.md](../briefs/engine/todo/05-pathfinder-into-movement.md)** (audit + wire, or document as straight-line).

## Resolved

- **`act.ts` buy-seed bypass** — _resolved 2026-05-29._ `ActSystem`'s `buy-seed` intent now emits an `ONT_SHOP.SELL` (item: "seed") message to the shopkeeper instead of mutating the daily slate inline; `ShopkeeperSystem.handleSell` is the single owner of slate consumption + gold checks. Accepted behavior change: seeds now land ~1 tick after the ACT (ActSystem runs before ShopkeeperSystem), which shifts the deterministic outcome for a given seed. The duplicated slate-consume logic in `act.ts` is gone.

## Now has a brief (was an open question)

These were design/perf questions; they now have task specs in [../briefs/](../briefs/) and will move to `done/` when implemented:

- **Tilemap / chunked tile layer on Canvas2D** → [engine/todo/07-chunked-tile-layer.md](../briefs/engine/todo/07-chunked-tile-layer.md). Still profile-gated — the brief's first step is measuring whether the per-tile backdrop is actually a hot spot before writing any rendering code.
- **Decision rationale trace (BDI "why")** → [game/todo/19-decision-trace.md](../briefs/game/todo/19-decision-trace.md). The Brief 11 focus mode shipped, which was the stated trigger to revisit this; the brief surfaces the *lightweight* current/next-intention + reason, not a full reasoning log.
- **Asymmetric / fifth personality** → [game/todo/23-fifth-personality-or-shock.md](../briefs/game/todo/23-fifth-personality-or-shock.md). Still **design-gated** — the brief explicitly says don't start unless runs feel stale, and offers a mid-game shock as an alternative variance injector. The "no balance work, moments matter" stance is preserved (the brief targets *moments*, not balance).

## Design questions (no brief yet)

- **Sim → Web Worker move.** [decisions.md](decisions.md) keeps the sim "pure so it can move to a Web Worker later." No trigger to do this yet — the sim is single-threaded and comfortable at the current scale. Would become relevant if the 50–100 agent ceiling is pushed hard and the main thread can't keep 60fps render + 20Hz sim.
