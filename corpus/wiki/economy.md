# Economy model (prices ↔ AP ↔ initial gold)

The single model the economy constants are derived from. Written for [brief 75](../briefs/game/done/75-economy-rebalance-formula.md) (2026-06-11), which re-tuned the crop axis to this model. **Before this, the constants had accreted brief-by-brief with no shared model** — individually plausible, never scored against each other.

> ⚠️ **Changing any number here moves the deterministic sim baseline** (reproducibility is untouched; the *outcome* for a given seed shifts). Recorded run-descriptor URLs replay differently after a re-tune. Re-verify with the fast 3-day/3-seed `EXPORT=json` self-diff (not a full `CHECK_DETERMINISM`) and a ≤20-day arc probe.

## The unit

**1 AP = one unit of basic farm labour** — one `plant`, `water`, or `harvest` action (each costs 1 AP in [systems/ap.ts](../../packages/sim-core/src/systems/ap.ts)). Everything is scored in **gold per AP** of the staple crop loop.

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

`P_c` is `CROP_SELL_PRICE` because the competition is scored on **net worth**, which values inventory at `CROP_SELL_PRICE × quality multiplier`. `SHOP_BUY_PRICE` is a *separate, discounted liquidation channel* (~64% of `P_c`) — a farmer who dumps to the shop takes a haircut vs the net-worth value of holding/selling at reference. Quality (silver ×1.25 / gold ×1.5, [crops.ts](../../packages/sim-core/src/economy/crops.ts)) is husbandry-earned upside on top of `g_c`, not modelled in the base score.

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

- **`SHOP_BUY_PRICE`** ([shopkeeper/constants.ts](../../packages/sim-core/src/systems/shopkeeper/constants.ts)) — re-scaled to a **uniform ~64% of the new `CROP_SELL_PRICE`** (was 0.57–0.65 per-crop, an unintended discrepancy): radish 6, carrot 8, wheat 10, tomato 13, winter-squash 13, corn 16, pumpkin 19, grape 24.
- **Harbor contracts** ([economy/harbor.ts](../../packages/sim-core/src/economy/harbor.ts)) — reward = `mult × CROP_SELL_PRICE × qty` (×2.0/2.5/3.2). **Auto-follows** the new prices; no constant change. Still the richest crop channel (planning + travel premium), as intended.
- **`AUCTION_RESERVE_PRICE = 50`**, **`GOLDEN_BEAN_RESALE_MULTIPLIER = 3`** — unchanged. The golden bean is an aspirational collectible deliberately priced *above* the top crop (now 38); resale 150 stays a genuine windfall.

## Axes intentionally NOT re-tuned (scored, within model)

- **AP costs / `AP_BASE_MAX=100` / `AP_GROWTH_PER_DAY=2`** ([ap.ts](../../packages/sim-core/src/systems/ap.ts)) — the AP table *defines* the unit; keeping it fixed is what lets prices be expressed in it. Growing daily budget + sleep gate + free travel are the intended pacing, not balance outliers.
- **`startGold` / `minGoldReserve`** — the personality spread (Hannah richest 150/80, Atticus low-reserve gambler 110/10, Cora cautious 80/30, Otto 100/50, Pip 90/0) is *intentional character shape* ([brief 70](../briefs/game/done/70-raise-starting-gold-peer-trade-liquidity.md)). New seed costs are ≈ old (radish 5, wheat 8, etc.), so day-1 affordability (≈ funds several plots + reserve) is unchanged. Left as-is.
- **Livestock products** (egg 8 / milk 12 / wool 14) and **fruit** (apple 18 / cherry 20) — a *different capital loop*: heavy upfront capital (pen 45–75 + animal 15–35; tree 20–25, 20-day maturation) + ongoing care/decay, then a daily/seasonal trickle. Their higher per-tend g/AP is the intended **premium for sinking capital**, not a crop-loop outlier. Re-tuning them is out of scope for brief 75 (would be a new brief); flagged here so the next balance pass scores them explicitly.

## How to re-tune (procedure)

1. Edit the target `g_c` gradient above; solve `P_c = g_c·L_c / (1 − ρ)` with `ρ = S_c/(2·P_c) ≈ 0.25`, round to clean integers, recompute realized `g_c`.
2. Re-scale `SHOP_BUY_PRICE` to ~64% of the new `CROP_SELL_PRICE`.
3. Update fixtures that hard-assert prices ([shopkeeper.test.ts](../../packages/sim-core/src/systems/shopkeeper.test.ts), [shop-slate.test.ts](../../packages/sim-core/src/agents/shop-slate.test.ts), [act.test.ts](../../packages/sim-core/src/systems/act.test.ts) where seed costs changed).
4. Fast 3-seed/3-day `EXPORT=json` self-diff (reproducibility) + ≤20-day arc probe (peer trades still close, no day-1 slate buyout, post-day-20 lead crossings, no slack/starved AP axis). Re-tune within the model if violated — never compensate off-model.
