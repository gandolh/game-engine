# Game Task 06 — Spatial Market, Shop Daily Slate, Peer Encounters

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
