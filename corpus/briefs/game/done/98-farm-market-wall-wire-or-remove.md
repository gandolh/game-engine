# Brief 98 — Farm market wall: wire the trade loop or remove it

status: **DONE 2026-07-11 (Option A — wired).** Commit `490b892`.

> **Closeout 2026-07-11.** The loop closes end to end; the AP charge is no longer a lie.
>
> - **Escrow at post is the load-bearing choice.** `POST_OFFER` debits the seller immediately
>   (via `debitCropDetailed`, which reports the quality tiers it consumed) and parks those tiers on
>   the offer, so **the wall — not the seller — owns listed stock**. Three bugs die at once: an
>   uncovered listing is never stored (no oversell), two buyers racing one offer cannot both be
>   filled (`settleBuy` is all-or-nothing and deletes the offer), and "the seller's stock vanished
>   before settlement" is unrepresentable, because it already left their inventory.
> - **The BUY_REQUEST consumer went into SNOOP** (new `systems/economy/wall-trade.ts`), which is the
>   *only* band that works: the forwarded request must be read after `InboxDispatchSystem` delivers
>   it and before `PerceiveSystem` unconditionally wipes every farmer inbox. Its `TRADE_COMPLETED` is
>   `bus.send`-queued, so trust/event-feed snoop it the following tick — position *within* SNOOP is
>   therefore not load-bearing, but the band is.
> - Settlement always uses the **offer's** price, never the buyer's (possibly stale) claimed price.
> - Escrow returns to the seller on `CANCEL_OFFER`, on the `OFFER_TTL_DAYS = 3` sweep, or via the new
>   `sell-from-wall` intent (personalities pull their own listings near run end), so `offersById`
>   stays bounded and no stock strands.
> - Crop movement routes through `debitCrop`/`bankHarvest` (brief 99), not a hand-rolled decrement.
>
> **Baseline moved by design, and the acceptance bar was an actual run, not a code read:**
> **42 / 36 / 40** completed wall trades on seeds `0xc0ffee` / `1` / `42` over 40 days. Goods now
> circulate peer-to-peer at sellers' prices instead of only through the shopkeeper's haircut, and
> listed crops leave the net-worth leaderboard until they sell or the TTL returns them.
>
> **Gates:** typecheck 0; `@farm/sim-core` **834** (+5: gold+stock conservation, `offersById` bounded,
> escrow-rejects-uncovered, insolvent-buyer-moves-nothing, two-buyer race); full-repo test exit 0;
> determinism **MATCH ×3** (no new RNG draws — the `market.offerId` fork is untouched).
> [economy.md](../../../wiki/economy.md) + [system-ordering.md](../../../wiki/system-ordering.md) updated.

status: superseded-by-closeout — **decision made 2026-07-10: Option A, wire it.** Execute the Option-A branch below; Option B is dead. ⚠️ Baseline moves by design: prove reproducibility ×3 and eyeball a headless run showing wall trades actually closing.
source: [2026-07-02 review findings item 7](../../../todos/2026-07-02-full-repo-review-findings.md) — read it first; it carries the verified evidence.

## Problem

The market-wall trade loop is dead end-to-end while still charging AP. Verified 2026-07-02:
- `BUY_REQUEST` is forwarded to the seller's inbox ([market.ts:132-155](../../../../games/farm/sim-core/src/systems/economy/market.ts)) but nothing consumes it (PerceiveSystem's switch doesn't, then clears the inbox).
- `TRADE_COMPLETED` is never sent in production code (readers exist in market/trust/event-feed).
- The `marketOffers` belief the three buying personalities gate on (aggressive:176, hoarder:127, opportunist:127) is written **only by test fixtures** — the buy path can never fire live.
- `"sell-from-wall"` has an AP cost ([ap.ts:32](../../../../games/farm/sim-core/src/systems/economy/ap.ts)) but no ActSystem case.
- `handlePostOffer` never validates/escrows seller stock (latent oversell); `offersById` grows all run (TRADE_COMPLETED/CANCEL_OFFER never sent).

## Decision (make first, then execute one branch)

**Option A — wire it (recommended if Farm gets more sim-depth work):** completes a designed
FIPA protocol and adds a real asynchronous goods market alongside the synchronous encounter
trades. Scope: PerceiveSystem folds `OFFERS_LIST` into the `marketOffers` belief; a
seller-side `BUY_REQUEST` handler (check stock escrowed at post time, transfer gold/stock,
emit `TRADE_COMPLETED`, update the wall); ActSystem `sell-from-wall` case; offer TTL +
`CANCEL_OFFER` sweep so `offersById` is bounded; escrow at `handlePostOffer`. ⚠️ baseline
moves by design; prove reproducibility ×3 and eyeball a headless run showing wall trades
actually closing.

**Option B — remove it:** strip the post-offer/read-offers/buy-from-wall/sell-from-wall
intents + their AP rows + the dead personality branches; keep the wall entity as scenery.
Small, ⚠️ baseline still moves (AP spend pattern changes).

## Acceptance

- A: a multi-day headless run shows ≥1 completed wall trade per standard seed; gold+stock
  conserved (test); `offersById` bounded; determinism MATCH ×3.
- B: zero AP spent on wall intents; no dead reads of `marketOffers`; determinism MATCH ×3.
- Either: [wiki/economy.md](../../../wiki/economy.md) + [system-ordering.md](../../../wiki/system-ordering.md) updated if flows change.
