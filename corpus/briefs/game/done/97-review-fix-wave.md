# Brief 97 — Review fix wave (P0/P1 from the 2026-07-02 full-repo review)

status: **done** — wave 1 landed 2026-07-09 (`976f032`); wave 2 (chunks 3, 5, 8) landed 2026-07-10 (`c8ee284`). All 10 chunks complete.
source: [todos/2026-07-02-full-repo-review-findings.md](../../../todos/2026-07-02-full-repo-review-findings.md) (commit `c2cc78d`) — item numbers below refer to that doc; read it first, it carries the file:line detail and failure scenarios for every item.
execute via: `plan-split-dispatch` (controller opus, chunks classified below). The chunk plan + wave order was already drawn up and approved — reuse it as-is unless the code has drifted.

> **Closed 2026-07-10.** All ten chunks landed. Wave 1 (chunks 1, 2, 4, 6, 7, 9 + 10 inline)
> in `976f032`; wave 2 (chunks 3, 5, 8) in `c8ee284`. Wave 1 **moved the Farm baseline by
> design** (sell gate + quality formula); wave 2 moved **neither** game's baseline — verified
> byte-identical to `main` on three seeds per game.
>
> Two of this brief's own instructions were **wrong**, and the code won both times:
> - Item 18 told chunk 6 to give the boat hull `id: entity.id`. That collided with the farmer's
>   id across three first-match, id-keyed client consumers. The real constraint is *non-null and
>   non-colliding*, met with a disjoint negative-id namespace (`-entity.id`; ECS ids start at 1).
> - Item 20 said to "track consumed events by index/sequence", but Citadel's `recentEvents` is a
>   bare `string[]` fed by a capped rolling window — there was no sequence to track. A monotonic
>   `eventsSeq` had to be added to sim state and the snapshot first.
>
> Review across both waves (6 scoped finders, 2 fix agents) found **5 real bugs in wave 1** and
> **0 functional bugs in wave 2** — but caught in wave 2 that the toast regression test *passed on
> the unfixed code* (with `prevSeq=1` the old string-match anchors on a unique event and splits
> correctly; the discriminating case is `prevSeq=2`, where the last-shown event is itself the
> duplicate), and that the Farm inbox test guarded inbox *size* when the failure mode is message
> *visibility* — a clear registered too early keeps inboxes bounded while silently starving the
> band-3 snoopers. Both guards were rewritten and proven to go red against the broken code.
>
> A regression introduced by the wave-2 fix pass and caught before closeout: gating interpolation
> ingest on `tick > lastIngestedTick` froze every entity after a solo load-save, because
> `load-save` rewinds `tick` to the save point. The predicate must be `!==`. Verified live —
> loading a tick-1252 save at day 284 walks the clock back to day 68 and rendering continues.

## Scope

**In:** findings items 1–6, 8–13, 14–22, 23–27, 36–40.
**Out (deliberately):** item 7 (market-wall trade loop — dead end-to-end; needs its own wire-it-or-remove-it design brief), items 28–35 (P2 debt).

## Gates (whole wave)

- `npm run typecheck` + `npm run test` green after each wave of chunks.
- Farm: `CHECK_DETERMINISM=1` MATCH ×3 (seeds 0xc0ffee/1/42) at the end.
- Citadel: determinism MATCH ×3 (the headless `npm run sim:citadel` harness, seeds as in status.md precedent).
- Chunks 2 and 9 **move the Farm baseline by design** (sell gate, quality formula, agent behavior) — reproducibility is the contract, not equality to old outputs; note the move in log.md.
- Chunk 3 must be **behavior-preserving**: prove with a multi-seed `EXPORT=json` before/after diff, not just the determinism check.
- Render/transport chunks (1, 5, 6, 7, 8): sim untouched → fast 3-day/3-seed diff to confirm.
- UI-visible changes (5, 6, 8): real-browser pass before closeout (playtest-citadel for Citadel; `npm run dev` for Farm) — unit tests aren't the acceptance bar.

## Chunks (classification approved)

### Wave 1 — parallel-safe: {1, 2, 4, 6, 7, 9, 10}

**Chunk 1 [junior] — Farm server hardening** (items 1–6)
- Files: `games/farm/server/src/sim-host.ts`, `index.ts`, `run-registry.ts` + their tests.
- Clamp `speed` multiplier to 1..8 (UI sends 1/2/4). Clamp `tickRateHz` to 1..60 before `msPerTick`. In `attachInit`, detach the socket from any run it's already in before attaching (reuse `detach()`; prevents the multi-run leak — `detach`/`handleControl` stop at the first matching run today). Wrap `start()`'s body in try/catch mirroring `runOneTick`; add a top-level `unhandledRejection`/`uncaughtException` logger in index.ts. `maxPayload: 64 * 1024` on the WebSocketServer. `Number.isInteger` guard on `swap-slots` a/b (NaN passes the current bounds check vacuously).
- Tests: extend `run-registry.test.ts` with a double-init case asserting the first run reaps; clamp cases in `sim-host.test.ts`.

**Chunk 2 [junior] — Farm sim guards** (items 8–10) ⚠️ baseline moves
- Files: `games/farm/sim-core/src/systems/act/handlers/commerce.ts`, `systems/farming/harvest.ts`, `systems/economy/carpenter.ts` + tests. Lane: owns these three files; do not touch `agents/*` (chunk 9's lane).
- `handleSellShopkeeper`: add the `currentRegion !== "village"` guard its siblings `handleSellProduct`/`handleSellFruit` already have (commerce.ts:71–99).
- `harvest.ts:81`: the `growthDays` argument self-cancels (`currentDay - (readyAtDay - (daysGrowing|0))` collapses to `floor(daysGrowing)` → growthScore ≈ 1.0 always). Pass `GROWTH_DAYS[crop]` so season/skill growth multipliers actually feed quality.
- `carpenter.ts`: refund `recipe.woodCost` in both `deliver()` failure branches (`no-region`, `no-free-tile`); wood is debited at accept (line 82) and never returned.
- Tests: red-before-fix cases for each (sell-from-farm no-ops; out-of-season crop gets lower quality score; failed delivery refunds).

**Chunk 4 [senior] — Citadel ghost workers** (item 12) ⚠️ baseline may move
- Files: `games/citadel/sim-core/src/systems/fire-system.ts`, `production.ts`, `siege-resolution.ts`, `army.ts`, `sim-state.ts`, `sim-bootstrap.ts` (demolish handler), `villager-system.ts` + new tests.
- Problem: no code path releases a villager when its workplace dies. Fire (`fire-system.ts:228,266`) writes `rs.workerCount = 0` every tick a fire burns/suppresses (NOT cozy-gated) without touching assigned villagers; `_destroyBuilding`, `applyRaidDamage`, army `destroyBuilding`, and the player `demolish` handler despawn buildings the same way. Villager loops walkToWork→work→haul forever; ImmigrationSystem over-spawns against the phantom vacancy.
- Fix (two halves): (a) fire suppression sets an ephemeral `suppressed` flag (or multiplier) consumed by ProductionSystem instead of corrupting `workerCount` — production resumes automatically when the flag clears, villager untouched; (b) shared `releaseWorkersAt(state, x, y, w, h)` (mirror `removeOneVillager`'s slot-release in `sim-state.ts:320–351`) that resets villagers whose `workX/workY` fall in the footprint to `fsm:"idle"` (drop stale `carryGood`/store target), called from all four real removal sites.
- Tests: demolish-occupied-workplace → villager re-idles and reassigns; fire smoulder → production dips and recovers with the SAME villager (no immigration replacement); sharp-mode (`cozyThreats:false`) destruction path releases workers.

**Chunk 6 [junior] — Farm client render fixes** (items 14, 15, 18, 19)
- Files: `games/farm/client/src/main/juice.ts`, `render-loop.ts`, `worker/sim-client/client.ts` (wiring only), `games/farm/sim-core/src/snapshot-builder/{events,sprites}.ts` + types, tests.
- Juice: diff events by identity, not `events.length` — the feed is a capped 30-entry tail window (`EVENT_SNAPSHOT_CAP`), so length plateaus and shake/hitstop/popups go permanently dead. Thread the event's `tick` (or a seq) into `SnapshotEvent`; track a high-water mark.
- `render-loop.ts:780`: pass the already-computed `interpolatedSprites` (line ~242) into `hoveredSprite` instead of calling `getInterpolatedSprites()` a second time — each call decrements `hitstopFramesLeft`, halving every hitstop.
- `sprites.ts:114–129`: the boat hull pushes `id:null` + `interpolate:true`; the client gate needs a non-null id, so the hull snaps per-tick under a lerping farmer. Give it the farmer's entity id.
- Wire `onConnectionLost` (dead hook — `client.ts:117–124` fires it, nobody registers) to a visible "connection lost" overlay/banner; no auto-reconnect needed this wave.

**Chunk 7 [junior] — Engine render fixes** (items 16, 17, 22)
- Files: `engine/core/src/render/canvas2d/renderer.ts`, `webgpu/renderer.ts`, `webgpu/{tint-pass,cloud-shadow-pass,weather-pass}.ts`.
- Cull: both `push()` implementations test only the anchor point against a flat 32px margin; keep (~96px) and volcano (96×96) half-extents reach ~48px → edge pop. Include sprite half-width/height in the test.
- Bind groups: the three passes call `device.createBindGroup` every `draw()`; the group references a stable uniform buffer. Create once in init like `StaticLayerPass`/`WaterPass` (in-repo pattern).
- Ghost pass (`webgpu/renderer.ts:436–454`): coalesce contiguous same-atlas instances into one draw group, mirroring the main-pass loop directly above it.

**Chunk 9 [junior] — Farm agent fixes** (items 23–27) ⚠️ baseline moves
- Files: `games/farm/sim-core/src/agents/**` + the coral cast act handler. Lane: owns `agents/*`; do not touch chunk 2's three files.
- `deliberateResourceZoneVisit` (`agents/watering/gather.ts:138–160`): gate is kind-blind — call sites (aggressive:92, hoarder:74, opportunist:105) pass mixed-kind `features.length`, so 1 bush suppresses forest AND quarry trips. Pass kind-filtered counts (or filter internally by `preferKind`).
- `aggressive.ts:98–122`: endgame liquidation branch returns before the priority sort (queue executes in push order → tool buys evaluate before the sells that fund them) and skips `deliberateBean` (golden-bean resale exactly when wealth is scored) + `deliberateSleep` (half AP next day). Sort before returning; include bean + sleep.
- `opportunist.ts:49–56`: `fallbackCrop` ladder isn't SEED_COST-ordered (tomato 10g before carrot 6g/radish 5g). Order ascending.
- `watering/port.ts:26–46`: aboard branch creates unplanned trips before the day/AP gates. Continue only an existing same-day trip; otherwise return to shore.
- `watering/coral.ts:38–42`: casts counted at queue-time; a re-deliberation wipes the queue and the casts are lost. Count in the ActSystem handler at execution.
- Tests: red-before-fix per item; extend `aggressive.test.ts`'s sortedness test to the `daysRemaining <= 2` branch.

**Chunk 10 [junior] — Corpus sweep** (items 36–40)
- decisions.md: replace the "Canvas2D, not WebGPU" entry (formally revisited — both games WebGPU-first; Canvas2dRenderer kept for tests/fallback).
- status.md: bump the stale header date; move the "ALL PHASES SHIPPED (A–I)" banner above the six per-phase entries; fix the stale "settings modal/minimap/occupancy badges still DOM" claim (all three are already in-canvas).
- Stale-path sweep (~190 links) with the mapping: `packages/engine`→`engine/core`, `packages/farm-valley`→`games/farm/client`, `packages/sim-core`→`games/farm/sim-core`, `packages/server`→`games/farm/server`, `packages/wasm-modules`→`engine/wasm-modules`, `tools/atlas-builder/src/recipes`→`games/farm/atlas-recipes/src`; `ap.ts` moved to `systems/economy/ap.ts`. Pages + counts in findings item 38. Also `todos/`→`todos/closed/` fixes in the four citadel wiki pages. Verify every rewritten link resolves; don't trust line anchors.
- system-ordering.md: add AggressionSystem (Deliberation band), ChaseSystem (Movement, before Travel), CombatSystem (Ambient & close) — registered 2026-06-13, never folded in. Verify positions against `sim-bootstrap.ts` first.
- todos hygiene: close `2026-06-28-citadel-cozy-pivot-BUILD-ORDER.md` + `2026-06-12-00-BUILD-ORDER.md`; annotate `2026-07-01-citadel-phaseA-playtest-verification.md` (P2 resolved — pointer to closed phaseEF-playtest); decide `2026-06-18-citadel-00-BUILD-ORDER.md` (items 21/22 residual → note or fresh follow-up todo).
- Also add `@farm/atlas-recipes` to root CLAUDE.md's package table (absent).

### Wave 2 — after wave 1: {3, 5}

**Chunk 3 [senior] — Farm non-farmer inbox clearing** (item 11) — run AFTER chunks 2+9 land so its before/after diff has a settled base
- Files: the board/station systems (`weather`, `harbor`, `notice-board`, `shopkeeper`) and/or a late-band clear system in `sim-bootstrap.ts`; read [wiki/system-ordering.md](../../../wiki/system-ordering.md) first.
- Problem: InboxDispatch pushes every broadcast (incl. one TRAVEL.ARRIVED per farmer arrival, 50–200/day) into every entity with an inbox; weatherStation/harborBoard/noticeBoard never truncate; shopkeeper deliberately re-keeps AUCTION_RESULT forever; ~10 systems re-scan these arrays every tick → O(ticks × accumulated messages) + server memory leak.
- Constraints: several systems re-read the station inboxes each tick and are guarded by day/tick — clearing changes what they see, so this must be proven behavior-preserving with multi-seed `EXPORT=json` diffs (the determinism check alone only proves reproducibility). The shopkeeper's AUCTION_RESULT retention is a live retry mechanism (settlement waits for winner funds) — drop only via a settled-auctions check, never unconditionally. Drain-after-read (the `market.ts:38–39` / `tavern.ts:31` pattern) is the model; a clear must sit after the LAST consumer in the tick per the scheduler bands.
- If the diff moves: stop, find which system depended on stale messages, and fix the read instead of accepting a baseline move.

**Chunk 5 [senior] — Citadel MP pause/speed authority + load-save resync** (item 13) — after chunk 4 (shared sim-bootstrap surface)
- Files: `games/citadel/sim-core/src/snapshot/index.ts` (+ snapshot assembly in `sim-bootstrap.ts`), `games/citadel/server/src/sim-host.ts`, `games/citadel/client/src/worker/{sim-worker,sim-client,server-client}.ts`, `main.ts`, `ui/resource-hud.ts`.
- Problem: pause/speed are optimistic client locals; the server silently ignores non-host `pause`/`resume`/`speed` (`sim-host.ts:180–193`) with no correction; snapshot `speed` is never read client-side and `paused` doesn't exist in it → non-host HUD lies permanently; load-save sets worker `paused=false` while the client keeps `paused=true` → `interpAlpha` pinned to 1 (entities snap) + wrong button label (`onReady` is wired but never consumed).
- Fix: snapshot carries authoritative `paused` + `speed`; `main.ts` rederives both from every snapshot instead of shadow state; surface host identity (attach reply or snapshot field) and disable/grey the room controls for non-host peers. Solo (worker) path gets the same fields so load-save self-corrects.
- Tests: worker + server host emit the fields; client store rederives; solo load-save resumes interpolation. Real-browser check: `?mp` two-tab pause from the non-host shows a disabled control (not a lying toggle); solo save→pause→load resumes smoothly.

### Wave 3 — after chunk 5: {8}

**Chunk 8 [junior] — Citadel client small fixes** (items 20, 21)
- Files: `games/citadel/client/src/ui/toast.ts`, `ui/inspect-panel.ts`, the `trade` command handler in `games/citadel/sim-core/src/sim-bootstrap.ts`.
- Toast: dedup matches the rightmost identical string, so the second of two identical same-day events never shows. Track consumed events by index/sequence.
- Trade: bare positional `offerIndex` races the daily offer re-roll. Send the offer's content (give/get good+qty); sim resolves by content match against the live menu and no-ops on mismatch.

## Deferred out of this brief

- **Item 7 (market-wall loop)**: needs its own brief — wire the FIPA loop (Perceive folds OFFERS_LIST into `marketOffers`, seller-side BUY_REQUEST handler with escrow + TRADE_COMPLETED, ActSystem `sell-from-wall` case, offer TTL) **or** strip the intents/AP costs. Product call first.
- **Items 28–35 (P2 debt)**: crop-quality drift `debitCrop()`, harbor `tick/20`, CNP dead code, shop-slate rng fork, auction escrow, snapshot module state, Citadel production tile-map + fire-scan precompute, placement Set churn, `noDoor` contract, dup `device.lost`, canvas2d tint parity, MP iso window.
