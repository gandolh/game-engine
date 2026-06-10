import type { AnimalKind, ProductKind } from "../components";

// ── Greenhouse economy (brief 43) ─────────────────────────────────────────────

/**
 * brief 43 — cost to build a greenhouse at the carpenter. This is the run's
 * heaviest single sink: it must be a genuine late-game decision (can I afford it,
 * is the run long enough to amortize off-season premium crops?). Like a pen
 * (brief 42's deliberation fix), it is GOLD-FUNDED with materials as an OPTIONAL
 * discount, so the patient personalities who bank gold but rarely chop/mine can
 * still commit — otherwise the feature reads as dormant (the AI never gathers the
 * raw prerequisite).
 *
 *   goldCost     — gold paid with no materials in hand.
 *   woodCost / stoneCost — materials consumed to earn the discount (optional).
 *   goldDiscount — gold saved when BOTH wood+stone are available and spent.
 *
 * With materials in hand the effective cost is ~120 gold + 20 wood + 12 stone;
 * gold-only it is 200. Either way far above a pen (barn = 75), so it lands well
 * into the run.
 */
export const GREENHOUSE_BUILD_COST: {
  goldCost: number;
  woodCost: number;
  stoneCost: number;
  goldDiscount: number;
} = { goldCost: 140, woodCost: 20, stoneCost: 12, goldDiscount: 50 };

/** Number of season-immune plots a greenhouse provides. */
export const GREENHOUSE_PLOT_COUNT = 4;

// ── Livestock economy constants (brief 42) ───────────────────────────────────

/**
 * Cost to build a pen at the carpenter.
 *
 * brief 42 (deliberation fix) — pens are now GOLD-FUNDED with wood as an OPTIONAL
 * discount, rather than wood-GATED. The original `woodCost`-gated recipe made the
 * feature dormant live: AI farmers almost never chop wood (it competes with
 * farming), so a hard wood prerequisite never cleared and ZERO pens were ever
 * built in a 100-day run. The carpenter stays relevant (build still happens
 * there; brief 44 will craft pens there too) and wood stays meaningful (it buys
 * a gold discount), but gold alone now suffices — which is what lets the patient
 * personalities (who bank plenty of gold) actually invest.
 *
 *   goldCost      — gold paid when the farmer has NO wood to spend.
 *   woodCost      — wood consumed to earn the discount (optional; 0 = pay full gold).
 *   goldDiscount  — gold saved when `woodCost` wood is available and spent.
 *
 * With wood in hand the effective cost matches the original recipe
 * (coop = 30 gold + 8 wood, barn = 50 gold + 12 wood).
 */
export const PEN_BUILD_COST: Record<
  "coop" | "barn",
  { goldCost: number; woodCost: number; goldDiscount: number }
> = {
  coop: { goldCost: 45, woodCost: 8,  goldDiscount: 15 },
  barn: { goldCost: 75, woodCost: 12, goldDiscount: 25 },
};

/** Gold cost to buy one animal at the village shopkeeper. */
export const ANIMAL_BUY_COST: Record<AnimalKind, number> = {
  chicken: 15,
  cow:     35,
  sheep:   30,
};

/** Which animal a pen kind can hold (coop → chicken; barn → cow or sheep). */
export const PEN_ANIMAL: Record<"coop" | "barn", AnimalKind[]> = {
  coop: ["chicken"],
  barn: ["cow", "sheep"],
};

/** Which product each animal produces daily. */
export const ANIMAL_PRODUCT: Record<AnimalKind, ProductKind> = {
  chicken: "egg",
  cow:     "milk",
  sheep:   "wool",
};

/** Base daily yield per animal (at full care). */
export const PRODUCT_YIELD_PER_ANIMAL: Record<AnimalKind, number> = {
  chicken: 1,
  cow:     1,
  sheep:   1,
};

/** Sell price per product unit (Normal quality). Quality multipliers apply. */
export const PRODUCT_SELL_PRICE: Record<ProductKind, number> = {
  egg:  8,
  milk: 12,
  wool: 14,
};

/** Daily care decay rate (applied each day; faster decay on unfed days). */
export const CARE_DECAY_RATE = 0.05;
/** Faster decay when pen is unfed. */
export const CARE_DECAY_UNFED = 0.12;
/** Amount care is raised by a `tend` action. */
export const CARE_TEND_BOOST = 0.20;
