# Brief 75 — Derive a principled formula for prices, AP, and initial gold, then re-tune every value

**Status:** todo · **Area:** `packages/sim-core` (economy/, systems/ap.ts, systems/shopkeeper/, world-setup.ts/sim-bootstrap.ts) · **Drafted:** 2026-06-11

The economy constants — crop/product/fruit sell prices, seed costs, AP costs + daily AP budget, and per-farmer starting gold — have accreted brief-by-brief (most recently brief 70's startGold bump). No single page explains *why* a tomato sells for N, why a daily AP budget is ~100, or what a day-1 gold balance buys. The numbers are individually plausible but were never derived from a shared model, so balance changes are guesswork and every tweak risks an invisible knock-on. **Goal: write down an explicit formula/model that ties these three axes together, sanity-check today's values against it, then update the constants to match — one coherent pass instead of more point-fixes.** ⚠️ This is a **sim balance change**: every seed's deterministic outcome shifts (the determinism *baseline* moves; reproducibility itself is untouched).

## Read first

- [corpus/briefs/game/done/70-raise-starting-gold-peer-trade-liquidity.md](../done/70-raise-starting-gold-peer-trade-liquidity.md) — the last economy lever (uniform startGold bump); reuse its instrumentation method and its "smallest lever, don't rebalance the arc" discipline.
- [corpus/wiki/open-questions.md](../../../wiki/open-questions.md) and [corpus/wiki/status.md](../../../wiki/status.md) — current balance state + open economy questions.
- Standing gotchas (memory): instrument with the **WASM pathfinder** (the JS one isn't route-equivalent), **keep runs small** (low `MAX_DAYS`, `TICKS_PER_DAY=20`), and **ask the user before any determinism check or sim run** (constrained hardware).
- The Python SPADE prototype README is the gameplay spec for design disagreements (see corpus source-of-truth ordering).

## Current state (the three axes — verify against code before tuning)

- **Prices.** Sell prices: `CROP_SELL_PRICE`/`QUALITY_MULTIPLIER` in [economy/crops.ts](../../../../packages/sim-core/src/economy/crops.ts), `PRODUCT_SELL_PRICE` in [economy/livestock.ts](../../../../packages/sim-core/src/economy/livestock.ts), `FRUIT_SELL_PRICE` in [economy/fruit.ts](../../../../packages/sim-core/src/economy/fruit.ts); aggregation in [economy/helpers.ts](../../../../packages/sim-core/src/economy/helpers.ts). Shop buy prices + auction reserve/resale in [systems/shopkeeper/constants.ts](../../../../packages/sim-core/src/systems/shopkeeper/constants.ts) (`AUCTION_RESERVE_PRICE = 50`, `GOLDEN_BEAN_RESALE_MULTIPLIER = 3`). Harbor contract multipliers in [economy/harbor.ts](../../../../packages/sim-core/src/economy/harbor.ts) (normal ×2.0 / silver ×2.5 / gold ×3.2). Seed costs flow through the deliberate helpers ([agents/conservative.ts](../../../../packages/sim-core/src/agents/conservative.ts), [agents/watering/plant.ts](../../../../packages/sim-core/src/agents/watering/plant.ts)).
- **AP.** [systems/ap.ts](../../../../packages/sim-core/src/systems/ap.ts): `AP_COST` table (per-intent), `AP_BASE_MAX = 100`, `AP_GROWTH_PER_DAY = 2`, tiered `tradeInitCost` (trust→1/2/3), `SHRINE_AP_BOOST = 12` (cd 5d), `HELPER_AP_BOOST = 25` (margin 25). Travel/pray are AP-free by design.
- **Initial gold.** Per-personality template `startGold` + per-farmer `startGold`/`minGoldReserve` in [sim-bootstrap.ts](../../../../packages/sim-core/src/sim-bootstrap.ts) and [world-setup.ts](../../../../packages/sim-core/src/world-setup.ts). Grep `startGold` for the full roster.

## Tasks

- [ ] **1. Build the model.** Pick the natural unit (proposed: **1 AP = the value of one unit of basic labour**, i.e. one plant/water/harvest action). Express everything in it: expected gold-per-AP for the staple crop loop (seed cost → AP to grow/water/harvest → sell price × expected quality mix), then sanity targets — e.g. *a full AP day of staple farming should net ≈ X gold*; *seed cost should be ≈ Y% of expected revenue*; *day-1 gold should fund ≈ Z plots + reserve*. Write the formula down (it's the deliverable, not just the new numbers).
- [ ] **2. Score today's values against the model.** Tabulate every crop/product/fruit's gold-per-AP and seed-payback; flag outliers (a crop that dominates, a dead AP sink, a seed cost that never pays back). Note where shop-buy vs peer-trade vs harbor-contract prices disagree on what a unit is "worth."
- [ ] **3. Re-derive the constants** from the model, smallest coherent change that removes the outliers. Preserve intended *relative* shape: personality startGold spread (Hannah richest, Atticus low-reserve gambler — do **not** flatten it), quality-tier and harbor-contract premiums, the shrine/helper AP top-ups as bounded catch-up levers. This is a re-tune to the formula, not a redesign of the mechanics.
- [ ] **4. Probe the arc.** On the standard seeds (`0xc0ffee`/`1`/`42`, ≤20 days × `TICKS_PER_DAY=20`, WASM) confirm: peer crop trades still close (no return to 100% `would-breach-reserve`), no farmer trivially buys out the day-1 shop slate, lead crossings still occur post-day-20, no AP axis goes slack or starves. Re-tune within the model if violated — don't compensate off-model.
- [ ] **5. Update fixtures/tests** asserting specific prices/AP/startGold values; `npm run typecheck` + `npm run test`.
- [ ] **6. Corpus:** write the model up as a wiki page (e.g. `wiki/economy.md`) linked from index.md; note the new baseline in status.md; log entry. Record that recorded run-descriptor URLs replay differently after this lands.

## Acceptance

- A written, checked-in formula relating prices ↔ AP ↔ initial gold, with a table scoring the (new) constants against it.
- All tests green; deterministic reproducibility still holds at the new baseline (fast 3-seed/3-day self-diff, run only with user sign-off).
- No regression vs brief 70's working peer-trade seeds; competitive arc shape preserved.

## Risks / notes

- **Outcome shift is accepted and expected** (like briefs 70/73/74) — say so in the log entry; don't silently re-tune anything outside the model in the same change.
- Scope guard: this is a *balance* pass over existing constants. New currencies, new sinks, or mechanic changes are out of scope — file a follow-up brief if the model exposes one.
- Watch knock-ons: shop-slate sellouts, hire-help/upgrade affordability creep, hoarder reserve behaviour, auction reserve vs new crop values.
