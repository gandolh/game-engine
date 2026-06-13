# Game Task 09 — Peer Seed Trades via MEET

**Status:** Done
> Condensed 2026-06-13 — original spec in git history.

`EncounterSystem` (brief 06) emitted `ONT_ENCOUNTER.MEET` but no personality acted on it. This brief wired peer-to-peer seed negotiation on co-location.

## What shipped

- `packages/farm-valley/src/protocols/encounter.ts` — `OfferSeedBody` extended with `direction: 'buy' | 'sell'` (sender's role); accept criteria: buyer-receiver accepts if `unitPrice <= 1.05 * shopSellPrice[crop]`; seller-receiver accepts if `unitPrice >= 0.9 * shopSellPrice[crop]`.
- `packages/farm-valley/src/agents/hoarder.ts` — on MEET, may emit a `peer-seed-offer` (BUY direction) intent toward the peer with a price/quantity heuristic.
- `packages/farm-valley/src/agents/{aggressive,conservative,opportunist}.ts` — evaluate incoming `OFFER_SEED` and ACCEPT/DECLINE per personality logic.
- `packages/farm-valley/src/systems/encounter-trade.ts` (new) — executes inventory + gold transfer on ACCEPT.
- New intent kinds in `components.ts`: `peer-seed-offer`, `peer-seed-response`.
- Tests: `encounter-trade.test.ts` (simulated MEET → OFFER_SEED → ACCEPT → inventory transfer); per-personality test updates.
- Trade prices are variable/negotiated, unlike fixed shop sales or shop-set slate seed-sales.
