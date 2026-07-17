---
summary: The single prices-to-AP-to-initial-gold model the economy constants derive from, the crop g/AP formula, the scoring table, and the re-tune procedure.
updated: 2026-07-16
---

# Economy model (prices ↔ AP ↔ initial gold)

The single model the economy constants are derived from. Written for [brief 75](../briefs/game/done/75-economy-rebalance-formula.md) (2026-06-11), which re-tuned the crop axis to this model. **Before this, the constants had accreted brief-by-brief with no shared model** — individually plausible, never scored against each other.

> ⚠️ **Changing any number here moves the deterministic sim baseline** (reproducibility is untouched; the *outcome* for a given seed shifts). Recorded run-descriptor URLs replay differently after a re-tune. Re-verify with the fast 3-day/3-seed `EXPORT=json` self-diff (not a full `CHECK_DETERMINISM`) and a ≤20-day arc probe.

## The unit

**1 AP = one unit of basic farm labour** — one `plant`, `water`, or `harvest` action (each costs 1 AP in [systems/ap.ts](../../games/farm/sim-core/src/systems/economy/ap.ts)). Everything is scored in **gold per AP** of the staple crop loop.

## The crop loop formula

For crop `c`, one plot-cycle:

```
labour      L_c = 1 (plant) + w_c (waters) + 1 (harvest)
waters      w_c = G_c                  // growth only advances on WATERED days (crop-growth.ts:46);
                                        // rain auto-waters uniformly across crops, so it's a flat
                                        // discount on w_c that does not change RELATIVE g/AP.
yield       Y   = 2 units / plot        // harvest.ts:80  Math.round(2*(1+boost)); uniform across crops
revenue     R_c = Y · P_c               // P_c = CROP_SELL_PRICE (net-worth basis, the authoritative unit value)
profit      π_c = Y · P_c − S_c         // S_c = SEED_COST (one seed → one plot → Y units)
score       g_c = π_c / L_c   = (2·P_c − S_c) / (G_c + 2)      ← gold per AP
```

`P_c` is `CROP_SELL_PRICE` because the competition is scored on **net worth**, which values inventory at `CROP_SELL_PRICE × quality multiplier`. `SHOP_BUY_PRICE` is a *separate, discounted liquidation channel* (~64% of `P_c`) — a farmer who dumps to the shop takes a haircut vs the net-worth value of holding/selling at reference. Quality (silver ×1.25 / gold ×1.5, [crops.ts](../../games/farm/sim-core/src/economy/crops.ts)) is husbandry-earned upside on top of `g_c`, not modelled in the base score.

## Target shape (brief 75, option B — mild deliberate gradient)

Not flat: longer-grow, later-season, higher-tier crops keep a **modest** g/AP edge (reward for commitment + season-gating risk), but the dominance/dead-weight outliers are removed. Target spread ≈ **1.5×** (was 2.64×).

## Scoring table — old vs re-tuned (2026-06-11)

`g = (2P − S)/(G+2)`. Old spread radish→grape = **2.64×** (radish dead-weight at 2.75, grape dominant at 7.27). New spread = **1.59×**.

| crop | G | L=G+2 | P old→new | S old→new | g old | **g new** |
|---|---|---|---|---|---|---|
| radish        | 2 | 4  | 8 → **9**   | 5 → 5   | 2.75 | **3.25** |
| carrot        | 3 | 5  | 11 → **12** | 6 → 6   | 3.20 | **3.60** |
| wheat         | 4 | 6  | 14 → **15** | 8 → 8   | 3.33 | **3.67** |
| tomato        | 5 | 7  | 20 → 20     | 10 → 10 | 4.29 | **4.29** |
| winter-squash | 5 | 7  | 22 → **21** | 9 → **11** | 5.00 | **4.43** |
| corn          | 6 | 8  | 26 → **25** | 12 → **13** | 5.00 | **4.63** |
| pumpkin       | 7 | 9  | 35 → **30** | 15 → 15 | 6.11 | **5.00** |
| grape         | 9 | 11 | 50 → **38** | 20 → **19** | 7.27 | **5.18** |

**Smallest coherent change:** mid crops (tomato) barely move; the two dominators (grape, pumpkin) come down; the dead-weight low (radish) and the spring starters lift. Seed costs move ≤2 except where they hold the seed-payback ratio (~25% of gross `2P`). Monotonic-by-tier gradient preserved.

### Derived / knock-on constants

- **`SHOP_BUY_PRICE`** ([shopkeeper/constants.ts](../../games/farm/sim-core/src/systems/shopkeeper/constants.ts)) — re-scaled to a **uniform ~64% of the new `CROP_SELL_PRICE`** (was 0.57–0.65 per-crop, an unintended discrepancy): radish 6, carrot 8, wheat 10, tomato 13, winter-squash 13, corn 16, pumpkin 19, grape 24.
- **Harbor contracts** ([economy/harbor.ts](../../games/farm/sim-core/src/economy/harbor.ts)) — reward = `mult × CROP_SELL_PRICE × qty` (×2.0/2.5/3.2). **Auto-follows** the new prices; no constant change. Still the richest crop channel (planning + travel premium), as intended.
- **`AUCTION_RESERVE_PRICE = 50`**, **`GOLDEN_BEAN_RESALE_MULTIPLIER = 3`** — unchanged. The golden bean is an aspirational collectible deliberately priced *above* the top crop (now 38); resale 150 stays a genuine windfall.

## Axes intentionally NOT re-tuned (scored, within model)

- **AP costs / `AP_BASE_MAX=100` / `AP_GROWTH_PER_DAY=2`** ([ap.ts](../../games/farm/sim-core/src/systems/economy/ap.ts)) — the AP table *defines* the unit; keeping it fixed is what lets prices be expressed in it. Growing daily budget + sleep gate + free travel are the intended pacing, not balance outliers.
- **`startGold` / `minGoldReserve`** — the personality spread (Hannah richest 150/80, Atticus low-reserve gambler 110/10, Cora cautious 80/30, Otto 100/50, Pip 90/0) is *intentional character shape* ([brief 70](../briefs/game/done/70-raise-starting-gold-peer-trade-liquidity.md)). New seed costs are ≈ old (radish 5, wheat 8, etc.), so day-1 affordability (≈ funds several plots + reserve) is unchanged. Left as-is.
- **Livestock products** (egg 8 / milk 12 / wool 14) and **fruit** (apple 18 / cherry 20) — a *different capital loop*: heavy upfront capital (pen 45–75 + animal 15–35; tree 20–25, 20-day maturation) + ongoing care/decay, then a daily/seasonal trickle. Their higher per-tend g/AP is the intended **premium for sinking capital**, not a crop-loop outlier. Re-tuning them is out of scope for brief 75 (would be a new brief); flagged here so the next balance pass scores them explicitly.

## The market wall — the peer-to-peer goods channel (brief 98, 2026-07-11)

A third crop channel next to the shopkeeper (instant liquidation at ~64% of `P_c`) and the synchronous encounter trade: an **asynchronous** wall where farmers list stock and other farmers buy it, at prices the sellers pick.

- **Prices.** Aggressive lists at `CROP_SELL_PRICE` (`P_c`); opportunist lists at its own `FAIR_PRICE` table. Buyers gate on a multiple of `P_c` — aggressive buys only undercuts (`< 0.9·P_c`), hoarder up to `1.05·P_c`, opportunist up to `1.1·P_c`. So the wall clears **above** the shopkeeper's 64% haircut: it is the better exit for a patient seller, which is exactly the point of the channel.
- **Escrow.** `POST_OFFER` moves the goods off the seller immediately (`debitCropDetailed`, quality tiers preserved). Listed stock is therefore *not* in inventory and *not* on the net-worth leaderboard until it sells or comes back. That is a real carrying cost of listing, and it is why unsold offers are swept back after **`OFFER_TTL_DAYS = 3`** and why the three wall personalities pull their listings (`sell-from-wall` → `CANCEL_OFFER`) once `daysRemaining ≤ 3`.
- **Value conservation.** A trade moves gold buyer→seller and stock wall-escrow→buyer at the **offer's** price (never the price the buyer's stale belief claimed). Nothing is minted or burned; asserted in `market.test.ts` ("a wall trade conserves gold and stock").
- **Baseline.** Wiring this loop **moved the sim baseline by design** (the wall was dead before — offers accumulated, no BUY_REQUEST was ever consumed). A 40-day run closes ~35–50 wall trades per seed.

## Skill-gated non-farm valuation (2026-07-16 todo — skill-gated intentions)

The deliberation layer now scores non-farm lines in the SAME g/AP unit via
[agents/skill-valuation.ts](../../games/farm/sim-core/src/agents/skill-valuation.ts). **No economy
constant changed** — every marginal is *derived* from the live tables + the act handlers' own skill
curves, so a price re-tune moves the agent valuations automatically:

- **Farming baseline** `FARM_BASELINE_GPA` = mean `g_c` over the table above (≈4.26 post-brief-75);
  a farmer's own farming marginal scales up with `farmingQualityBonus` (max +25%).
- **Fishing** = expected coral value at the farmer's tier (`applyCoralRarityBonus` ×
  `fishingRarityBonus`, the exact handler math) / `AP_COST["fish-coral"]` — the one non-farm line
  that can *beat* the farm baseline at high tier, which is what makes chasing it rational.
- **Foraging** = max(local bush-gather support ≈ `0.85→1.25×` baseline with tier, seasonal
  autumn/winter zone gold × `foragingGoldMultiplier` / `AP_COST.forage`).
- **Mining** = support proxy `0.85→1.0×` baseline with tier (ore/geodes feed upgrades, not gold) —
  deliberately capped **below** farming so a mining-leaner specialises without topping the wealth
  board.

Behavioural layer on top: `nonFarmAffinity` (owned stone/bush endowment ≥3, else a deterministic
name-hash bucket), `TEMPERAMENT` diversify scalars (conservative 0.25 → opportunist 1.0 +
chase-best), and `nonFarmFocus.commit` rising with tier — the divergence flywheel. Cadence is
applied via `gatherBias` (boosted owned-vein gathering for mining/foraging) and
`deliberateSkilledNonFarm` (front-priority fishing/forage-zone excursions), replacing the old
per-personality hardcoded fishing/forage calls. Baseline-shift note: this moves the deterministic
sim baseline for a given seed (behavioural change, reproducibility untouched) — divergence evidence
lives in `tools/run-sim/src/probes/probe-skill-diverge.ts` (run with `PATHFINDER=wasm`; the JS
fallback cannot route some excursion targets).

## How to re-tune (procedure)

1. Edit the target `g_c` gradient above; solve `P_c = g_c·L_c / (1 − ρ)` with `ρ = S_c/(2·P_c) ≈ 0.25`, round to clean integers, recompute realized `g_c`.
2. Re-scale `SHOP_BUY_PRICE` to ~64% of the new `CROP_SELL_PRICE`.
3. Update fixtures that hard-assert prices ([shopkeeper.test.ts](../../games/farm/sim-core/src/systems/shopkeeper.test.ts), [shop-slate.test.ts](../../games/farm/sim-core/src/agents/shop-slate.test.ts), [act.test.ts](../../games/farm/sim-core/src/systems/act.test.ts) where seed costs changed).
4. Fast 3-seed/3-day `EXPORT=json` self-diff (reproducibility) + ≤20-day arc probe (peer trades still close, no day-1 slate buyout, post-day-20 lead crossings, no slack/starved AP axis). Re-tune within the model if violated — never compensate off-model.
