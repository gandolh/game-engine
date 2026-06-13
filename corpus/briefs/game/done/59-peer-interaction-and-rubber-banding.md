# Brief 59 — Light up peer interaction + dent the leader runaway

**Status:** Done (2026-06-10)
> Condensed 2026-06-13 — original spec in git history.

Goal: make the existing peer-trade handshake and trust matrix actually fire in steady-state play, activating the dormant brief-37 trust grid and rivalry layer. Rubber-banding (Lever B) was secondary.

## Root cause (historically important)

Two compounding bugs blocked ALL peer trades — the corpus had mistakenly framed this as "dormant drama mechanics"; a probe run revealed the real culprits:

1. **Price reference wrong.** Seed trades priced bids against `CROP_SELL_PRICE` (radish 8) instead of `SEED_COST` (radish 5) — every responder floor sat far above any bid, so 100% of offers declined `price-too-low`. Fixed in [peer-trade-policy.ts](../../../../packages/sim-core/src/agents/peer-trade-policy.ts) and [hoarder.ts](../../../../packages/sim-core/src/agents/hoarder.ts).
2. **No tradeable surplus in the seed economy.** Farmers plant just-in-time and never hold >2 seeds — seed-only trades structurally can't close. The real surplus is harvested crops.

## What shipped

- Extended encounter protocol with `OFFER_CROP` in [protocols/encounter.ts](../../../../packages/sim-core/src/protocols/encounter.ts) (`ENCOUNTER_ONTOLOGIES`).
- Generalized policy factories with `commodity: "seed" | "crop"` param; crop trades priced vs `CROP_SELL_PRICE`, transfer `inventory.crops` + keep `cropQuality.normal` consistent.
- Added `initiateCrop`/`respondCrop` registry hooks per personality: hoarder = crop SELLER (threshold 6, 2-unit parcels @ 0.95×shop); opportunist/aggressive = crop BUYERS; conservative = cautious bargain buyer.
- Moved lower-id initiator guard to apply only to seed offers, so hoarder (often higher id) can sell its surplus.
- **Lever B (rubber-banding) not shipped.** The 21-farmer radial field (post-55–58 reorg) already self-distributes; all 3 seeds had post-day-20 lead crossings. Recorded as conscious decision, not silent miss.

## Measured outcome (WASM, 100d, ticksPerDay=20, seeds 0xc0ffee/1/42)

- Before: 5/9/25 `OFFER_SEED`, **0 ACCEPT**, ~1 trust map.
- After: crop offers fire on all seeds; ACCEPT > 0 on 0x1 & 0x2a (~21 trades on 0x2a); trust maps non-empty on **all 3** seeds (4/3/9 farmers). Brief-37 grid no longer all-neutral.
- Determinism: MATCH ×3 at ticksPerDay=20 on WASM.
- +3 crop-trade tests in [encounter-trade.test.ts](../../../../packages/sim-core/src/systems/encounter-trade.test.ts); 607 sim-core tests green.

## Residual

`0xc0ffee` fires crop offers but cash-poor early-game buyers decline `would-breach-reserve` — in-character constraint, not a bug. Seed `initiate` hooks remain but rarely close (no seed surplus). Deeper peer-economy work is a future lever.
