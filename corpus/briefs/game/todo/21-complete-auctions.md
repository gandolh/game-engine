# Game Task 21 — Complete Auctions (English + FPSB)

## Context

`packages/farm-valley/src/systems/auction.ts` implements **Vickrey** (second-price sealed bid) and **Dutch** (descending clock) auctions fully, but the `english` and `fpsb` (first-price sealed bid) auction types are stubs: `openAuction` routes them through a Vickrey shell (see `auction.ts` ~line 150) and they always resolve to a **null winner**. The `AuctionType` union and the CFP/bid/result protocols already include all four types, so the data model is ready — only the state machines are missing. The Python SPADE prototype is the gameplay spec for auction semantics ([decisions.md](../../../wiki/decisions.md) → "Source of truth").

## Goal

1. **First-Price Sealed Bid (FPSB)**: like Vickrey but the winner pays their *own* bid (not the second price). Highest bid above reserve wins; deterministic tie-break by earliest `tickReceived` then lowest bidder id (match the existing Vickrey tie-break).
2. **English (ascending open outcry)**: a rising-price auction. Model it deterministically within the fixed-step sim — e.g. the price rises by an increment each tick; bidders re-affirm willingness via `AUCTION_BID` while the current price is within their valuation; the auction closes when no new affirming bid arrives for N ticks (or `closesAtTick`), and the last/highest affirming bidder wins at the current price. Keep the increment + no-bid-timeout configurable like `DutchAuctionOptions`.
3. **No silent fallthrough**: remove the `case "english": case "fpsb":` → Vickrey-shell branch. Each type gets its own state + resolution path. Update the TODO comment / class doc accordingly.

## Files in scope

- `packages/farm-valley/src/systems/auction.ts` — add `FpsbState` and `EnglishState` to the `AuctionState` union; implement `openAuction` branches, bid handling, clock advancement (for English), and `resolveFpsb` / `resolveEnglish`. Add an `EnglishAuctionOptions` (increment per tick, no-bid timeout) mirroring `DutchAuctionOptions`. Reuse `broadcastResult` / `uniqueParticipants`.
- `packages/farm-valley/src/systems/auction.test.ts` — add tests: FPSB winner pays own bid; FPSB reserve rejection; FPSB tie-break determinism; English ascending winner + price; English no-taker → null winner; English close-on-timeout. Mirror the existing Vickrey/Dutch test style.
- `packages/farm-valley/src/protocols/shop.ts` — ALLOWED only if `AuctionResultBody`/`AuctionCfpBody` need a field the new types require (e.g. a per-type option). Prefer no change; the union already lists all four types. Read it first.

## Files you must NOT touch

- `agents/**` — bidding strategy stays as-is; this brief makes the auction *mechanisms* work, not the bidders smarter. (A follow-up could teach personalities to bid in English/FPSB; out of scope here.)
- `shopkeeper.ts` beyond confirming how it calls `openAuction` (do not change its calling convention).
- `world/**`, `sim-bootstrap.ts`, `components.ts`, `ui/**`, `render-systems.ts`, engine source.

## Determinism note

English auctions advance on the fixed tick clock, exactly like Dutch — anchor the start tick on first observation (reuse the Dutch `startTick === null` pattern). No wall-clock, no randomness beyond the already-forked `auction` RNG. All tie-breaks must be deterministic.

## Acceptance criteria

- `npm run typecheck -w farm-valley` passes
- `npm run test -w farm-valley` passes (new FPSB + English tests; existing Vickrey/Dutch tests unchanged and green)
- `english` and `fpsb` auctions can produce a real (non-null) winner with correct paid price
- The `case "english": case "fpsb":` Vickrey-shell fallthrough is gone; the class doc no longer says they're TODO
- No `.js` import suffixes; no new runtime deps

## Workflow

You're the sonnet executor. Read this brief, then `auction.ts` in full and `auction.test.ts` for the Vickrey/Dutch patterns. Implement. Run typecheck + tests before reporting done. Report files changed, test counts, and anything surprising. Do not commit — orchestrator handles that.
