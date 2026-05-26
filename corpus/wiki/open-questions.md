# Open Questions & Gaps

Live list of unresolved work and design questions. Items move out of here when a brief is written in [../briefs/](../briefs/) and back in (or get deleted) when answered.

## Code gaps (have a clear "next step")

- **Shop daily slate is broadcast but not consumed.** [Brief 06](../briefs/game/done/06-spatial-market.md) shipped `ShopSlateSystem` generating offers each day, but [ShopkeeperSystem](../../packages/farm-valley/src/systems/shopkeeper.ts) still handles BUY/SELL with fixed prices — it doesn't decrement `remaining` or reject sold-out slots. Next step: rewrite BUY/SELL handlers to look up the matching slate offer and reject when `remaining === 0`.
- **MEET messages reach farmers but no personality acts on them.** [EncounterSystem](../../packages/farm-valley/src/systems/encounter.ts) emits pairs; what's missing is the personality-side decision logic to produce `offer-seed` / `accept-seed-offer` intents in response. Hannah's encounter-initiated buying was the canonical use case in the brief.
- **Renderer doesn't know about regions yet.** The world is now a 40×40 tile grid with 5 regions + roads, but [canvas2d.ts](../../packages/engine/src/render/canvas2d.ts) draws against the old coordinate system. The game runs but the visual is stale relative to the logic. Next step: teach the renderer to draw region tiles, roads, and update camera / world-units constants.
- **Aggressive end-of-sim liquidation.** Deferred in [01-personalities](../briefs/game/done/01-personalities.md). Still unblocked.
- **Trust score updates** between farmers — natural fit for the EncounterSystem (successful/failed trades adjust trust), but explicitly out of scope in Brief 06.

## Design questions (no clear answer yet)

- **Tilemap layer on Canvas2D?** The original [01-tilemap](../briefs/engine/superseded/01-tilemap.md) brief was WebGPU. Background is currently drawn ad-hoc. Open question: do we need a real chunked tile layer? Only relevant if/when perf demands it.
- **Sim → Web Worker move.** [decisions.md](decisions.md) keeps the sim "pure so it can move to a Web Worker later." No trigger to do this yet.
