# Full-repo review findings — 2026-07-02

status: **CLOSED 2026-07-11 — every finding executed, all four execution briefs done.**
Items 1–6, 8–27, 36–40 → [brief 97](../../briefs/game/done/97-review-fix-wave.md) (closed
2026-07-10, `c8ee284`); item 7 → [brief 98](../../briefs/game/done/98-farm-market-wall-wire-or-remove.md)
(done 2026-07-11, `490b892`); items 28–34 → [brief 99](../../briefs/game/done/99-p2-debt-cleanup-batch.md)
(done 2026-07-11); item 35 → [brief 110](../../briefs/game/done/110-citadel-client-world-size.md)
(done 2026-07-10, `0fd66c0`, via the [brief 108](../../briefs/game/done/108-citadel-live-mp-verification.md)
live pass). The briefs' closeouts own the outcomes; this triage doc is a historical record.

kind: review-findings (triage doc — split into briefs/fix batches as prioritized)

Six parallel read-only review passes (engine core, farm sim-core, farm client+server,
citadel sim-core, citadel client, corpus lint), findings adversarially spot-verified by the
controller against source before filing. Items marked **[verified]** were re-read at the
cited lines by the controller; others are single-reviewer findings with the stated
confidence. Nothing here has been fixed yet.

## P0 — server robustness (@farm/server): hostile/malformed input can take the process down

1. **[verified] Unclamped `speed` multiplier = one-message DoS.**
   [sim-host.ts:86-91](../../games/farm/server/src/sim-host.ts) accepts any finite
   `multiplier >= 1`; the tick loop then runs that many synchronous `runOneTick()` calls per
   interval. `{"type":"speed","multiplier":1e9}` stalls the whole single-threaded process
   (all runs, all sockets). Fix: clamp to a small max (UI sends 1/2/4; clamp ≤ 8).
2. **[verified] Repeated `init` on one socket leaks permanently-ticking SimHosts.**
   [run-registry.ts](../../games/farm/server/src/run-registry.ts): `attachInit` never
   detaches the socket from prior runs; `handleControl`/`detach` stop at the FIRST run
   containing the socket (`return` inside the loop). A socket that inits N distinct
   run-keys leaves N−1 runs with a phantom member forever → reap timer never fires, sim
   ticks forever. Fix: detach-from-all before attach (or reject re-init); consider a cap on
   `runs.size`.
3. **Unvalidated `tickRateHz`** ([sim-host.ts:276-277](../../games/farm/server/src/sim-host.ts)):
   `0`/negative/NaN → `setInterval` delay clamps to 1ms → CPU-hog run. Clamp 1–60.
4. **`void this.start(msg)` has no try/catch** ([sim-host.ts:108-110](../../games/farm/server/src/sim-host.ts)) →
   any throw after the first await is an unhandled rejection = process exit (Node 15+). Wrap
   like `runOneTick`; add a top-level `unhandledRejection` logger in index.ts.
5. **No `maxPayload` on the WebSocketServer** ([index.ts:40-43](../../games/farm/server/src/index.ts)) —
   default 100 MiB frames get `JSON.parse`d. One-line hardening (`maxPayload: 64*1024`).
6. Minor: `swap-slots` NaN passes the bounds guard vacuously ([sim-host.ts:168-178](../../games/farm/server/src/sim-host.ts));
   self-contained (own inventory only).

## P0 — Farm sim correctness

7. **[verified] Market-wall trade loop is dead end-to-end.**
   `BUY_REQUEST` is forwarded to the seller's inbox
   ([market.ts:132-155](../../games/farm/sim-core/src/systems/economy/market.ts)) but no
   system consumes it (PerceiveSystem's switch doesn't, then clears the inbox);
   `TRADE_COMPLETED` is never sent anywhere in production code; the `marketOffers` belief
   the three buying personalities gate on is **written only in test fixtures**
   (aggressive.ts:176, hoarder.ts:127, opportunist.ts:127); `"sell-from-wall"` has an AP
   cost but no ActSystem case; `handlePostOffer` never escrows stock (latent oversell);
   `offersById` grows for the whole run. Farmers pay AP to post/read offers into a void.
   **Needs a product decision: wire the loop or remove the intents/AP costs.**
8. **[verified] `handleSellShopkeeper` has no village gate.**
   [commerce.ts:71-99](../../games/farm/sim-core/src/systems/act/handlers/commerce.ts)
   mutates crops/gold immediately, while siblings `handleSellProduct`/`handleSellFruit`
   both guard `currentRegion !== "village"`. Deliberation queues travel+sell in the same
   tick, so crops sell instantly from the home farm — the travel cost the parallel paths
   enforce is bypassed. One-line fix. ⚠️ baseline will move.
9. **[verified] Crop-quality `growthDays` self-cancels.**
   [harvest.ts:81](../../games/farm/sim-core/src/systems/farming/harvest.ts) passes
   `currentDay - (readyAtDay - (daysGrowing|0))`, and harvest fires on the first day
   `currentDay >= readyAtDay`, so the expression collapses to `floor(daysGrowing)` and
   `growthScore = daysGrowing/floor(daysGrowing) ≈ 1.0` always. Net effect:
   `OUT_OF_SEASON_GROWTH_RATE` and the farming-skill growth multiplier affect neither
   harvest timing (readyAtDay is a fixed calendar deadline) nor quality. Likely fix: pass
   `GROWTH_DAYS[crop]`. ⚠️ baseline will move.
10. **[verified] Carpenter commission leaks wood on failed delivery.**
    [carpenter.ts:82](../../games/farm/sim-core/src/systems/economy/carpenter.ts) debits
    wood at accept; the `no-region`/`no-free-tile` failure branches in `deliver()` reply
    `ok:false` without refund. Fix: refund in both branches.
11. **Broadcast inboxes on non-farmer entities are never cleared.**
    InboxDispatch pushes every broadcast (incl. one TRAVEL.ARRIVED per farmer arrival) into
    every inbox; weatherStation/harborBoard/noticeBoard never truncate, shopkeeper re-keeps
    AUCTION_RESULT forever — and ~10 systems re-scan those arrays every tick. O(ticks ×
    accumulated messages) growth + memory leak in the long-lived server. Fix: drain after
    read (the market.ts/tavern.ts pattern) or an end-of-tick clear for non-farmer inboxes.

## P0 — Citadel sim correctness

12. **Ghost-worker leak: villagers are never released when their workplace dies or is
    suppressed.** No production code path resets a villager to `fsm:"idle"` when its
    workplace goes away (only villager-system.ts:199's own transition exists;
    grep-confirmed no `releaseWorkers` anywhere). Five sites zero `workerCount` or despawn
    buildings without touching assigned villagers:
    [fire-system.ts:228,266](../../games/citadel/sim-core/src/systems/fire-system.ts)
    (burning + neighbour suppression — **[verified]**, and NOT cozy-gated),
    fire `_destroyBuilding`, siege `applyRaidDamage`, army `destroyBuilding`, and the
    player `demolish` handler in sim-bootstrap.ts. The villager loops
    walkToWork→work→haul forever contributing nothing while ImmigrationSystem spawns
    replacements. Cozy mode makes it worse: repeated smoulder-events mint a zombie per
    fire. Fix: (a) fire suppression should set an ephemeral `suppressed` flag consumed by
    ProductionSystem instead of corrupting `workerCount`; (b) a shared
    `releaseWorkersAt(footprint)` called from all real removal sites.
13. **MP pause/speed is optimistic client state with no authoritative resync.** Server
    ignores non-host `pause`/`resume`/`speed` silently
    ([sim-host.ts:180-193](../../games/citadel/server/src/sim-host.ts)); the snapshot's
    `speed` field is never read client-side and there is no `paused` field — a non-host
    peer's HUD lies permanently ([main.ts:854-905](../../games/citadel/client/src/main.ts)).
    Same root cause: **load-save** sets worker `paused=false` but the client keeps its
    local `paused=true` → interpolation pinned to 1 (entities snap tile-to-tile) + wrong
    button label. Fix: make snapshot carry authoritative `paused`+`speed`, client rederives
    both from it; surface host identity to disable room controls for peers.

## P1 — client/render fixes

14. **[verified] Farm "juice" goes permanently dead after ~30 events.**
    [juice.ts:218-225](../../games/farm/client/src/main/juice.ts) diffs new events by
    `events.length`, but the snapshot event feed is a capped 30-entry tail window
    (EVENT_SNAPSHOT_CAP, [events.ts:14](../../games/farm/sim-core/src/snapshot-builder/events.ts)).
    Once length plateaus, shake/hitstop/gold-popups never fire again — including the
    late-game drama beats the system exists for. Fix: diff by event tick/key high-water
    mark, not length.
15. **Hitstop halved + double interpolation pass:** `renderFrame` calls
    `getInterpolatedSprites()` a second time for hover
    ([render-loop.ts:242 vs :780](../../games/farm/client/src/main/render-loop.ts)), and
    each call decrements `hitstopFramesLeft`. Reuse the frame's array.
16. **Viewport cull pops large sprites:** both renderers cull on the anchor point with a
    flat 32px margin ([canvas2d/renderer.ts:27](../../engine/core/src/render/canvas2d/renderer.ts),
    [webgpu/renderer.ts:26](../../engine/core/src/render/webgpu/renderer.ts)), but keep
    (~96px) / volcano (96×96) half-extents reach ~48px → edge-of-screen pop-in/out.
    Fix: include sprite half-extents in the test.
17. **Per-frame `createBindGroup` in TintPass/CloudShadowPass/WeatherPass**
    (tint-pass.ts:97-101, cloud-shadow-pass.ts:124-128, weather-pass.ts:171-175) — the
    bind group references a stable buffer; create once like StaticLayerPass/WaterPass do.
18. **Boat hull never interpolates** while a farmer is aboard:
    [sprites.ts:114-129](../../games/farm/sim-core/src/snapshot-builder/sprites.ts) pushes
    it with `id:null` + `interpolate:true`, and the client gate requires a non-null id →
    hull snaps per tick under a smoothly-lerping farmer. Give it the farmer's id or set
    `interpolate:false` deliberately.
19. **Connection loss is a dead hook:** `onConnectionLost` exists and fires in
    [client.ts:117-124](../../games/farm/client/src/worker/sim-client/client.ts) but no
    caller registers it — on a WS drop the game freezes silently with no UI. Wire a
    reconnect/error banner or remove.
20. **Citadel toast dedup by string** ([toast.ts:125-135](../../games/citadel/client/src/ui/toast.ts))
    silently drops the second of two identical same-day events. Track by index/sequence.
21. **Citadel trade `offerIndex` race** across the daily offer re-roll
    ([inspect-panel.ts:279-306](../../games/citadel/client/src/ui/inspect-panel.ts)) — send
    offer content, not a bare index.
22. **Ghost-occlusion pass doesn't batch** consecutive same-atlas draws
    ([webgpu/renderer.ts:436-454](../../engine/core/src/render/webgpu/renderer.ts)) —
    coalesce like the main pass. Low cost, free fix.

## P1 — Farm agent/BDI fixes (all move the baseline ⚠️)

23. **[verified] `deliberateResourceZoneVisit` gate is kind-blind:**
    [gather.ts:138-160](../../games/farm/sim-core/src/agents/watering/gather.ts) guards on
    total feature count, but call sites pass mixed-kind `features.length` — a farm with 1
    bush and 0 trees/stones never visits forest/quarry zones; aggressive/hoarder/
    opportunist can be locked out of wood+stone all run. Pass kind-filtered counts.
24. **[verified] Aggressive endgame branch returns before the priority sort**
    ([aggressive.ts:98-122](../../games/farm/sim-core/src/agents/aggressive.ts)) — queue
    executes in push order, so same-tick tool buys evaluate before the liquidation sells
    that fund them; also skips `deliberateBean` (golden-bean resale exactly when wealth is
    scored) and `deliberateSleep` (half AP on the final days). Sort before returning +
    include bean/sleep.
25. **Opportunist `fallbackCrop` ladder isn't cost-ordered**
    ([opportunist.ts:49-56](../../games/farm/sim-core/src/agents/opportunist.ts)) — tomato
    (10g) tried before carrot (6g)/radish (5g). Sort by SEED_COST ascending.
26. **`deliberatePortHop` hijacks any aboard farmer** into an ungated port trip
    ([port.ts:26-46](../../games/farm/sim-core/src/agents/watering/port.ts)) — continue
    only an existing same-day trip.
27. **Coral casts counted at queue-time not execution-time**
    ([coral.ts:38-42](../../games/farm/sim-core/src/agents/watering/coral.ts)) — count in
    the ActSystem handler.

## P2 — lower priority / debt

28. Crop-quality bookkeeping drift: `moveNormalQuality` + mill processing decrement `crops`
    but not `cropQuality` in lockstep → phantom quality tiers (festival wins, sale
    mispricing). Centralize a `debitCrop()`.
29. Harbor `deliveryDay = tick/20` hardcoded ([harbor/system.ts:174](../../games/farm/sim-core/src/systems/harbor/system.ts));
    inject ticksPerDay. Cosmetic today.
30. `deliver-contract` intent is a paid no-op (empty handler, 3 AP; HarborSystem
    auto-delivers anyway). CNP contract-net is unwired dead code with landmines if ever
    wired (module-global registry survives bootstrapSim, tasks never complete). Wire or
    delete both.
31. ShopSlateSystem uses the raw top-level Rng instead of a fork ("shop-slate") —
    reorder-fragile. Auction settlement retries forever if the winner can't pay (no
    escrow/runner-up). Festival tie draws rng then ignores it. `EventFeedSystem.seen` and
    `settledAuctions` never evicted (memory-only). `deliberateDeliverContract`'s
    `hasGoods` ternary is dead code (harbor.ts:107).
32. Snapshot-builder module-level state: `buildEvents` returns a shared scratch array;
    `defaultSpriteState` singleton bleeds across runs when no per-run state is passed.
    Production-safe today; fix for test/multi-run hygiene.
33. Citadel `ProductionSystem` O(villagers × buildings) scan every tick
    ([production.ts:124-132,274-282](../../games/citadel/sim-core/src/systems/production.ts)) —
    build one tileToBuilding map per tick (pattern already in sim-bootstrap's getBuildings).
    FireSystem's daily `_hasFirebreak` inner scans are O(n²)-ish once/day — precompute if
    fires+buildings grow.
34. Citadel `extendTrail` rebuilds a Set from the whole trail per mousemove
    ([placement-state.ts:83-117](../../games/citadel/client/src/ui/placement-state.ts)).
    `boxBuilding` composite ignores the documented `noDoor` contract (stale comment or add
    the option). Duplicate `device.lost` handlers log twice. Canvas2D tint fallback is
    5 ops/sprite vs free WebGPU tint (fallback-only, note for parity).
35. MP render-window mixes iso and axis-aligned space
    ([window-controller.ts:120-134](../../games/citadel/client/src/render/window-controller.ts)) —
    already flagged "deferred" in-code, but the drift is worse than the comment implies on
    the large MP world.
    **→ [brief 110](../briefs/game/done/110-citadel-client-world-size.md).** The 2026-07-10
    brief-108 live pass found this is real but **latent**: the client is hardcoded to 96×96, so
    `shouldWindow` is always false and the windowed path never executes. The drift can only appear
    once the client adopts the server's 256×256 world — so iso-correct windowing is a sub-task of
    that fix, not a standalone cleanup.

## Corpus fixes (separate mechanical pass)

36. **decisions.md still says "Canvas2D, not WebGPU"** — formally revisited long ago (both
    games are WebGPU-first); the single most misleading corpus line. Update.
37. **status.md**: bump the stale header date (says 2026-06-28-era); move the
    "ALL PHASES SHIPPED (A–I)" banner above the six stale "Phases X done; Y open" entries
    (reading order currently presents five superseded states first). Also stale: "settings
    modal, minimap, occupancy badges still DOM" — reviewer confirmed all three are already
    in-canvas.
38. **Stale `packages/*` link sweep** (~190 across wiki/): performance.md (52),
    player-and-interaction.md (~76 in its lower half), world-generation (9),
    asset-pipeline (9 — atlas recipes now live in `games/farm/atlas-recipes/`, also absent
    from root CLAUDE.md's package table), economy (8 — ap.ts moved to
    `systems/economy/ap.ts`), animation (8), shader-ideas (15), overview (3), decisions (4),
    status (3), system-ordering (1), architecture (1). Plus `todos/` → `todos/closed/`
    link fixes in citadel-overview (6), citadel-asset-critique (5), road-builder-ux (2),
    art-style (1). Mechanical mapping: engine→engine/core, farm-valley→games/farm/client,
    sim-core→games/farm/sim-core, server→games/farm/server, wasm-modules→engine/wasm-modules.
39. **system-ordering.md** missing three registered systems: AggressionSystem, ChaseSystem,
    CombatSystem (2026-06-13 combat work, never folded in).
40. **todos/ hygiene**: close `2026-06-28-citadel-cozy-pivot-BUILD-ORDER.md` (all phases
    ✅ SHIPPED in its own banners) + `2026-06-12-00-BUILD-ORDER.md` (all items done);
    annotate/close `2026-07-01-citadel-phaseA-playtest-verification.md` (its P2 section is
    resolved); decide on `2026-06-18-citadel-00-BUILD-ORDER.md` (items 21/22 residual).

## Verified clean (for the record)

No `Math.random`/`Date.now` in either sim-core; RNG fork discipline sound in both games
(all forks unconditional at construction); ECS query-cache/pooled iteration sound; world-gen
tie-breaks explicit; Citadel save/load round-trip complete incl. the new cozy flags;
Farm scheduler registration matches system-ordering.md's bands exactly; EncounterTrade
accounting sound; Citadel buffer-throttle math edge-cases guarded; worker message ordering
(both games) race-free; index.md has zero broken links and no orphan wiki pages.
