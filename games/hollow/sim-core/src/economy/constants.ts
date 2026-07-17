/**
 * Hollow M1 economy — every tunable number in the sim derives from ONE
 * target: "an agent that lets a need bottom out can recover it in a short,
 * legible burst of dedicated work/harvest (~10 ticks), and a resource node
 * can absorb that burst many times over before it needs to lean on
 * regeneration." Everything below is arithmetic from that target, not a
 * separately-guessed number, so changing the target re-derives the whole
 * table.
 *
 * All five needs share the same MIN..MAX = 0..100 range (uniform scale keeps
 * fractions/thresholds comparable across needs in beliefs, tests, and the
 * snapshot).
 *
 * ── food ──────────────────────────────────────────────────────────────────
 * FOOD_DECAY_PER_TICK = 0.5/tick → an unfed agent empties in MAX/decay =
 *   100/0.5 = 200 ticks. That runway has to comfortably exceed both (a) the
 *   longest possible walk to a node and (b) the margin left once the
 *   seek-threshold fires (see SEEK_THRESHOLD_FRACTION below) — the grid's
 *   longest single-axis crossing is GRID_SIZE-1 = 63 tiles, and movement is
 *   1 tile/tick (`stepToward` in systems/act.ts), so 200 ticks is generous.
 * FOOD_HARVEST_PER_TICK = 10 goods/tick while standing on a food node;
 *   FOOD_VALUE_PER_UNIT = 1 need-point/good-unit → refilling food from empty
 *   takes MAX / (HARVEST * VALUE) = 100/(10*1) = 10 ticks — the target burst.
 *
 * ── rest ──────────────────────────────────────────────────────────────────
 * Rest has no node (brief scope: only food + work are located; resting
 * happens in place). REST_DECAY_PER_TICK = 0.25/tick → empties in 400 ticks
 * (agents don't need to rest nearly as often as they need to eat).
 * REST_RECOVER_PER_TICK = 8 need-points/tick while resting → refilling from
 * empty takes 100/8 = 12.5 ticks, the same short-burst shape as food.
 *
 * ── wealth ────────────────────────────────────────────────────────────────
 * Modeled as a depleting need (not a monotonically-growing stat) because
 * there is no market yet (hollow-06): "upkeep" drains it —
 * WEALTH_DECAY_PER_TICK = 0.2/tick, empties in 500 ticks — and working a
 * material node converts produced goods straight into satisfaction (no
 * separate "sell" step): MATERIAL_HARVEST_PER_TICK = 5 goods/tick,
 * WEALTH_PER_MATERIAL_UNIT = 2 need-points/unit → refilling wealth from
 * empty takes 100/(5*2) = 10 ticks — again the target burst.
 *
 * ── safety, belonging ────────────────────────────────────────────────────
 * SAFETY_DECAY_PER_TICK = BELONGING_DECAY_PER_TICK = 0 — static stubs per
 * hollow-03's scope (no threats, no relationships yet). hollow-04/06 give
 * these real decay/replenishment once there is something to threaten or
 * bond over.
 *
 * ── deliberation thresholds ──────────────────────────────────────────────
 * SEEK_THRESHOLD_FRACTION = 0.4 (of range) — the villager deliberator seeks a
 *   food node once food need drops to 40% (40 points remaining), well before
 *   zero, leaving ~120 ticks of the 200-tick runway as travel+harvest margin.
 * REST_SEEK_THRESHOLD_FRACTION = 0.3 — same idea for rest, tuned tighter
 *   since rest never blocks survival, only opportunity cost (a resting agent
 *   isn't producing wealth).
 *
 * ── starvation signal (population regulator, mechanism only) ─────────────
 * STARVATION_TICKS = 60 consecutive ticks at food-need-minimum before the
 *   starvation signal fires — a grace window so a single unlucky tick at a
 *   just-emptied node doesn't immediately flag an agent; what happens once
 *   it fires is hollow-05's call (death), not this brief's.
 *
 * ── default population + node supply ──────────────────────────────────────
 * DEFAULT_POPULATION = 40. Pure long-run throughput math says demand =
 *   population * FOOD_DECAY_PER_TICK = 40 * 0.5 = 20 units/tick, so any
 *   supply (foodNodeCount * regenPerTick) above that should be "ample". In
 *   practice it isn't enough headroom: `nearestNode` is a per-agent nearest-
 *   node pick, so agents that happen to cluster spatially converge on the
 *   SAME node and can jointly out-harvest its regen even when the town-wide
 *   average is fine, and travel time to a sparse set of nodes eats into the
 *   need's runway before harvesting even starts. Measured by sweeping
 *   foodNodeCount/regen at DEFAULT_POPULATION over many seeds
 *   (sim-bootstrap.scarcity.test.ts's calibration run): supply needs to be
 *   roughly an order of magnitude over the pure-throughput demand, not
 *   1.5x, before starvation reliably reaches zero across seeds. DEFAULT_
 *   FOOD_NODE_COUNT = 16 * FOOD_NODE_REGEN_PER_TICK = 14/tick = 224
 *   units/tick — ~11x the 20/tick pure-throughput demand — is the smallest
 *   configuration in that sweep that came back at 0 starving agents across
 *   every seed tried. A scarcity test cuts foodNodeCount/regen (and/or
 *   maxStock) well below this instead of changing the default.
 *   Material-node supply is set with the same order-of-magnitude margin in
 *   mind (wealth upkeep demand = 40 * 0.2 = 8/tick) but is NOT independently
 *   calibrated the way food is — there is no acceptance test on wealth
 *   scarcity in this chunk, so treat MATERIAL_NODE_COUNT/regen as a
 *   reasonable default, not an empirically-tight one.
 */

// Shared need range.
export const NEED_MIN = 0;
export const NEED_MAX = 100;

// Need kind keys (Needs.byKind is a plain Record<string, Need> in the engine
// kernel — named constants avoid stringly-typed typos across this package).
export const NEED_FOOD = "food";
export const NEED_REST = "rest";
export const NEED_WEALTH = "wealth";
export const NEED_SAFETY = "safety";
export const NEED_BELONGING = "belonging";

// Inventory good kinds hollow-03 actually produces.
export const GOOD_FOOD = "food";
export const GOOD_MATERIALS = "materials";

// food
export const FOOD_DECAY_PER_TICK = 0.5;
export const FOOD_HARVEST_PER_TICK = 10;
export const FOOD_VALUE_PER_UNIT = 1;
export const SEEK_THRESHOLD_FRACTION = 0.4;

// rest
export const REST_DECAY_PER_TICK = 0.25;
export const REST_RECOVER_PER_TICK = 8;
export const REST_SEEK_THRESHOLD_FRACTION = 0.3;

// wealth
export const WEALTH_DECAY_PER_TICK = 0.2;
export const MATERIAL_HARVEST_PER_TICK = 5;
export const WEALTH_PER_MATERIAL_UNIT = 2;

// safety, belonging — static stubs (hollow-04/06 give these real dynamics).
export const SAFETY_DECAY_PER_TICK = 0;
export const BELONGING_DECAY_PER_TICK = 0;

// starvation signal
export const STARVATION_TICKS = 60;

// default population + node supply (see derivation above)
export const DEFAULT_POPULATION = 40;
export const DEFAULT_FOOD_NODE_COUNT = 16;
export const DEFAULT_MATERIAL_NODE_COUNT = 8;
export const FOOD_NODE_MAX_STOCK = 300;
export const FOOD_NODE_REGEN_PER_TICK = 14;
export const MATERIAL_NODE_MAX_STOCK = 300;
export const MATERIAL_NODE_REGEN_PER_TICK = 6;

// Per-agent decay-rate jitter range applied at seeding time (population.ts) —
// the "simple seeded kind + rates" variation the brief asks for in place of
// full genetics (hollow-05).
export const DECAY_RATE_JITTER_MIN = 0.85;
export const DECAY_RATE_JITTER_MAX = 1.15;
