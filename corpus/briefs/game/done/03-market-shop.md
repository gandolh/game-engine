# Game Task 03 — Market Wall, Shopkeeper, Auctions

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
