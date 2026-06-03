# Game Task 24 — Auction Bidding + the Golden Bean

## Context

Brief 21 ("complete auctions") shipped a fully-tested `AuctionSystem` with Vickrey / FPSB / Dutch / English formats. But a live 100-day run (verified 2026-06-03 via Playwright) shows the Activity feed is **21 of 22 entries reading "Auction closed with no winner."** The machinery is correct; the problem is that **no agent ever bids**. The shopkeeper opens a Vickrey auction for a `golden_bean` every 5 days ([systems/shopkeeper.ts](../../../../packages/farm-valley/src/systems/shopkeeper.ts) `triggerAuction`), broadcasts an `AUCTION_CFP`, and registers it — but `golden_bean` is auction-only with **zero in-sim utility**, so there is no reason for any farmer to want it, and no `auction-bid` intention is ever emitted by any of the four personalities.

This is a "done" feature that is dead on the field. Fix it by making the auctioned good *worth wanting*.

## Goal

Make the **golden bean** a rare, high-value status good — "like gold in real life: rare, pretty, high market value, and a token of friendship" — and wire the four personalities to actually bid for it, then do something meaningful with it.

1. **Golden bean = real economic value.** It becomes a scarce good with two uses:
   - **Resale**: a winner can sell it back to the shop for well above the auction reserve (high, fixed premium).
   - **Gifting**: a winner can give it to a peer on a MEET encounter for a large trust boost (a loyalty/alliance play).
2. **Personalities bid.** Each personality's `deliberate*` emits an `auction-bid` intention when it perceives an open `AUCTION_CFP`, with a personality-flavored valuation off a shared `expectedBeanValue(farmer, ctx)` helper, and a `decisionTrace` reason string so the "why" panel explains bids.
3. **Gift handshake.** A new `OFFER_BEAN` encounter handshake (mirroring the existing `OFFER_SEED` flow in [systems/encounter-trade.ts](../../../../packages/farm-valley/src/systems/encounter-trade.ts)) transfers the bean and applies a large positive trust delta from the *receiver* toward the *giver* via the existing `applyTrustDelta`.

## Design decisions (locked via grilling 2026-06-03)

- **Valuation = expected resale − personality margin, capped at affordable gold.** Per-personality flavor:
  - Aggressive — bids high, near full expected resale (wants to win, will overpay).
  - Conservative (Cora) — bids near reserve + small margin, only if comfortably affordable.
  - Hoarder (Hannah) — values *denying* others; bids to hold the scarce good.
  - Opportunist (Otto) — bids only when the resale margin over the current ask/reserve is high (arbitrage).
- **Bid logic lives per-personality in each `deliberate*` fn**, not a centralized system reading personality as a parameter — consistent with how every other intention is produced.
- **Format stays Vickrey** (the current default; second-price is the most interesting to watch). **Harden `resolveVickrey`'s tie-break** by adding a final `→ lowest bidderId` key (matching FPSB), so determinism is structural, not dependent on inbox insertion order.
- **Gifting reuses the peer-trust matrix** — winning the bean is farmer-vs-shop and has no peer to gain trust toward, so the *friendship* payoff is realized only when the bean is **gifted** to a peer (receiver → giver trust, large delta e.g. +0.20).
- **AP costs** (see Brief 28, AP economy): auction *entry/participate* = 2 AP, the bid itself = 0 AP; gifting = 1 AP. If Brief 28 is not yet merged, gate the AP wiring behind it but keep the costs as written.

## Files in scope

- `packages/farm-valley/src/agents/{aggressive,hoarder,opportunist,conservative}.ts` — add bid deliberation: on perceiving an open `AUCTION_CFP`, emit an `auction-bid` intention with a personality valuation + a `decisionTrace` reason.
- `packages/farm-valley/src/agents/bean-valuation.ts` — NEW: shared `expectedBeanValue(farmer, ctx)` helper (pure, deterministic).
- `packages/farm-valley/src/systems/auction.ts` — add the final `bidderId` tie-break key to `resolveVickrey`.
- `packages/farm-valley/src/systems/shopkeeper.ts` — handle **resale** of `golden_bean` back to the shop at the premium price; ensure the auction `AUCTION_RESULT` credits the bean to the winner's inventory.
- `packages/farm-valley/src/systems/encounter-trade.ts` — add `OFFER_BEAN` to the handshake; on accept, transfer the bean and apply the trust delta.
- `packages/farm-valley/src/protocols/encounter.ts` — add `OFFER_BEAN` ontology + body type.
- `packages/farm-valley/src/agents/peer-trade-registry.ts` — add a bean-gift hook surface per personality (who gifts, to whom, when).
- `packages/farm-valley/src/components.ts` — golden_bean must be representable in `inventory` (a counter alongside seeds/crops).
- Matching `*.test.ts` for each: a personality bids on a CFP; Vickrey resolves with a winner and is deterministic on tie; resale credits gold above reserve; a gift transfers the bean and moves trust.

## Files you must NOT touch

- The Dutch/English/FPSB resolution paths (only the Vickrey tie-break key changes).
- Engine source.

## Determinism guarantee

Bids must be a pure function of sim state (valuation via seeded `Rng` forks only — no `Math.random`). Same-tick bids resolve via the hardened tie-break. The gift hook fires deterministically (id-ascending farmer order, as `EncounterTradeSystem` already guarantees).

## Acceptance

- A full run's Activity feed shows auctions **with winners** (and gifts), not a wall of "no winner".
- `npm test` and `npm run typecheck` green.
- The "why" panel shows bid + gift reasons for the focused farmer.

## Follow-up / out of scope

- Per-client *preferred-gift lists* for arbitrary items (not just the bean) are part of the gifting economy in Brief 28/its follow-ups, not here.
