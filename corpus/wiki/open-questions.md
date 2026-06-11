# Open Questions & Gaps

Live list of what's **genuinely unresolved**. Shipped/resolved items are deleted from here — their history lives in [status.md](status.md) + [log.md](../log.md). Verify any code ref before acting (paths drift).

## Open

### FPS regression — canvas raster (Tier 0)
The live game runs ~15–30 fps where the baseline was ~60. **Profiled 2026-06-11** ([performance.md](performance.md) Tier 0): JS frame work is only ~5–7 ms, but the true render rate is raster-bound — at the **default zoom the camera spans the whole 160×160 world**, so the viewport cull is a no-op and the full static blit + two-pass bilinear water fill + ~470 sprites raster every frame. The relmatrix DOM-thrash fix shipped (real but not the headless straw). **Blocked on a real-GPU `?profile` reading** (headless = SwiftShader CPU raster, can't validate faithfully): read overlay `fps` + `frame`; if `frame` ~5–7 ms but fps still low → it's GPU raster, do fix **#4** (clamp default zoom / cull / clip the static blit / drop the 2nd water pass at zoom-out).

### AI fishing broken — stale cast tiles (found 2026-06-11) → **briefed: [game/todo/80](../briefs/game/todo/80-fishing-cast-tiles-stale.md)**
`FISHING_CAST_TILES = [(40,71),(22,71)]` ([agents/watering/shared.ts](../../packages/sim-core/src/agents/watering/shared.ts)) are **pre-reorg**; the isles moved to 75–82 / 59–66 × 105–112, so those tiles are off-isle → `deliberateFishing` travels to non-isle ground and the `fish` precondition never passes → **AI fishing no longer fires** (Pip unaffected — it checks `isFishingIsle` dynamically). Exact class of brief 73's tavern/festival ocean-tile fix, which **missed this constant**. Brief 80 derives the cast tiles from the isle bounds (self-validating) + adds the class-level guard test whose absence let this through. Baseline-mover (re-verify like 73; awaiting sign-off). Detail in [player-and-interaction.md](player-and-interaction.md) → Fishing.

### WASM pathfinder `unreachable` allocator fault (engine)
`WasmHeap.alloc` intermittently throws `RuntimeError: unreachable` under churn, caught per-intent in [TravelSystem](../../packages/sim-core/src/systems/travel/system.ts). Deferred as **brief 73 task 4** (the gather-guard + connectivity-hole tasks 1–3/5 shipped 2026-06-11; the allocator was out of scope). Needs its own engine brief.

### Live-drama spare capacity (deliberately not pursued)
Harbor contracts (46) — mostly only the hoarder reaches the commit gate. Skills (43) — lopsided to farming. Festival (45) — physical podium gathering thin. Early-game peer trades — gated by **encounter cadence + seller stock, NOT gold**: brief [70](../briefs/game/done/70-raise-starting-gold-peer-trade-liquidity.md) lifted the cash constraint (zero `would-breach-reserve` declines) but the 15-day-close target stayed unmet because the binding constraint is `no-stock` + farmers barely meeting early. The lever (if it matters) is encounter frequency / early surplus, not liquidity.

### Deploy automation unproven on real hardware
pm2 + Caddy WS-reverse-proxy in `deploy/deploy.ts` is **dry-run-verified only**; a real VPS execution is still pending.

## Settled premises — don't re-litigate

- **Leader-runaway / peer-interaction.** The old "one farmer runs away wire-to-wire, field stays flat, peer layer inert" story is **STALE**. The current 21-farmer radial field self-distributes (post-day-20 lead crossings on all 3 standard seeds); peer trades close over harvested-crop surplus after brief 59 fixed the price-reference bug (`CROP_SELL_PRICE` vs `SEED_COST`) + added the `OFFER_CROP` path. Re-probe before citing any old runaway numbers.
- **Pathfinder gotcha.** A headless `bootstrapSim` check **must** pass a `pathfinder`, or `TravelSystem` is omitted and every travel-gated action silently no-ops (false "dormant"). JS and WASM pathfinders are **not route-equivalent** — use WASM to match the determinism baseline. See [decisions.md](decisions.md).
- **Not worth it (researched).** WebTransport/WebRTC for a buffered spectator game; WebGL/WebGPU at ~300 sprites; archetype/SoA ECS at tens of entities; OffscreenCanvas-in-worker (the client/server split already freed the main thread); pinning farmer entity IDs (determinism risk is theoretical at 21 entities, `CHECK_DETERMINISM ×3` passes).

## Resolved
History of resolved gaps (peer-interaction, leader-runaway, client/server split, auctions, day/night + long-days, atlas split, the travel-no-path diagnosis, …) lives in [log.md](../log.md) and [status.md](status.md). This page tracks only what's still open.
