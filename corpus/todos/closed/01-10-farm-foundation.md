# Briefs 01–10 — Farm Valley foundation (merged archive)

> **Merged rollup (2026-07-02 compaction).** The ten original single-brief files
> (`01-personalities` … `10-trust-and-endgame`) were concatenated here to cut the
> archive file count; each brief's original text is preserved verbatim below under
> its own `##` heading. Immutable foundation specs from the 05-26→05-29 era (see
> the log archive summary). Numbers are stable; nothing links these individually
> except an inter-brief reference now pointing within this file (brief 08 → 06).

---

## Game Task 01 — Three Farmer Personalities + CNP Buying

**Status:** Done
> Condensed 2026-06-13 — original spec in git history.

Port the three remaining farmer personalities (Conservative was already done) and implement CNP (Contract Net Protocol) as a buying initiator for the Hoarder. Dispatch via the existing `registerPersonality` registry.

## What shipped

- **`agents/aggressive.ts`** — `risk: high`, `minGoldReserve: 10`. Plants most profitable crop affordable (pumpkin > wheat > radish, downgrades in storm/rain). Every 2 days posts inventory at `priceMax` and scans wall for offers below 90% of shop price.
- **`agents/opportunist.ts`** — `risk: medium`, `minGoldReserve: 50`. Crop choice driven by weather forecast. Posts at fair price only when supply for that crop is low (<3 offers); otherwise dumps to shopkeeper. Buys at most one offer/day from highest-trust seller ≤110% shop price.
- **`agents/hoarder.ts`** — `risk: high`, `minGoldReserve: 80`. Plants pumpkin/corn alternating by plot id. Every 3 days broadcasts a CNP CFP to peers to buy radishes; after deadline picks cheapest proposal (lowest `pricePerUnit`, tie-break by lowest `bidderId`), sends ACCEPT to winner + REJECT to losers. Also buys market-wall offers up to 105% of shop price ordered by trust score.
- **`agents/cnp-coordinator.ts`** — pure state machine (no system loop). State per task: `{ taskId, initiatorId, status: "open"|"collecting"|"awarded"|"completed", proposals, deadlineTick }`. Methods: `startTask`, `acceptProposal`, `closeTask` (returns winner or null). Deterministic winner: lowest price, lowest id tie-break.
- Each personality file registers via `registerPersonality(name, fn)` at module load.
- New intention kinds enqueued (consumed by downstream systems — Game Task 03): `cnp-initiate`, `cnp-respond-bid`, `post-offer`, `read-offers`, `buy-from-wall`. Shapes mirror protocol body types in `protocols/market.ts` and `protocols/cnp.ts`.
- `farmer.trust?.byId: Map<number, number>` used; initial value 0.5 for unseen peers; updates deferred to a future ticket.
- Tests for each personality (intent production given beliefs/inventory) and `cnp-coordinator.test.ts` (3-proposal close, cheapest-with-lowest-id winner).

---

## Game Task 02 — Weather, Crop Growth, Action Points

**Status:** Done
> Condensed 2026-06-13 — original spec in git history.

Built three foundational systems: weather broadcasting, crop growth accumulation, and AP enforcement with an over-spend penalty.

## What shipped

- `agents/weather-station.ts` — `spawnWeatherStation(world)` spawns a singleton tag entity with `weatherStation: { current, multiplier, forecast }` and an inbox. Also exports `setupWeatherFeature(world, bus, rng)` returning all three systems.
- `systems/weather.ts` — `WeatherSystem`; detects day-start via WeatherStation inbox; rolls condition with `WEATHER_WEIGHTS` (sunny 0.45, normal 0.30, rainy 0.20, storm 0.05); updates `weatherStation.current/multiplier`; generates a 3-day forecast; broadcasts `ONT_WEATHER.NOW` and `ONT_WEATHER.FORECAST`; writes into all farmers' `beliefs.data.weatherNow/weatherForecast`.
- `systems/crop-growth.ts` — `CropGrowthSystem`; on day boundary iterates all `"planted"` plots in entity-id order (determinism); increments `daysGrowing`; adds weather multiplier to `weatherSum`.
- `systems/ap.ts` — `ApSystem`; `AP_COST` map: `plant/harvest/read-offers/post-offer/buy-seed=1`, `travel/negotiate/sell-shopkeeper/buy-from-wall/cnp-initiate=2`, `idle=0`. Pre-ACT: totals queue cost; drops lowest-priority intents until cost fits; deducts AP; sets `ap.penaltyPending=true` if farmer over-spent traveling with 0 AP. On `FINISH_DAY`: if `penaltyPending`, resets to `ap.penaltyCapacity` instead of `ap.max`; runs after `FinishDaySystem` and overwrites (documented in top-of-file comment).
- `CropGrowthSystem` does not touch `HarvestSystem` — maturity check stays there.

---

## Game Task 03 — Market Wall, Shopkeeper, Auctions

**Status:** Done
> Condensed 2026-06-13 — original spec in git history.

Built the market layer: peer-to-peer offer board, NPC shopkeeper with fixed prices, and Vickrey/Dutch auction state machine.

## What shipped

- `agents/market-wall.ts` — `spawnMarketWall(world)`. Offer store lives as `offersById: Map<string, MarketOffer>` inside `MarketSystem` (not on the entity).
- `agents/shopkeeper.ts` — `spawnShopkeeper(world)`.
- `systems/market.ts` — `MarketSystem(bus, world, rng)`: handles `POST_OFFER` (offerId via `rng.fork("market.offerId").nextU32().toString(36)`), `READ_OFFERS` (replies with `OFFERS_LIST`), `CANCEL_OFFER` (sender-only), `BUY_REQUEST` (forwarded to seller), `TRADE_COMPLETED` (removes offer). Drains market-wall inbox each tick.
- `systems/shopkeeper.ts` — `ShopkeeperSystem(bus, world)`. Fixed prices — shop buys: radish 5, wheat 8, pumpkin 22; shop sells seeds: radish 5, wheat 10, pumpkin 20, golden_bean 999 (auction-only; direct requests rejected). Mutates farmer inventory directly on receive and sends `ONT_SHOP.CONFIRM` as audit (single-step path chosen).
- `systems/auction.ts` — `AuctionSystem(bus, world, rng)`. Vickrey: collect bids until `closesAtTick`, winner = highest, price = second-highest (or reserve if one bid). Dutch: descending clock, first accept wins at current price; no taker → no winner. English/FPSB stubbed as TODO. Golden-bean `AUCTION_CFP` triggered every 5 days (configurable) from `ShopkeeperSystem`.
- Setup helper: `setupMarketShopFeature(world, bus, rng)` exported from `market-wall.ts`.
- Tests: `market.test.ts`, `shopkeeper.test.ts`, `auction.test.ts` (Vickrey 3-bid + 1-bid, Dutch accept).

---

## Game Task 04 — Observer Dashboard + Config Panel

**Status:** Done
> Condensed 2026-06-13 — original spec in git history.

Build a DOM overlay above the WebGPU canvas: a live agent dashboard and a collapsible parameter tweaker. Pure DOM/CSS — no engine internals touched.

## What shipped

- **`packages/farm-valley/src/ui/observer.ts`** — `ObserverPanel(parent: HTMLElement)`: fixed-position right panel. `update(snapshot: ObserverSnapshot)` caches last text per row to avoid DOM churn. Shows day, weather (condition + multiplier), 3-day forecast, and per-farmer rows (name, personality chip, gold, crop inventory, FSM state, AP current/max with penalty suffix). `setVisible(v)` and `destroy()` (removes panel + detaches listeners).
- **`packages/farm-valley/src/ui/config-panel.ts`** — `ConfigPanel(parent, schema: ConfigSchema, onChange)`: collapsible panel (~240px), one input per `ConfigField` (number/boolean/enum), fires `onChange(key, value)` on edit, "Reset to defaults" button fires `onChange` for every key.
- **`packages/farm-valley/src/ui/dom.ts`** — helpers: `createEl`, `setText` (no-op if unchanged), `applyStyles`.
- **`packages/farm-valley/src/ui/index.ts`** — re-exports `ObserverPanel`, `ConfigPanel`, `ConfigSchema`, `ConfigField`, `ObserverSnapshot`.
- **Tests** (jsdom env): `observer.test.ts` covers first render, no-DOM-churn on unchanged update, sort order by id; `config-panel.test.ts` covers field rendering, `onChange` with parsed number, reset fires all keys.

## Key types

`ObserverSnapshot` — `{ day, weather: { condition, multiplier }, forecast: Array<{ condition, confidence }>, farmers: Array<{ id, name, personality, gold, crops: { radish, wheat, pumpkin }, fsm, apCurrent, apMax, apPenaltyPending }> }`.

`ConfigField` — discriminated union on `type: "number" | "boolean" | "enum"`.

---

## Game Task 05 — Village, Per-Farmer Farms, Travel

**Status:** Done
> Condensed 2026-06-13 — original spec in git history.

Restructured the world from a flat layout into a 40×40 tile grid with 5 named regions in a compass layout, and added physical tile-by-tile travel powered by the WASM pathfinder.

## What shipped

- `world/regions.ts` — `RegionId`, `RegionDef`, `REGIONS` array, `WORLD_WIDTH/HEIGHT = 40`, `regionAt`, `isWalkable`, `getRegion`. Compass assignment: Cora=N, Atticus=E, Hannah=S, Otto=W, village=center.
- Layout constants: `FARM_SIZE=12`, `VILLAGE_SIZE=12`, `ROAD_LEN=4`, `ROAD_WIDTH=2`. Void tiles outside regions are not walkable. Town square = inner 4×4 of village at `x ∈ [18..21], y ∈ [18..21]`.
- `world/walkable-grid.ts` — `buildWalkableGrid()` returns a row-major `Uint8Array` (0=walkable, 1=blocked). 728 total walkable tiles (4 farms×144 + village×144 + 4 roads×8).
- `world/region-setup.ts` — `setupRegions(world, farmers)` spawns 5 region entities, 9 plots per farm in a 3×3 grid, market-wall at (16,16), shopkeeper at (23,23). Replaced flat plot-spawning in `world-setup.ts`.
- `components.ts` additions: `Farmer.currentRegion: RegionId`, `Farmer.path?: { waypoints, nextIndex, ticksUntilStep }`, `Plot.ownerId`, `Plot.regionId`.
- `systems/travel.ts` — `TravelSystem` handles `travel` intent kind; moves farmer tile-by-tile at `STEP_TICKS=5` (4 tiles/sec at 20 Hz); on arrival updates `currentRegion`, clears path, pops intent, emits `ONT_TRAVEL.ARRIVED`.
- `protocols/travel.ts` — new ontology file for `ONT_TRAVEL.ARRIVED`.
- AP cost for travel = 2 (same as other 2-AP intents); Brief 06 may revisit.
- Tests: `regions.test.ts`, `walkable-grid.test.ts`, `travel.test.ts` (including unreachable-region + same-region edge cases).

---

## Game Task 06 — Spatial Market, Shop Daily Slate, Peer Encounters

**Status:** Done
> Condensed 2026-06-13 — original spec in git history.

Depends on Brief 05. Made gameplay reward physical presence: posting market offers requires being in the village, peer trades require co-location, and the shopkeeper publishes a fresh daily offer slate.

## What shipped

- `agents/shop-slate.ts` — `generateDailySlate(rng, basePrices): ShopOffer[]`. `SLATE_SIZE=5`; each offer: `kind` 50/50 buy/sell, crop uniform over 3 types, `unitPrice = base * (1 + rng.range(-0.20, 0.20))` rounded (min 1), `quantity = rng.range(5, 20)`. Same seed + day → same slate.
- `systems/shop-slate.ts` — `ShopSlateSystem` clears + regenerates `shopkeeper.dailySlate` on day-start; decrements `remaining` on fills; rejects when `remaining === 0`; broadcasts `ONT_SHOP.DAILY_SLATE`.
- `systems/encounter.ts` — `EncounterSystem` groups farmers by `currentRegion` each tick; emits `ONT_ENCOUNTER.MEET` to pairs; `MEET_COOLDOWN_TICKS=20` suppresses re-emit until separation. Hannah (hoarder) initiates seed-buying via encounter; any farmer accepts offers ≤105% of shop price.
- `protocols/encounter.ts` — `ONT_ENCOUNTER = { MEET, OFFER_SEED, ACCEPT, DECLINE }`.
- `systems/market.ts` modified: `POST_OFFER`/`CANCEL_OFFER` reject with `{ reason: 'not-in-village' }` if `farmer.currentRegion !== 'village'`; read/buy paths unchanged.
- All 4 personality files updated: prepend `travel → village` intent before `post-offer`/`buy-from-wall`/`sell-shopkeeper` when not already in village. `read-offers` does not require travel.
- Tests: `shop-slate.test.ts`, `encounter.test.ts` (cooldown + alone-in-region), `market.test.ts` (rejection case), per-personality travel-prepend assertions.

---

## Game Task 07 — Render the New World

**Status:** Done
> Condensed 2026-06-13 — original spec in git history.

Fixed a coordinate-system split (tile coords in logic vs pixel coords in renderer) and rewrote the renderer to draw all 5 regions. Deleted the `decorate.ts` pixel-override shim.

## What shipped

- `render-systems.ts` rewritten: iterates every `(tx, ty)` in the 40×40 grid; `isWalkable && regionAt === null` → road (`tile/path`); farm regions → `tile/grass`; village → `tile/dirt`; void → no sprite. `TILE = 16` px per tile.
- Per-farm perimeter fences using `tile/fence-h`; road-entry tiles skipped so entries aren't visually blocked.
- Entity sprite rendering: `px = (prevX + (x - prevX) * alpha) * TILE + TILE/2` — tile→pixel conversion at draw time; `prevX/prevY` initialized to same tile coords as initial position.
- Camera: `worldUnitsX/Y = 640`, `centerX/Y = 320` (import `WORLD_WIDTH/HEIGHT` from `./world/regions`).
- `decorate.ts` deleted; its pixel-override of market-wall + shopkeeper transforms removed. All transforms are tile-based throughout.
- `ui/observer.ts` updated: new `region` column (`'home' | 'village' | 'traveling' | string`) derived from `farmer.currentRegion` + `farmer.path !== undefined`.
- `observer.test.ts` updated with snapshot assertion for the new region column.
- Decision: `walkable && regionAt === null` distinguishes road tiles from region tiles (roads are not inside any region's bounds).

---

## Game Task 08 — Slate-Driven Shop Sales (Limited Daily Stock)

## Context

[Brief 06](#game-task-06--spatial-market-shop-daily-slate-peer-encounters) shipped `ShopSlateSystem` that generates a 5-offer slate at day-start (currently mixed buy/sell, ±20% off baseline). The slate is broadcast on `ONT_SHOP.DAILY_SLATE` but never read by `ShopkeeperSystem` — trades still use fixed prices, unlimited liquidity.

User design call (this session): the shop should accept all crop-sales (the farmer-sells-to-shop direction) at a fixed price with no limit (guaranteed liquidity floor), but seed-sales (the shop-sells-seeds-to-farmer direction) become **slate-driven with limited daily stock**. Peer-to-peer trades are variable-price (separate brief).

Naming note: in [protocols/shop.ts](../../../../packages/farm-valley/src/protocols/shop.ts), `ONT_SHOP.BUY` means **farmer sells crops to shop**, and `ONT_SHOP.SELL` means **shop sells seeds to farmer**. The naming reflects the farmer's perspective on what side of the trade they're initiating. Don't rename.

## Goal

- `ONT_SHOP.BUY` handler (farmer→shop crop sale): **unchanged**. Fixed prices, unlimited liquidity.
- `ONT_SHOP.SELL` handler (shop→farmer seed sale): **slate-driven**. Look up a matching offer in `shopkeeper.dailySlate` (correct crop, `remaining >= quantity`). Use that offer's `unitPrice`. Decrement `remaining`. If no matching offer or insufficient stock, reply with `CONFIRM` body containing a rejection (or a new `REJECTED` ontology — your call).
- `generateDailySlate` becomes **SELL-only** (5 entries, all `kind: 'sell'`). Drop the buy variant entirely.
- All existing tests stay green; the slate test asserts no `kind: 'buy'` survives.

## Files in scope

You'll likely modify these. The plan is yours to define precisely:

- `packages/farm-valley/src/agents/shop-slate.ts` — drop `kind: 'buy'` from `generateDailySlate`
- `packages/farm-valley/src/agents/shop-slate.test.ts` — adjust
- `packages/farm-valley/src/systems/shopkeeper.ts` — SELL handler reads from slate
- `packages/farm-valley/src/systems/shopkeeper.test.ts` — new cases for slate-driven SELL, sold-out rejection
- Possibly `packages/farm-valley/src/components.ts` for typing `Shopkeeper.dailySlate` more strictly if useful

## Must NOT touch

- `packages/engine/**`
- `packages/farm-valley/src/agents/{conservative,aggressive,hoarder,opportunist}.ts` — personality changes are out of scope; current SELL request shape continues to work
- `packages/farm-valley/src/systems/encounter.ts`, `systems/travel.ts`, `systems/market.ts`, `systems/day-clock.ts`
- `packages/farm-valley/src/protocols/encounter.ts`, `protocols/travel.ts`
- `packages/farm-valley/src/world/**`
- `main.ts`, `sim-bootstrap.ts`, `world-setup.ts`
- `tools/**`

## Open question I'll defer to you

What happens when `ONT_SHOP.SELL` request quantity > a single matching offer's `remaining`, but the cumulative remaining across multiple matching offers covers it? Two reasonable options — pick one in your plan and document it: (a) one offer per request, reject if no single offer covers it; (b) consume across multiple offers in order (cheapest first benefits the farmer).

> **Status:** Done. Workflow/acceptance scaffolding trimmed 2026-06-13 (a `*-plan.md` companion was written during impl and has since been removed — git holds it). Outcome shipped per the design above; current behaviour lives in `ShopkeeperSystem`/`ShopSlateSystem`.
- No `.js` import suffixes; no new runtime deps

---

## Game Task 09 — Peer Seed Trades via MEET

**Status:** Done
> Condensed 2026-06-13 — original spec in git history.

`EncounterSystem` (brief 06) emitted `ONT_ENCOUNTER.MEET` but no personality acted on it. This brief wired peer-to-peer seed negotiation on co-location.

## What shipped

- `packages/farm-valley/src/protocols/encounter.ts` — `OfferSeedBody` extended with `direction: 'buy' | 'sell'` (sender's role); accept criteria: buyer-receiver accepts if `unitPrice <= 1.05 * shopSellPrice[crop]`; seller-receiver accepts if `unitPrice >= 0.9 * shopSellPrice[crop]`.
- `packages/farm-valley/src/agents/hoarder.ts` — on MEET, may emit a `peer-seed-offer` (BUY direction) intent toward the peer with a price/quantity heuristic.
- `packages/farm-valley/src/agents/{aggressive,conservative,opportunist}.ts` — evaluate incoming `OFFER_SEED` and ACCEPT/DECLINE per personality logic.
- `packages/farm-valley/src/systems/encounter-trade.ts` (new) — executes inventory + gold transfer on ACCEPT.
- New intent kinds in `components.ts`: `peer-seed-offer`, `peer-seed-response`.
- Tests: `encounter-trade.test.ts` (simulated MEET → OFFER_SEED → ACCEPT → inventory transfer); per-personality test updates.
- Trade prices are variable/negotiated, unlike fixed shop sales or shop-set slate seed-sales.

---

## Game Task 10 — Trust Updates + Aggressive End-of-Sim Liquidation

**Status:** Done
> Condensed 2026-06-13 — original spec in git history.

Two fixes: trust scores were static at 0.5 despite personalities already reading them; and aggressive's end-of-sim liquidation had been deferred pending an end-of-sim signal.

## What shipped

- `packages/farm-valley/src/systems/trust.ts` (new) — subscribes to relevant ontologies and applies trust deltas: OFFER_SEED accepted → +0.05 toward peer (both sides); OFFER_SEED declined → -0.05; CNP broken commitment → -0.10; successful market trade → +0.05 toward seller. Values clamped `[0, 1]` via `farmer.trust.byId.set(peerId, newValue)`.
- `packages/farm-valley/src/systems/day-clock.ts` — publishes `daysRemaining` (`maxDays - currentDay`) in the `ONT_DAY_CLOCK.DAY_START` body; accepts `maxDays` via constructor threaded from `bootstrapSim` options.
- `packages/farm-valley/src/sim-bootstrap.ts` + `main.ts` — `maxDays` wired through to `DayClockSystem`.
- `packages/farm-valley/src/systems/perceive.ts` — surfaces `daysRemaining` into `farmer.beliefs.data.daysRemaining`.
- `packages/farm-valley/src/agents/aggressive.ts` — when `beliefs.data.daysRemaining <= 2`, enqueues `sell-shopkeeper` intents for all crops in inventory; skips planting/market actions.
- Tests: `trust.test.ts` (OFFER_SEED → ACCEPT exchange updates both farmers' trust maps), `aggressive.test.ts` (daysRemaining = 1 + crops → sell-shopkeeper intents), `day-clock.test.ts`.

---

