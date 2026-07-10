---
summary: Why every system in bootstrapSim sits where it does — the ten bands, the inbox lifecycle, cross-cutting invariants, and the system-to-brief provenance map.
updated: 2026-07-10
---

# Scheduler System Ordering

**Source of truth for why the systems in [sim-bootstrap.ts](../../games/farm/sim-core/src/sim-bootstrap.ts) are registered in the order they are.** The ordering encodes real data dependencies; reordering without reading this page breaks message visibility, same-tick reads, or determinism. (Brief [69](../briefs/game/done/69-named-system-stages-assertion.md) proposes asserting these stages in code; until then this page is the contract.)

## The bands

Registration order in `bootstrapSim()`, grouped into bands. Within a band, order still matters where noted.

### 1. Clock & shock
| System | Why here |
|---|---|
| `DayClockSystem` | First — everything downstream reads the tick/day it establishes. |
| `ShockSystem` (optional, default on) | Right after the clock so it sees the fresh day boundary, **before** crop growth / harvest resolve that day. Mid-game blight, defaults to run midpoint. (brief 23) |

### 2. Dispatch
| System | Why here |
|---|---|
| `WeatherSystem` | Broadcasts conditions/forecast for the tick. |
| `InboxDispatchSystem` | Calls `bus.flush()` — swaps inflight→deliverable and fills entity inboxes. Everything that reads an inbox this tick must run after this. |

### 3. Snoop band — read-only inbox observers
Everything here must run **after `InboxDispatchSystem` and before `PerceiveSystem`** (which clears inboxes) and before `MarketSystem` (which drains the market wall). These systems read messages without consuming them.

| System | Constraint |
|---|---|
| `ShopSlateSystem`, `NoticeBoardSystem` | Read DAY_START to refresh daily boards. |
| `EncounterSystem` → `EncounterTradeSystem` | **Strict pair order**, and both before `PerceiveSystem`: trades/gifts fire on the MEET messages Encounter just produced. EncounterTrade was once silently dropped from the scheduler after the worker migration — peer trades never fired live (brief 24 fixed). |
| `MeetIndicatorSystem`, `TrustSystem` | Consume MEET observations. |
| `RivalrySystem` | **Before `EventFeedSystem`** so the feed can read `freshlyFormedThisTick()` on the same tick (brief 37). |
| `FestivalSystem` | Reads fresh DAY_START, writes festival awareness into beliefs **before** Perceive clears / Deliberate reads; resolves the previous festival into an `ONT_FESTIVAL.RESULT` broadcast that EventFeed snoops next tick via the market wall (same surface as AUCTION_RESULT). Mutates only farmer gold + beliefs; must precede `DeliberateSystem` (brief 45). |
| `HarborSystem` | Posts/resolves contracts off DAY_START; **before `EventFeedSystem`** so the feed snoops CONTRACT_POSTED/DELIVERED/MISSED (brief 46). |
| `EventFeedSystem` | The central snoop: must observe inboxes + market wall before Perceive clears and Market drains. |
| `TavernSystem` | **Right after EventFeed** (reads the now-current feed for the barkeep's daily gossip line, picked deterministically), before Perceive clears the tavern's DAY_START (brief 44). |
| `RunHistorySystem` | Per-day rank/gold collector; snoops DAY_START from the weather-station inbox (same pattern as BubbleSystem). Constructed before `EventFeedSystem`, which takes it as a dep to detect rank-1 changes ("race is on" line) — no mutual dependency. |

### 4. Perceive
`PerceiveSystem` — **clears farmer inboxes** and folds messages into beliefs; also clears expired `busyUntilTick` and re-arms deliberation. The hard barrier of the tick: anything needing raw farmer messages runs before; anything needing fresh beliefs runs after. It queries `("inbox","beliefs","fsm")`, so it touches *only* farmers — the non-farmer stations are cleared in band 10, and were cleared nowhere at all before brief 97.

### 5. Environment
`CropGrowthSystem` → `TileFeatureSystem` (per-day tree/stone spawns) → `BubbleSystem` → `HarvestSystem` → `LivestockSystem` (daily product yield + care decay, **after harvest**) → `OrchardSystem` (maturation + seasonal fruit drop). (briefs 42)

### 6. Deliberation
| System | Constraint |
|---|---|
| `PlotSenseSystem` | Surfaces owned-plot watering needs into beliefs **before** agents deliberate, enabling survival-reflex watering (brief 29). |
| `DeliberateSystem` | Personality dispatch → intention queue. Skips the player. |
| `PlayerControlSystem` | Pip's keyboard input → movement + context action. **After Deliberate** (which skips the player), **before Travel/Act** so a requested action executes the same tick. |
| `AggressionSystem` | Turns hostile intent into a pursuit, reading the beliefs Deliberate just wrote. Holds the single `CombatSystem` instance (constructed once, registered in band 9). |
| `ApSystem` | Action-point accounting before movement/actions. |

### 7. Movement (only when a pathfinder is supplied)
`FeatureCollisionSystem` → `ChaseSystem` → `TravelSystem`. They share one walkable grid: FeatureCollision blocks tree/stone tiles on it each tick so farmers never path through features. `ChaseSystem` **re-points the pursuit travel intent before TravelSystem steps it** — swap the two and a chaser trails its quarry by a tick. TravelSystem also holds a **separate boat grid** (water lanes dock→reef, brief 48) it swaps to while a farmer is aboard — keeps the land grid and engine pathfinder untouched. Without a pathfinder (legacy tests), farmers stay put.

### 8. Act & resolve
`ActSystem` (consumes intentions, sets `busyUntilTick`, queues bus messages) → `MarketSystem` (drains the wall) → `ShopkeeperSystem` → `AuctionSystem` → `CarpenterSystem` (drains ONT_COMMISSION.BUILD orders delivered the tick after a farmer's commission act; escrows cost, delivers after build time — the shopkeeper's order→fulfill twin, brief 44).

### 9. Ambient & close
`NpcDeliberateSystem` (sets each service NPC's `busyFactor` from world state) → `WorkNpcSystem` (scales patrol cadence by it; cosmetic, pure) → `CombatSystem` (resolves the strikes Aggression/Chase set up — the same instance those two hold) → `FinishDaySystem`.

### 10. Cleanup
`StationInboxClearSystem` — drains every **non-farmer** inbox at the very end of the tick, after the last consumer of any of them (brief 97 item 11).

`InboxDispatchSystem` fans every broadcast into *every* entity with an `inbox`, but `PerceiveSystem` (band 4) clears only farmers — its query is `("inbox","beliefs","fsm")`. So the station entities (weatherStation, harborBoard, noticeBoard, shopkeeper, market wall, …) accumulated messages forever, and the ~10 systems that re-scan them each tick paid O(ticks × accumulated), plus a real memory leak in the long-lived server host (one sim per WebSocket connection).

Two exclusions, both load-bearing:
- **weatherStation** is skipped here. `WeatherSystem` sits in band 2 *one line before* `InboxDispatchSystem`, so it reads its inbox **pre-dispatch** and drains it there; `flush()` then refills it in the same stage, same tick, for every post-dispatch reader.
- **Farmers** are skipped, discriminated by `beliefs`. If a non-farmer entity ever gains `beliefs` without `fsm`, this system and `PerceiveSystem` disagree about who owns clearing its inbox.

The shopkeeper's `AUCTION_RESULT` is **not** dropped unconditionally: a result whose winner has not yet been credited is a live cross-tick settlement retry, retained until `settledAuctions` records it. Settled and no-winner results are inert and dropped.

**A clear placed too early is a correctness bug, not a growth bug** — inboxes stay bounded either way (more so, in fact) while the band-3 snoopers silently stop seeing their broadcasts. Guarding on inbox *size* therefore certifies nothing; [station-inbox-clear.test.ts](../../games/farm/sim-core/src/systems/messaging/station-inbox-clear.test.ts) carries a message-*visibility* guard for exactly this, alongside the exact-order pin in `scheduler-stages.test.ts`.

## Cross-cutting invariants

- **Inbox lifecycle per tick**: `bus.send` queues inflight → `InboxDispatchSystem` flushes → snoop band reads → `PerceiveSystem` clears **farmer** inboxes → `StationInboxClearSystem` (band 10) clears the rest. A new snoop/feed system goes in band 3, never after Perceive. A new *station* consumer must run before band 10.
- **Same-tick reads** (Rivalry→EventFeed, EventFeed→Tavern, Encounter→EncounterTrade) are intentional couplings — moving either side of a pair breaks the feature silently, not loudly.
- **Determinism**: no system may use `Math.random`/`Date.now`; all take the forked `Rng`. Extra-farmer spec generation is a pure function of the index (no RNG).
- **PathfinderLike duck type**: both the WASM `Pathfinder` and `JsPathfinder` satisfy it, so headless runs work without WASM — but the two are **not route-equivalent** (see [performance.md](performance.md) / determinism notes); the server uses WASM.

## Provenance map (system → origin brief)

Shock 23 · EncounterTrade registration fix 24 · PlotSense 29 · Rivalry-before-EventFeed 37 · crop quality 41 · Livestock/Orchard 42 · Tavern + Carpenter 44 · Festival 45 · Harbor 46 · boat grid 48 · starting-gold +30 across all archetypes 70 · StationInboxClear / CLEANUP band 97. Per-brief details live in [briefs/game/done/](../briefs/game/done/) and one-liners in [status.md](status.md).
