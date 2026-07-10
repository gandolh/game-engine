# Brief 98 — Farm market wall: wire the trade loop or remove it

status: todo — **decision made 2026-07-10: Option A, wire it.** Execute the Option-A branch below; Option B is dead. ⚠️ Baseline moves by design: prove reproducibility ×3 and eyeball a headless run showing wall trades actually closing.
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
