# Plan — 09 Peer Seed Trades via MEET

Plan for brief [09-peer-meet-trades.md](./09-peer-meet-trades.md). Drafted by orchestrator (opus) for a sonnet executor.

## 1. Architectural decisions

### 1.1 New system: `systems/encounter-trade.ts`

Trade execution lives in a **new** `EncounterTradeSystem`, NOT folded into `act.ts`.

**Why**:
- `act.ts` is on the must-not-touch list (the brief allows folding into it, but prefers a new file). A new file is the lower-risk option — it leaves the existing intent → bus → handler shape untouched.
- The peer trade lifecycle is its own state machine (MEET → OFFER_SEED → ACCEPT/DECLINE → transfer). Wrapping it into `act.ts` would either bloat the intent switch or force a second intent kind that round-trips through the bus for what is essentially a direct point-to-point handshake.
- Co-located trade execution by definition involves two farmer entities, not a third-party hub like the market wall. The existing `act.ts` intents are all farmer→hub (market wall, shopkeeper); peer trades are farmer↔farmer. Different topology, different system.

**What it does**: in `run(ctx)` it iterates farmers, drains MEET/OFFER_SEED/ACCEPT/DECLINE messages from each farmer's inbox, and:
- For MEET: invokes a personality-specific `initiatePeerTrade` hook (only Hoarder implements it for now; others no-op).
- For OFFER_SEED: invokes a personality-specific `respondToPeerOffer` hook that returns `"accept" | "decline"`. Pushes the corresponding ACCEPT/DECLINE message onto the offerer's inbox.
- For ACCEPT: locates the pending offer (tracked in a `pendingOffers` Map keyed by offerId) and performs the inventory + gold transfer.
- For DECLINE: clears the pending offer.

Messages consumed by `EncounterTradeSystem` are spliced out of the inbox so `PerceiveSystem` does not see them (PerceiveSystem currently clears inboxes wholesale, but defensively removing them keeps the contract that EncounterTrade "owns" the encounter ontology).

### 1.2 Scheduler placement (deferred)

`sim-bootstrap.ts` is on the must-not-touch list. `EncounterTradeSystem` will therefore be implemented + tested in isolation but **not wired into the scheduler** in this brief. That's a deliberate follow-up.

The system is designed so that, when later wired, it should run between `EncounterSystem` and `PerceiveSystem` — that ordering ensures MEET messages produced by EncounterSystem this tick are consumed by EncounterTradeSystem before PerceiveSystem wipes the inbox. Tests will run EncounterSystem then EncounterTradeSystem explicitly to validate this contract.

Note this in the new system's file-header docstring + add a TODO at the end of the plan's "Follow-ups" section.

### 1.3 Personality hooks colocated with personality files

Each personality file (`hoarder.ts`, `aggressive.ts`, `conservative.ts`, `opportunist.ts`) gains two new exported functions:

```ts
// Optional — undefined means "this personality never initiates peer trades".
export function initiatePeerTradeXxx?(
  farmer: GameEntity,
  meet: MeetBody,
  ctx: { tick: number },
): OfferSeedBody | null

// Required — all personalities can respond.
export function respondToPeerOfferXxx(
  farmer: GameEntity,
  offer: OfferSeedBody,
  sender: number,
  ctx: { tick: number },
): { decision: "accept" | "decline"; reason?: string }
```

These hooks are registered via a new tiny registry in `agents/peer-trade-registry.ts` (mirrors `registry.ts`). The new file keeps `registry.ts` untouched (it's not on the no-touch list, but minimal blast radius is the policy).

Existing `deliberateXxx` functions are NOT modified — peer-trade hooks are a separate surface called by `EncounterTradeSystem`, not by `DeliberateSystem`. This keeps the existing AP / intent-queue machinery unchanged.

## 2. Protocol shape

### 2.1 `OfferSeedBody` (extend in `protocols/encounter.ts`)

```ts
export interface OfferSeedBody {
  offerId: string;
  crop: "radish" | "wheat" | "pumpkin";
  quantity: number;
  unitPrice: number;
  direction: "buy" | "sell"; // sender's role in the proposed trade
}
```

- `direction: "buy"` — sender will pay `unitPrice` to receive `quantity` seeds (sender is buyer, receiver is seller).
- `direction: "sell"` — sender will give `quantity` seeds in exchange for `unitPrice` per seed (sender is seller, receiver is buyer).

### 2.2 No new ontologies

`MEET`, `OFFER_SEED`, `ACCEPT`, `DECLINE` already exist in `ONT_ENCOUNTER`. No additions.

### 2.3 No new intent kinds

The brief mentions `peer-seed-offer` / `peer-seed-response` as possible intent kinds. We do **not** add them. Rationale:
- They would round-trip through ActSystem and AP_COST, which adds two-tick latency and AP overhead for what is a single-tick peer handshake.
- The encounter handshake is fully driven by inbox messages — message-only flow is simpler and keeps ActSystem unchanged.

If we later want peer trades to cost AP, the natural place is `EncounterTradeSystem` itself (deduct from `farmer.ap.current` directly when initiating or accepting). For this brief we leave AP cost = 0 to keep the surface tight. Document as follow-up.

## 3. Accept criteria per personality

Constants used throughout (already established in personality files):

```ts
const SHOP_SELL_PRICE: Record<CropKind, number> = { radish: 8, wheat: 14, pumpkin: 35 };
const SEED_COST: Record<CropKind, number> = { radish: 5, wheat: 8, pumpkin: 15 };
```

Note `act.ts` has `SEED_COST = { radish: 5, wheat: 10, pumpkin: 20 }` while `hoarder.ts` / `aggressive.ts` / `opportunist.ts` use `{ radish: 5, wheat: 8, pumpkin: 15 }`. This discrepancy already exists in the codebase and is out of scope here. We mirror the personality-file values (seeds are bought via `buy-seed` intent, not directly by us). When evaluating a peer SELL offer's fairness, the reference price is `SHOP_SELL_PRICE[crop]` (the price the shopkeeper would pay them for the crop). The seed-cost values are not used in the accept logic.

### 3.1 Hoarder (Hannah)

**Initiate (on MEET)**: emits `direction: "buy"` for `crop: "radish"`, `quantity: 3`, `unitPrice: 4.5` if:
- `farmer.inventory.gold - reserve >= 4.5 * 3 = 13.5` (can afford while keeping reserve), AND
- `farmer.inventory.seeds.radish < 3` (still needs seeds — keeps determinism on repeated MEETs since hoarder may already have stock), AND
- not already pending an offer to this peer this tick.

`offerId` is deterministic: `peer-${farmerId}-${peerId}-${tick}-${day}-${crop}`. Hannah's id is lower than peer's only in some pairings — we use `${farmerId}` (the initiator), not min/max, since the offer is uniquely owned by the sender.

**Respond to OFFER_SEED**:
- `direction: "sell"` (someone offered to sell radish/wheat/pumpkin to Hannah): accept if `unitPrice <= 1.05 * SHOP_SELL_PRICE[crop]` AND `farmer.inventory.gold - reserve >= unitPrice * quantity`. Hannah is gold-hoarding but happy to buy seeds at peer prices since they're cheaper than the wall.
- `direction: "buy"` (someone wants to buy seeds from Hannah): accept if `unitPrice >= 0.95 * SHOP_SELL_PRICE[crop]` AND `farmer.inventory.seeds[crop] >= quantity + 2` (Hannah won't sell her last seeds — keeps a 2-seed buffer).

### 3.2 Aggressive (Atticus)

**Initiate**: none for this brief. Aggressive remains reactive on the encounter channel. (Atticus already does market-wall plays in `deliberateAggressive`.)

**Respond to OFFER_SEED**:
- `direction: "sell"`: accept if `unitPrice <= 0.95 * SHOP_SELL_PRICE[crop]` (aggressive only buys at a discount; they're the existing 90% undercut buyer on the wall, but for peer trades a slightly looser 95% threshold accounts for the social/spatial premium of meeting in person) AND `farmer.inventory.gold - reserve >= unitPrice * quantity`.
- `direction: "buy"`: accept if `unitPrice >= 1.0 * SHOP_SELL_PRICE[crop]` (aggressive sells at the ceiling) AND `farmer.inventory.seeds[crop] >= quantity`.

### 3.3 Conservative (Cora)

**Initiate**: none.

**Respond to OFFER_SEED**:
- `direction: "sell"`: accept if `unitPrice <= 1.0 * SHOP_SELL_PRICE[crop]` (Cora won't pay over shop price for anything) AND `farmer.inventory.gold - reserve >= unitPrice * quantity`. Reserve defaults to 30.
- `direction: "buy"`: accept if `unitPrice >= 0.9 * SHOP_SELL_PRICE[crop]` AND `farmer.inventory.seeds[crop] >= quantity + 1` (Cora keeps a 1-seed buffer).

### 3.4 Opportunist (Otto)

**Initiate**: none for this brief.

**Respond to OFFER_SEED**:
- `direction: "sell"`: accept if `unitPrice <= 1.1 * SHOP_SELL_PRICE[crop]` (Otto is the existing 110%-ceiling buyer — keep consistent) AND `farmer.inventory.gold - reserve >= unitPrice * quantity`. Reserve defaults to 50.
- `direction: "buy"`: accept if `unitPrice >= 0.9 * SHOP_SELL_PRICE[crop]` AND `farmer.inventory.seeds[crop] >= quantity + 1`.

## 4. Inventory + gold transfer semantics

On ACCEPT, `EncounterTradeSystem` performs the transfer atomically:

```ts
// direction === "buy" — sender bought, receiver sold
// (sender is the OFFER_SEED initiator, receiver accepted)
// Gold flows initiator → acceptor; seeds flow acceptor → initiator.

// direction === "sell" — sender sold, receiver bought
// Gold flows acceptor → initiator; seeds flow initiator → acceptor.
```

**Pre-transfer validation** inside the system (these are last-line-of-defense checks; personalities should pre-check too):
- Buyer has `gold >= unitPrice * quantity`.
- Seller has `seeds[crop] >= quantity`.
- If either fails, the transfer is silently skipped (no error throwing — keep the sim deterministic). The pending offer is cleared.

The system mutates `farmer.inventory.gold` and `farmer.inventory.seeds[crop]` directly on the two `GameEntity` objects fetched from `world.query`. No bus traffic on completion (we may add a CONFIRM message later — out of scope).

### 4.1 Pending offers store

`EncounterTradeSystem` holds a private `Map<string, { offer: OfferSeedBody; senderId: number; recipientId: number; tick: number }>` keyed by `offerId`. Entries:
- inserted when the system places an OFFER_SEED into the recipient's inbox on behalf of an initiating personality, OR when an OFFER_SEED arrives via the bus (defensive — supports tests that inject directly).
- removed on ACCEPT (after transfer) or DECLINE.
- pruned after `OFFER_TTL_TICKS = 5` (an unanswered offer expires; cleanup happens at the top of each `run()`).

This map being inside the system (not on the world) is consistent with `MarketSystem.offersById` (system-owned offer state).

## 5. File changes (concrete)

### New files
- `packages/farm-valley/src/systems/encounter-trade.ts` — `EncounterTradeSystem`, `OFFER_TTL_TICKS` constant, `_resetForTests()` helper.
- `packages/farm-valley/src/agents/peer-trade-registry.ts` — tiny registry mirroring `registry.ts` for `initiatePeerTrade*` + `respondToPeerOffer*` hooks.
- `packages/farm-valley/src/systems/encounter-trade.test.ts` — end-to-end tests (MEET → OFFER_SEED → ACCEPT → transfer).
- `packages/farm-valley/src/agents/peer-trade.test.ts` — per-personality hook unit tests.

### Edits
- `packages/farm-valley/src/protocols/encounter.ts` — add `direction: "buy" | "sell"` to `OfferSeedBody`.
- `packages/farm-valley/src/agents/hoarder.ts` — add + register `initiatePeerTradeHoarder` and `respondToPeerOfferHoarder`.
- `packages/farm-valley/src/agents/aggressive.ts` — add + register `respondToPeerOfferAggressive`.
- `packages/farm-valley/src/agents/conservative.ts` — add + register `respondToPeerOfferConservative`.
- `packages/farm-valley/src/agents/opportunist.ts` — add + register `respondToPeerOfferOpportunist`.

### Strictly not touched
Per brief + parent prompt: `packages/engine/**`, all systems on the no-touch list (including `act.ts` since we chose new file), `agents/shop-slate.ts`, `protocols/{market,shop,travel}.ts`, `world/**`, `main.ts`, `sim-bootstrap.ts`, `world-setup.ts`, `systems/encounter.ts` itself.

## 6. Test cases

### 6.1 `encounter-trade.test.ts` (end-to-end)

- **HOARDER_INITIATES_BUY_THEN_AGGRESSIVE_ACCEPTS**: Hannah and Atticus in `village`. Run EncounterSystem → MEET to both. Run EncounterTradeSystem → Hannah's `initiatePeerTradeHoarder` produces `OFFER_SEED(direction:"buy", crop:radish, qty:3, price:4.5)` into Atticus's inbox. Pre-seed Atticus with `seeds.radish=5` and verify `unitPrice=4.5 >= 0.95*8 = 7.6` — NO, that's below threshold. So aggressive DECLINES at 4.5. Test asserts DECLINE in Hannah's inbox.
- **HOARDER_BUYS_AT_FAIR_PRICE**: Manually craft Hannah's `initiatePeerTradeHoarder` so unitPrice is 8 (override via test hook or just inject an OFFER_SEED directly into Atticus's inbox at 8g — even cleaner). Atticus accepts (`8 >= 0.95*8 = 7.6`), transfer happens: Hannah gold -= 24, seeds.radish += 3; Atticus gold += 24, seeds.radish -= 3.
- **SELL_OFFER_ACCEPTED_BY_OPPORTUNIST**: Inject `OFFER_SEED(direction:"sell", crop:wheat, qty:2, price:14)` from Atticus → Otto. `14 <= 1.1*14 = 15.4` and Otto has gold. Otto accepts; transfer happens (Otto gets 2 wheat seeds, pays 28g; Atticus loses 2 wheat seeds, gains 28g).
- **DECLINE_ON_OVERPRICE**: Inject `OFFER_SEED(direction:"sell", crop:radish, qty:1, price:100)` to Cora. Cora declines (way over threshold). No transfer.
- **DECLINE_ON_INSUFFICIENT_GOLD**: Inject `OFFER_SEED(direction:"sell", crop:pumpkin, qty:5, price:30)` to Cora with `gold=20, reserve=30`. Pre-check fails. Cora declines.
- **TRANSFER_SKIPPED_IF_SELLER_LACKS_STOCK**: Inject ACCEPT for an OFFER_SEED whose seller no longer has the seeds (artificially set `seeds.radish = 0` between offer and accept). System detects, skips transfer, clears pending. No throw.
- **OFFER_ID_DETERMINISM**: Same farmer-pair, same tick → same offerId. Different ticks → different offerIds.
- **OFFER_EXPIRES_AFTER_TTL**: Plant an offer, run system 6 ticks without ACCEPT/DECLINE → offer removed from pending map; a late ACCEPT does nothing.
- **MEET_CONSUMED_FROM_INBOX**: After EncounterTradeSystem.run(), the MEET message is no longer in the recipient's inbox (so PerceiveSystem can't see it).

### 6.2 `peer-trade.test.ts` (personality hooks)

For each of the four personalities, parameterize over (direction, crop, unitPrice, qty) and assert accept/decline matches the table in §3.

- Hoarder accept-sell at 105% radish (8 -> 8.4), decline above.
- Hoarder accept-buy at 95%+ when has 2-seed buffer, decline if would dip below buffer.
- Hoarder initiate-trade emits `direction:"buy"` with deterministic offerId.
- Hoarder initiate skipped when `seeds.radish >= 3`.
- Aggressive accept-sell at 95%, decline above.
- Aggressive accept-buy at >= 100% with stock, decline if no stock.
- Conservative accept-sell at <= 100%, decline above.
- Conservative reserve-protection: declines if would dip below gold reserve.
- Opportunist accept-sell at <= 110%, decline above.
- Opportunist accept-buy at >= 90% with 1-seed buffer maintained.

### 6.3 `encounter.test.ts` (no changes)

EncounterSystem is read-only and its tests pass unchanged.

## 7. Gotchas

- **Determinism of offerId**: include `farmerId`, `peerId`, `tick`, `day`, `crop` — never `Date.now()` or `Math.random()`. The `tick` value comes from `ctx.tick` passed into `EncounterTradeSystem.run`.
- **Idempotency on repeated MEETs**: EncounterSystem already cooldowns MEETs at `MEET_COOLDOWN_TICKS = 20`. Hoarder's initiate hook ALSO needs to check it hasn't just placed an offer for the same (peer, crop, day) — use the pendingOffers map's contents (filter by senderId + recipientId + crop + day match).
- **PerceiveSystem clears inbox**: EncounterTradeSystem MUST be invoked in tests BEFORE PerceiveSystem on the same tick to consume encounter-protocol messages. Document this in both file headers. Tests should NOT run PerceiveSystem between EncounterSystem and EncounterTradeSystem.
- **Splicing inbox messages**: When EncounterTradeSystem consumes a message, splice it out using `messages.splice(idx, 1)` (decrement loop index). Don't mutate during iteration — collect indices first or iterate reverse.
- **`unitPrice` type**: number, may be fractional (e.g. 4.5). Use floating-point math; assertions in tests should tolerate exact equality since we never accumulate (single multiply).
- **No-touch sim-bootstrap**: the system won't actually run in production from this brief alone. Acceptance criterion in brief says "in tests" — that's what we honor. Add a follow-up note.
- **AP cost = 0**: peer trades are AP-free in this brief. Note in the system file header.
- **Two-way visibility of `MeetBody`**: EncounterSystem emits MEET to BOTH peers. EncounterTradeSystem will see MEET on Hannah's inbox AND on Atticus's inbox. Only Hannah's hook fires initiate; Atticus's hook returns null (no-op). To avoid double-initiate when both sides happen to be hoarders, the system uses `farmer.id < peerId` ordering — only the lower-id farmer's MEET triggers initiate. (Or: the personality hook itself can apply this rule. We'll put it in the system to keep the rule in one place.)
- **Conservative has no `personality.kind` test override** — re-check `conservative.test.ts` if it tests deliberate, not encounter. Looking at the file (lines 1-49), it uses `deliberateConservative` directly; the new test uses a separate hook so no overlap.

## 8. Follow-ups (out of scope this brief)

- Wire `EncounterTradeSystem` into `sim-bootstrap.ts` between EncounterSystem and PerceiveSystem.
- Define a peer-trade AP cost (suggest 1 for accept, 1 for initiate).
- Emit a CONFIRM message on successful transfer for downstream trust updates (brief 10).
- Aggressive / Conservative / Opportunist initiate hooks.
- Negotiation rounds (counter-offers) — current design is single-shot accept/decline.

## 9. Acceptance gate

Sonnet executor must run before reporting done:
- `npm run typecheck -w farm-valley` (zero errors)
- `npm run test -w farm-valley` (zero failures, no regressions)

Plus self-check that no file outside the file-change list in §5 was modified.
