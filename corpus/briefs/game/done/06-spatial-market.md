# Game Task 06 — Spatial Market, Shop Daily Slate, Peer Encounters

## Context

Depends on **Brief 05** ([05-village-and-farms.md](05-village-and-farms.md)) being landed. That brief makes farms physical and adds travel; this one makes the gameplay reward presence: posting offers requires being in the village, peer trades require co-location, and the shopkeeper publishes a fresh daily offer slate.

## Goal

1. **Market presence**: `POST_OFFER` and `CANCEL_OFFER` require the farmer to be in `village`. Reading (`READ_OFFERS`, `OFFERS_LIST`) stays remote.
2. **Peer encounter trades**: when two farmers share a region (town square or anyone's farm), they can negotiate seed exchanges in person, bypassing the market wall.
3. **Shop daily slate**: at day-start, shopkeeper generates 5 offers (mix of buy-orders + seed-listings), prices ±10–20% off baseline, posted to a new "shop board". Offers expire at day-end.
4. **Personality updates**: farmers plan trips before market actions. Each personality emits a `travel` intent to village before `post-offer` etc. if they are not already there.

## Files you OWN

- `packages/farm-valley/src/agents/shop-slate.ts` (create) — daily slate generator + expiry
- `packages/farm-valley/src/systems/shop-slate.ts` (create) — system that runs the generator on day-start
- `packages/farm-valley/src/systems/encounter.ts` (create) — detects co-located farmers, drives in-person trade negotiation
- `packages/farm-valley/src/protocols/encounter.ts` (create) — ontologies for in-person trade (`MEET`, `OFFER_SEED`, `ACCEPT`, `DECLINE`)
- `packages/farm-valley/src/systems/market.ts` (modify) — enforce presence requirement on POST/CANCEL only; READ stays remote
- `packages/farm-valley/src/agents/{aggressive,hoarder,opportunist,conservative}.ts` (modify) — prepend `travel` intent when they want to do a market action and aren't in village
- Tests next to each source file

## Files you must NOT touch

- `packages/engine/**`
- `packages/farm-valley/src/world/**` (Brief 05 owns the world layout)
- `packages/farm-valley/src/systems/travel.ts` (Brief 05's territory)
- `packages/farm-valley/src/components.ts` — additive only if needed for shop slate state (e.g. `Shopkeeper.dailySlate?`)
- `packages/farm-valley/src/main.ts`
- `packages/farm-valley/src/ui/**`

## What to build

### Shop daily slate

```ts
export interface ShopOffer {
  offerId: string;
  kind: 'buy' | 'sell';        // shop buys from farmers | shop sells to farmers
  crop: 'radish' | 'wheat' | 'pumpkin';
  unitPrice: number;
  quantity: number;             // total available today
  remaining: number;            // decremented as farmers fill it
}

export function generateDailySlate(rng: Rng, basePrices: PriceTable): ShopOffer[];
```

Generate 5 offers (constant `SLATE_SIZE = 5`). For each slot:
- `kind`: 50/50 buy vs sell via `rng.range(0, 1) < 0.5`
- `crop`: uniform pick from the 3 crops
- `unitPrice`: `basePrice * (1 + rng.range(-0.20, 0.20))`, rounded to nearest integer (min 1)
- `quantity`: `rng.range(5, 20)` (integer)
- `offerId`: `rng.fork('shop.offerId').nextU32().toString(36)`

Determinism: same seed + same day → same slate.

### `ShopSlateSystem`

- Listens for day-start (subscribe via the bus or detect via day-cache pattern like other systems)
- On day-start: clear the previous slate, generate the new one, write to `shopkeeper.dailySlate`
- On `BUY` / `SELL` (when peer is the shopkeeper, via existing `ShopkeeperSystem`): consume from `remaining`. If `remaining === 0`, reject the trade.
- The slate is **published** to a new bus ontology `ONT_SHOP.DAILY_SLATE` so the Observer UI (future) and farmer perception can read it. Personalities use this to decide whether to travel to the shop.

### Encounter system

```ts
export class EncounterSystem implements System {
  constructor(world, bus);
  step(): void;
}
```

Each tick:
- Group farmers by `currentRegion`
- For each region with ≥2 farmers, find pairs not yet engaged this tick
- For each pair, emit `ONT_ENCOUNTER.MEET` to both farmers' inboxes with body `{ peerId, regionId }`
- Throttle: don't re-emit `MEET` for the same pair until they separate and re-meet (track last-met-tick per pair, suppress for N ticks). Default `MEET_COOLDOWN_TICKS = 20`.

Personality response (already-existing patterns in deliberate flow): when a farmer receives `MEET`, they may produce an `offer-seed` intent or `accept-seed-offer` intent. **You don't need to make every personality respond intelligently — start with Hannah (hoarder) initiating seed-buying via encounter, and any farmer accepting offers ≤105% of shop price.**

`protocols/encounter.ts` exports:
- `ONT_ENCOUNTER = { MEET, OFFER_SEED, ACCEPT, DECLINE } as const`
- Body types for each

### MarketSystem changes

In the existing `MarketSystem`, on each inbox message:
- `POST_OFFER` / `CANCEL_OFFER`: look up the sender (farmer entity). If `farmer.currentRegion !== 'village'`, **reject** the message: post a `MARKET_REJECTED` reply with body `{ reason: 'not-in-village' }` to sender's inbox. Do NOT auto-queue a travel intent — leave it to the personality.
- `READ_OFFERS`, `BUY_REQUEST`, `TRADE_COMPLETED`: unchanged.

### Personality updates

Each personality currently produces market-touching intents (`post-offer`, `read-offers`, `buy-from-wall`) directly. Update them so:

```ts
// pseudocode
if (wantsToPostOffer && farmer.currentRegion !== 'village') {
  enqueue({ kind: 'travel', payload: { targetRegionId: 'village' }, priority: P_TRAVEL });
  enqueue({ kind: 'post-offer', payload: ..., priority: P_MARKET });
  return;
}
```

`read-offers` does NOT require travel — leave its current dispatch.

`buy-from-wall` requires presence (because peer trades need encounter — but wall buys go via shopkeeper-equivalent shopkeeper-clerk… simpler: wall buys also require village presence, because the actual exchange happens at the wall).

Conservative needs the same update (it's the only personality not in Brief 01's scope, but it does call `sell-shopkeeper` from anywhere today; same pattern — prepend travel).

## Tests

- `shop-slate.test.ts`: same seed + day → identical slate; prices within ±20% of base; quantities in [5, 20]; offerIds distinct
- `encounter.test.ts`: two farmers in same region → MEET emitted to both; cooldown prevents re-emit within 20 ticks; alone in region → no MEET
- `market.test.ts` (add cases): POST_OFFER from a farm region rejects with `not-in-village`; POST_OFFER from village succeeds as today
- Per-personality tests: when wantsToPost and not-in-village, the travel intent precedes the market intent in the queue

## Acceptance criteria

- `npm run typecheck` passes
- `npm run test -w farm-valley` passes
- A 100-day sim run via `npm run sim` shows farmers visibly traveling between farms and village (verify by checking `log.md` output or summary metrics — farmers should not be in `village` every tick)
- The shop slate refreshes daily and farmers trade against it
- No `.js` import suffixes; no new runtime deps

## Difficulty & subagent split

**HARD overall.** The personality updates touch 4 files with subtle ordering (travel before market action). Encounter system has determinism gotchas (pair iteration order, cooldown bookkeeping).

Recommended:
- **Senior**: encounter system + personality updates (especially Hannah's encounter-initiated buys) + market rejection logic
- **Junior**: shop slate generator + slate system + tests
- Validate end-to-end via a short `npm run sim` after both return

## Out of scope

- Renderer drawing the daily slate in the village (UI work)
- Trust score updates from successful/failed encounters (still TODO from Brief 01)
- Auctions tied to physical presence (auctions stay bus-based for now)
