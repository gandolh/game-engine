# Game Task 09 — Peer Seed Trades via MEET

## Context

[Brief 06](../game/done/06-spatial-market.md) shipped `EncounterSystem` which emits `ONT_ENCOUNTER.MEET` to both farmers when they share a region. Protocol `OFFER_SEED`, `ACCEPT`, `DECLINE` constants exist in [protocols/encounter.ts](../../../../packages/farm-valley/src/protocols/encounter.ts). But **no personality acts on MEET** — the encounter is a notification with no behavioral consequence yet.

Brief 06's canonical use case: Hannah (hoarder) initiates seed-buying via encounter; any farmer accepts offers at ≤105% of shop price.

User design call (this session): peer trades use **variable prices** (negotiated by both parties), in contrast to shop sales (fixed) and slate seed-sales (varies but shop-set).

## Goal

When two farmers are co-located (MEET delivered to both), they can negotiate a seed trade:

1. **Hoarder initiates**: on receiving MEET, Hannah may emit a `peer-seed-offer` intent toward the peer — specifically a BUY request ("I'll pay 4.5g per radish seed, buying up to 3").
2. **Other personalities can also initiate** but for now only Hoarder is required (others are reactive). Document as a follow-up.
3. **All personalities evaluate incoming `OFFER_SEED`**: ACCEPT if their personality logic says the deal is good (e.g. price within X% of shop price for the direction they're on), else DECLINE.
4. On ACCEPT: **inventory and gold transfer** between the two farmer entities. The acceptor side moves seeds; the initiator side moves gold (or vice versa, depending on direction).
5. On DECLINE: no transfer.

## Design decision (your call to make explicit in the plan)

`OFFER_SEED` needs a direction. Recommended shape:

```ts
interface OfferSeedBody {
  offerId: string;
  crop: 'radish' | 'wheat' | 'pumpkin';
  quantity: number;
  unitPrice: number;
  direction: 'buy' | 'sell';  // sender's role in the proposed trade
}
```

Sender buying: `direction: 'buy'` → "I will pay `unitPrice` per `crop` seed for `quantity` seeds; do you want to sell to me?"
Sender selling: `direction: 'sell'` → "I will sell you `unitPrice` per seed; do you want to buy?"

Receiver's accept criterion (per personality):
- Buyer-receiver (someone offered to sell to them at `unitPrice`): accept if `unitPrice <= 1.05 * shopSellPrice[crop]`
- Seller-receiver (someone offered to buy from them at `unitPrice`): accept if `unitPrice >= 0.9 * shopSellPrice[crop]` (or some other floor — define in plan)

## Files in scope

- `packages/farm-valley/src/protocols/encounter.ts` — add `direction` to `OfferSeedBody`
- `packages/farm-valley/src/agents/hoarder.ts` — initiate peer-buy on MEET (price/quantity heuristic)
- `packages/farm-valley/src/agents/{aggressive,conservative,opportunist}.ts` — respond to incoming OFFER_SEED
- New `packages/farm-valley/src/systems/encounter-trade.ts` (or fold into `act.ts`) — executes the transfer on ACCEPT
- New intent kinds in `components.ts` if you add them: `peer-seed-offer`, `peer-seed-response`
- Tests: `encounter-trade.test.ts` + per-personality test updates

## Must NOT touch

- `packages/engine/**`
- `systems/{travel,market,shopkeeper,perceive,deliberate,act,finish-day,harvest,inbox-dispatch,day-clock,weather,crop-growth,ap,shop-slate}.ts` (except `act.ts` IF you choose to fold trade execution there — prefer a new file)
- `packages/farm-valley/src/agents/shop-slate.ts`
- `systems/encounter.ts` itself (it just emits MEET; trade execution is downstream)
- `world/**`, `main.ts`, `sim-bootstrap.ts`, `world-setup.ts`

## Workflow

1. Read brief + relevant code (`encounter.ts`, `encounter.test.ts`, `protocols/encounter.ts`, all 4 personality files, `components.ts`, `act.ts` for trade-execution pattern reference).
2. Write a concrete plan at `corpus/briefs/game/todo/09-peer-meet-trades-plan.md`.
3. Dispatch ONE sonnet subagent to execute. Give it the plan + scope.
4. Verify typecheck + tests.
5. Report back.

## Acceptance criteria

- `npm run typecheck -w farm-valley` passes
- `npm run test -w farm-valley` passes (no regressions)
- A simulated MEET between Hannah and a peer with radish seeds produces an OFFER_SEED → ACCEPT → inventory transfer in tests
- The OFFER_SEED `direction` field is wired through the protocol and consumed by personalities
- No `.js` import suffixes; no new deps
