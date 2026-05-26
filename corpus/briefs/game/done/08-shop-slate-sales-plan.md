# Plan — Brief 08: Slate-Driven Shop Sales (Limited Daily Stock)

Concrete implementation plan for [08-shop-slate-sales.md](08-shop-slate-sales.md).
The brief is the spec; this file is the *how*.

## Decisions

### Open question: cross-offer consumption

**Picked: option (b) — consume across multiple matching offers, cheapest-first.**

Rationale:
- A SELL slate has 5 entries that often duplicate crops (e.g. two `wheat` offers at different jitter prices). With option (a), a farmer who asks for 12 wheat seeds gets rejected even though the shop visibly has `7 + 8` wheat seeds across two offers. That's the kind of "the shop is lying about its stock" UX that makes the slate look broken.
- Cheapest-first benefits the farmer, which is the right default in a single-shop economy where the shopkeeper has no competing pressure to optimize against the buyer.
- Implementation is barely more code than (a): sort matching offers by `unitPrice` asc, walk the list deducting `remaining`, and short-circuit if total `remaining` across all matching offers can't cover `qty`.
- This also means the test cases get richer (split-fill, partial-fill rejection) without much extra surface.

Atomicity: we **check first, then mutate**. If the cumulative `remaining` across matching offers is `< qty`, reply FAILURE without touching offers or farmer state. This avoids half-consumed-then-rolled-back states.

### Rejection signaling

I'll **keep the existing `ONT_SHOP.CONFIRM` channel** with `ok: false` plus a `reason` string, rather than introducing a new `REJECTED` ontology. Adding an ontology costs surface (protocols index, broadcast handling, perceive parsing) for zero behavioral gain — `ShopConfirmBody.ok=false` already carries `reason`. New `reason` values added: `"no-matching-offer"`, `"insufficient-stock"`. Existing reasons (`invalid-sell-request`, `golden-bean-auction-only`, `unknown-seed`, `insufficient-gold`) stay.

### Golden-bean handling

`ShopOffer.crop` is typed `"radish" | "wheat" | "pumpkin"` — `golden_bean` is structurally excluded from the slate, so the slate-lookup path would naturally reject golden-bean sells as `no-matching-offer`. But the existing `golden-bean-auction-only` reason carries diagnostic value (and the existing test asserts it). **Keep the explicit `golden_bean` check** before the slate lookup so the failure reason stays informative.

### Pricing source

Slate-driven means slate-driven: `SHOP_SEED_PRICE` becomes **dead code** for the SELL path and is removed. The slate's `unitPrice` field is now the sole source of truth. (Crop-buying via `ONT_SHOP.BUY` keeps `SHOP_BUY_PRICE` — that side is unchanged per brief.)

### Slate type narrowing

Now that all offers are SELL, I'll narrow `ShopOffer.kind` from `"buy" | "sell"` to just `"sell"`. This makes downstream consumers (shopkeeper SELL handler) not have to filter by `kind === "sell"` everywhere — the type forbids the buy case at compile time. Keeps the field rather than deleting it; deletion would change `DailySlateBody` shape and potentially the observer panel's structural expectations, and a single literal-typed discriminant is cheap.

---

## File-by-file changes

### 1. `packages/farm-valley/src/agents/shop-slate.ts`

- Narrow `ShopOffer.kind` from `"buy" | "sell"` to `"sell"`.
- Drop the random `kind` selection in `generateDailySlate`; hard-code `"sell"`.
- `PriceTable` still has both `buy` and `sell` per crop (it's a price-table, not an offer schema). The generator just reads `table[crop].sell`.
- `DEFAULT_PRICES` unchanged.

Pseudocode for the generator loop body:

```ts
for (let i = 0; i < SLATE_SIZE; i++) {
  const crop = CROPS[rng.range(0, 3) | 0]!;
  const base = table[crop].sell;
  const unitPrice = Math.max(1, Math.round(base * (1 + rng.range(-PRICE_JITTER, PRICE_JITTER))));
  const quantity = Math.floor(rng.range(5, 21));
  const offerId = idFork.nextU32().toString(36);
  offers.push({ offerId, kind: "sell", crop, unitPrice, quantity, remaining: quantity });
}
```

Note: removing the `rng.range(0, 1) < 0.5` draw **changes the RNG stream** consumed per slot from 4 draws to 3. This is acceptable: brief 08 introduces a slate-shape change, and the only determinism callers are the slate tests themselves (which we own). No serialized save state, no cross-run reproducibility contract documented for slate sequences.

### 2. `packages/farm-valley/src/agents/shop-slate.test.ts`

Update existing cases and add a guard:

- **Remove** the `"kind is always 'buy' or 'sell'"` case.
- **Add** `"kind is always 'sell' (no buy variant survives)"` — asserts every offer's `kind === "sell"`.
- The `"prices are within ±20% of the base price for the picked kind/crop"` case — now `base = DEFAULT_PRICES[offer.crop].sell` directly. Simpler.
- Other cases (length, determinism, quantity range, distinct ids, custom PriceTable, different-seed-different-slate, remaining=quantity) stay green as-is.

### 3. `packages/farm-valley/src/protocols/shop.ts`

- No structural change to `ShopBuyBody`, `ShopSellBody`, `ShopConfirmBody`, `DailySlateBody`.
- `DailySlateBody.offers` automatically narrows via the import of `ShopOffer` (whose `kind` field narrowed to `"sell"`).
- No new ontology added — see decision above.

### 4. `packages/farm-valley/src/systems/shopkeeper.ts`

- **Delete** the `SHOP_SEED_PRICE` constant (dead after this brief).
- **Rewrite** `handleSell` to read from the slate:

  ```
  1. Validate inputs (sender, crop, qty, item==="seed") — same as today.
  2. If crop === "golden_bean" → FAILURE "golden-bean-auction-only".
  3. Look up shop entity (already in scope via this.findShop()).
     Pull slate = shop.shopkeeper.dailySlate ?? [].
     mutableOffers = offers we can mutate. The slate on the shopkeeper
     component is typed `readonly`; we mutate the entries themselves
     (their `remaining` field is not readonly), not the array slot.
  4. matching = slate.filter(o => o.kind === "sell" && o.crop === crop && o.remaining > 0);
  5. If matching.length === 0 → FAILURE "no-matching-offer".
  6. totalAvail = sum of remaining across matching.
     If totalAvail < qty → FAILURE "insufficient-stock".
  7. Sort matching ascending by unitPrice (stable enough — tie-break by
     existing array order, JS Array.sort is stable since ES2019).
  8. Walk matching:
       - take = min(remaining, qtyLeft)
       - cost += take * unitPrice
       - record planned consumption: [{offer, take}, ...]
       - qtyLeft -= take; break when qtyLeft === 0.
  9. If farmer.inventory.gold < cost → FAILURE "insufficient-gold"
     (no offer mutation yet, atomic).
 10. Commit:
       - for each planned [{offer, take}]: offer.remaining -= take.
       - farmer.inventory.gold -= cost.
       - farmer.inventory.seeds[crop] += qty.
 11. Reply CONFIRM ok=true with goldDelta=-cost, itemDelta={crop, quantity: qty}.
  ```

- Field-mutation note: `Shopkeeper.dailySlate` is typed `readonly ShopOffer[]`. The array reference is readonly (we don't reassign), but `ShopOffer.remaining` is a writable `number`. Mutating `offer.remaining` is allowed by TS. (If TS objects, we narrow with a cast: `(offer as ShopOffer).remaining -= take;` — but I don't expect it to object given the current field shapes.)

- The `replyConfirm`, `findShop`, `findFarmerById`, `readCurrentDay`, BUY handler, and auction-trigger logic all stay untouched.

### 5. `packages/farm-valley/src/systems/shopkeeper.test.ts`

Existing cases that need adjustment:

- **`SELL of seed updates gold/seeds and acks`** — currently passes `gold: 100` with no slate set on the shop. After the change, this would FAIL with `no-matching-offer`. Fix: seed `shop.shopkeeper.dailySlate` with a known offer (e.g. one radish SELL offer at unitPrice=5, quantity=10) before the call. Assert gold == 100 - 5*2 = 90, seeds.radish == 2, and `offer.remaining` decremented from 10 → 8.

- **`SELL respects golden_bean ban with FAILURE CONFIRM`** — still passes (golden-bean check runs before slate lookup). Confirm the test still works.

- **`SELL with insufficient gold fails and does not mutate`** — seed a radish offer with enough stock so we reach the gold check rather than failing on stock. Otherwise unchanged.

New cases to add:

- **`SELL succeeds at the slate's unit price (not the legacy SHOP_SEED_PRICE)`** — set the slate's radish offer to `unitPrice: 7` (jittered), buy 2 → gold delta is -14 (not -10).

- **`SELL fails with no-matching-offer when slate has no matching crop`** — slate is `[wheat-offer]`, farmer asks for radish. Assert FAILURE + `reason === "no-matching-offer"`. No mutation.

- **`SELL fails with no-matching-offer when slate is empty / undefined`** — leave `dailySlate` undefined, request radish, assert FAILURE + `no-matching-offer`.

- **`SELL fails with insufficient-stock when single offer has too few`** — slate has one radish offer with `remaining: 3`. Farmer requests 5. Assert FAILURE + `reason === "insufficient-stock"`. Offer's `remaining` unchanged (atomic).

- **`SELL fills across multiple matching offers cheapest-first`** — slate has two radish offers: `(unitPrice: 8, remaining: 3)` and `(unitPrice: 5, remaining: 4)`. Farmer requests 5. Expect: cheapest-first takes 4 from the price-5 offer, then 1 from the price-8 offer. Cost = 4*5 + 1*8 = 28. After: cheap offer remaining=0, expensive offer remaining=2.

- **`SELL fills across multiple matching offers — cumulative stock sufficient`** — slate `[(7, remaining: 2), (6, remaining: 4)]` for radish. Request 5 → cheap(6) takes 4, expensive(7) takes 1 → cost 4*6 + 1*7 = 31, remaining values 0 and 1 respectively.

- **`SELL decrement is atomic on gold failure`** — slate has radish `(unitPrice: 50, remaining: 10)`. Farmer has gold=20. Request 1 (cost 50). Assert FAILURE + `reason === "insufficient-gold"`. Offer's `remaining` still 10 (not mutated).

Helper: introduce a tiny `seedSlate(shop, offers)` helper near `pushToShop` so test cases stay short. The offers passed in are plain `ShopOffer` objects.

### 6. `packages/farm-valley/src/components.ts`

No change needed. `ShopkeeperTag.dailySlate` already references `ShopOffer` from the slate module, so the kind narrowing propagates automatically.

### 7. `packages/farm-valley/src/systems/shop-slate.test.ts`

No change needed — these tests assert length/determinism/broadcast, not `kind` content. They keep passing.

---

## Non-obvious gotchas (carry to executor)

1. **Naming inversion**: `ONT_SHOP.BUY` = farmer-sells-to-shop (crop sale, fixed price, unlimited liquidity — **untouched**). `ONT_SHOP.SELL` = shop-sells-to-farmer (seed sale, **slate-driven, limited stock**). Do NOT rename. Do NOT touch the BUY handler.

2. **The slate is on `shop.shopkeeper.dailySlate`, not the farmer.** The SELL handler already has the shop entity in scope via `this.findShop()` (called from `run()`), but currently `handleSell` doesn't take it as a parameter. Pass the shop down or re-fetch it inside `handleSell`. Re-fetching is cheap and keeps the signature stable, but threading it through the call is cleaner — your call.

3. **`act.ts` is in the "must NOT touch" list** and has its own `buy-seed` intent path that bypasses `ShopkeeperSystem` entirely (direct inventory mutation, no bus round-trip). That means gameplay seed-buying does NOT route through our slate logic. Our changes only affect the `ONT_SHOP.SELL` bus path, which is exercised by tests (and would be by future agent code wiring SELL through the bus). Don't try to "fix" `act.ts` — out of scope.

4. **`readonly ShopOffer[]` vs mutating `remaining`**: the array is readonly (no reassignment, no push/splice), but `remaining: number` on each offer is a writable field. Mutating `offer.remaining -= take` is type-safe. If TS complains, the fix is `(offer as ShopOffer).remaining -= take`, not changing the component type.

5. **Determinism**: removing the `kind` random draw shifts the RNG stream. Slate tests that snapshot specific `offerId` values would break — none currently do; they assert distinct ids and length, not specific values. Safe.

6. **No new runtime deps. No `.js` import suffixes anywhere.** Use the same import style as the existing files (`from "../components"`, `from "./shopkeeper"`).

7. **The brief's "your call" on rejection ontology**: keep `ONT_SHOP.CONFIRM` with `ok: false` + `reason`. Do NOT add `ONT_SHOP.REJECTED`.

8. **Order of validation in `handleSell`**: keep the existing order (sender → farmer lookup → input validation → golden-bean → slate matching → gold check → mutate). Reasons must remain stable strings for any external consumer / log scraper.

---

## Verification

- `npm run typecheck -w farm-valley` — must pass.
- `npm run test -w farm-valley` — must pass; new tests counted; no regressions.

Done criteria: both commands green, executor reports files-changed list + test counts (before/after).
