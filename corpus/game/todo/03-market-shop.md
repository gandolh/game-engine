# Game Task 03 — Market Wall, Shopkeeper, Auctions

## Context

"Farm Valley" multi-agent sim. The market layer connects farmers to each other (Market Wall — bulletin board with offers) and to a NPC (Shopkeeper — guaranteed-floor liquidity + Vickrey/Dutch auctions for rare items like Golden Beans).

This slice builds those entities + the systems that handle their ontologies. It's the most coordination-heavy slice in the game side.

## Files you OWN (create)

- `packages/farm-valley/src/agents/market-wall.ts` — Market Wall entity spawner
- `packages/farm-valley/src/agents/shopkeeper.ts` — Shopkeeper entity spawner
- `packages/farm-valley/src/systems/market.ts` — handles market ontologies on the bus
- `packages/farm-valley/src/systems/shopkeeper.ts` — handles shop ontologies
- `packages/farm-valley/src/systems/auction.ts` — auction state machine (Vickrey, Dutch)
- `packages/farm-valley/src/systems/market.test.ts`
- `packages/farm-valley/src/systems/shopkeeper.test.ts`
- `packages/farm-valley/src/systems/auction.test.ts`

## Files you must NOT touch

- `packages/farm-valley/src/main.ts`
- `packages/farm-valley/src/components.ts` (pre-extended: `marketWall`, `shopkeeper` tags exist)
- `packages/farm-valley/src/protocols/**` (`market.ts` and `shop.ts` are pre-built with all ontologies + body types)
- `packages/farm-valley/src/world-setup.ts`
- `packages/farm-valley/src/systems/{day-clock,perceive,deliberate,act,finish-day,harvest,inbox-dispatch}.ts`
- `packages/farm-valley/src/agents/{conservative,registry}.ts`
- `packages/engine/**`

## What to build

### `market-wall.ts`
- `spawnMarketWall(world): GameEntity` — entity with `marketWall: { isMarketWall: true }`, `inbox: { messages: [] }`, plus an internal offer store. The offer store can live as a field on the entity (use the `[key: string]: unknown` escape hatch) OR — preferred — as a Map keyed by entity id inside `MarketSystem`. Choose one and document it.

### `shopkeeper.ts`
- `spawnShopkeeper(world): GameEntity` — entity with `shopkeeper: { isShopkeeper: true }`, `inbox: { messages: [] }`.

### `MarketSystem`
- Constructor: `(bus: MessageBus, world: World<GameEntity>, rng: Rng)`
- Maintains: `offersById: Map<string, MarketOffer>` (use `MarketOffer` from `protocols/market.ts`)
- Each tick, processes messages in the MarketWall's inbox (ontology → handler):
  - `ONT_MARKET.POST_OFFER` → assign offerId via `rng.fork("market.offerId").nextU32().toString(36)` and store; if buyer issuing inventory not present, ignore silently
  - `ONT_MARKET.READ_OFFERS` → reply to sender with `ONT_MARKET.OFFERS_LIST` containing all offers (optionally filtered by `crop`)
  - `ONT_MARKET.CANCEL_OFFER` → only the seller can cancel their offer (assert by sender id)
  - `ONT_MARKET.BUY_REQUEST` (peer-to-peer trade init) → forward to the offer's seller as a `BUY_REQUEST` direct message; seller's farmer agent decides (in their personality logic — out of scope for you)
  - `ONT_MARKET.TRADE_COMPLETED` → remove the offer from the store
- Drains the wall's inbox each tick

### `ShopkeeperSystem`
- Constructor: `(bus, world)`
- Fixed prices (mirror Python economy doc):
  - Buy from farmer (shop pays): radish 5, wheat 8, pumpkin 22
  - Sell seeds to farmer (shop charges): radish 5, wheat 10, pumpkin 20, golden_bean 999 (golden_bean is special — for auction only; if requested as seed, reject)
- Handlers (on the shopkeeper inbox):
  - `ONT_SHOP.BUY` (farmer wants to sell crops to shop, ack with goldDelta + itemDelta)
  - `ONT_SHOP.SELL` (farmer buys seeds, ack)
  - Reply via `ONT_SHOP.CONFIRM` direct message to sender
- This system DOES NOT actually mutate the farmer's inventory — the farmer's `ActSystem` already does that for `sell-shopkeeper` intentions. **However**, for the bus-based trade path (where the farmer sends a REQUEST message instead of using a local intention), the ShopkeeperSystem mutates the inventory directly. Choose ONE path and document — recommended: shop responds via CONFIRM, and a follow-up system or the farmer's perceive consumes the confirm. **Simplest:** Shopkeeper mutates inventory directly on receive (single-step) and sends CONFIRM as audit. Document the choice.

### `AuctionSystem`
- Constructor: `(bus, world, rng)`
- Holds auction state by `auctionId`
- **Vickrey** (second-price sealed bid): collect bids until `closesAtTick`, winner = highest bid, paid price = second highest (or reserve if only one bid)
- **Dutch** (descending clock): NPC announces a starting price and decrements every N ticks; first bidder accepts at the current price; if `closesAtTick` reached with no taker, no winner
- (English and FPSB are nice-to-haves; you may stub them as TODO returning `null`)
- Methods/messages:
  - On `ONT_SHOP.AUCTION_CFP` (broadcast by the shopkeeper — you can let the shop trigger this; see below) → store an open auction
  - On `ONT_SHOP.AUCTION_BID` → append bid (Vickrey) OR check accept (Dutch)
  - When `tick >= closesAtTick`: resolve, broadcast `ONT_SHOP.AUCTION_RESULT`
- **Shop triggers an auction:** the Shopkeeper publishes `AUCTION_CFP` for a `golden_bean` once every K days (configurable; default every 5 days). You can implement this trigger inside `ShopkeeperSystem` or `AuctionSystem` — pick one and document.

### Wire-up

You do NOT modify `main.ts`. Instead, expose:
```ts
export function setupMarketShopFeature(world, bus, rng): {
  marketSystem: MarketSystem,
  shopkeeperSystem: ShopkeeperSystem,
  auctionSystem: AuctionSystem,
}
```
from `market-wall.ts` (or a sibling `market-shop-setup.ts` if you prefer). Document the entry point.

### Tests

- `market.test.ts`: post → read returns the offer; cancel removes it; trade-completed removes it; offerId determinism (same seed → same id sequence)
- `shopkeeper.test.ts`: BUY responds with correct CONFIRM payload; gold delta matches the price table; SELL respects golden_bean ban
- `auction.test.ts`: Vickrey with 3 bids → winner is top bid, paid = second-highest; with 1 bid → paid = reserve; Dutch — first accept wins at current price

## Acceptance criteria

- `npm run typecheck` passes
- `npm run test -w farm-valley` passes
- All public setup helpers exported
- No `.js` import suffixes, no new deps

## Difficulty & subagent split

**HARD** — auctions, message routing, deterministic offerId generation, multi-step ontologies.

Recommended split:
- **Senior (opus) subagent**: `auction.ts` + `auction.test.ts` + `shopkeeper.ts` (auction trigger logic) + their tests
- **Junior (sonnet) subagent**: `market.ts` + `market-wall.ts` + `market.test.ts` (simpler bookkeeping)
- Either subagent can write the small spawner files in their respective domain
- Run in parallel (no file overlap)
- After both return, run typecheck + test
