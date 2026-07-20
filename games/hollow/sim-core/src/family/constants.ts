/**
 * Hollow M2 lifecycle / genetics / pair-bonding / reproduction — chunk
 * hollow-05. Every tunable below is a DIAL, not a physical law (mirrors
 * economy/constants.ts's and community/constants.ts's "one derivation, not
 * separately-guessed numbers" framing), collected in ONE documented block
 * per the brief.
 *
 * ── tick-scale derivation ───────────────────────────────────────────────
 * Ticks here are RAW ticks — the same unit as economy/constants.ts's decay
 * rates and STARVATION_TICKS. `ticksPerDay` is a label carried through
 * `HollowSimOptions` with no day/night effect yet (see sim-bootstrap.ts), so
 * a lifespan measured in ticks means the same thing at ticksPerDay=20 (this
 * package's fast test scale) and ticksPerDay=1200 (the default, matching
 * @tool/run-sim's TICKS_PER_DAY).
 *
 *   STAGE_CHILD_ADULT_TICKS = 200 — a child becomes an adult at 200 ticks
 *     old (comparable to the ~200-tick full runway a starved agent gets to
 *     recover from empty food, economy/constants.ts) — old enough that a
 *     founder-scale population isn't flooded with children immediately,
 *     young enough that a newborn visibly grows up within a modest test run.
 *   STAGE_ADULT_ELDER_TICKS = 8000 — the adult (pairbond/reproduce) window
 *     is the long middle stretch. Elders then live, informally, roughly
 *     another ~1000-1500 ticks (the OLD_AGE_HAZARD_* curve below makes death
 *     overwhelmingly likely by then) — an informal LIFESPAN_TICKS ~= 9000,
 *     about 7.5 in-game days at the default 1200-tick day: a "long watching
 *     session", not a full 100-day season, so dynasties (parent -> child ->
 *     grandchild) are visible within a modest fraction of a full run.
 *
 *   population.ts deliberately does NOT draw a founder's starting age from
 *   the FULL [childAdultTicks, adultElderTicks) band — only its first HALF.
 *   This is a load-bearing choice, not just flavor: hollow-03/04's existing
 *   acceptance tests (sim-bootstrap.scarcity.test.ts,
 *   sim-bootstrap.community.test.ts) assert EXACT population counts (no
 *   deaths) over 600-1200-tick windows that predate lifecycle. Restricting
 *   founders to the first half of the adult band guarantees (structurally,
 *   not just "probably") that EVERY founder needs at least half the band's
 *   width before it can even become `elder` — with the numbers above,
 *   (8000-200)/2 = 3900 ticks minimum, comfortably above any existing
 *   test's window, so hollow-03/04's population-count assumptions hold
 *   exactly, not just "usually". A newer, shorter-tick-budget test that
 *   wants to observe old-age death overrides `childAdultTicks`/
 *   `adultElderTicks` via `HollowSimOptions` instead of relying on drawing
 *   an unlucky near-boundary age (see sim-bootstrap.family.test.ts).
 *
 * ── population stability ────────────────────────────────────────────────
 * BIRTH_CHANCE/BIRTH_WINDOW_TICKS/GESTATION_TICKS and the OLD_AGE_HAZARD_
 * curve / STARVATION_DEATH_TICKS are tuned together so a DEFAULT_POPULATION
 * (economy/constants.ts) run neither explodes nor collapses to zero over a
 * long run — see sim-bootstrap.family.test.ts's population-stability
 * acceptance test (which, like the death-cause tests, overrides these
 * defaults down to a short-tick-budget scenario rather than running the
 * full multi-thousand-tick default pace). BIRTH_WINDOW_TICKS +
 * GESTATION_TICKS (the minimum possible ticks from a household forming to
 * its first possible birth) is ALSO deliberately kept above the same
 * legacy-test safety margin as the stage thresholds above, so a birth can
 * never complete within hollow-03/04's existing windows either. Like
 * economy/constants.ts's own derivation, this whole table can be
 * re-derived wholesale if the target changes.
 */

// --- stage thresholds (see tick-scale derivation above) -------------------

export const STAGE_CHILD_ADULT_TICKS = 200;
export const STAGE_ADULT_ELDER_TICKS = 8000;

// --- old-age death hazard ---------------------------------------------------

/** Per-tick death probability rolled ONLY for `elder`-stage agents, right at
 *  the elder threshold. */
export const OLD_AGE_HAZARD_BASE = 0.0004;

/** Added to the hazard per tick spent past the elder threshold — the curve
 *  RISES with age so death becomes overwhelmingly likely well before an
 *  elder could live forever (the hazard hits OLD_AGE_HAZARD_MAX below by
 *  roughly 1650 ticks past elder onset). */
export const OLD_AGE_HAZARD_PER_TICK = 0.00003;

/** Clamp so the per-tick roll never exceeds this, however old an elder gets. */
export const OLD_AGE_HAZARD_MAX = 0.05;

// --- starvation death -------------------------------------------------------

/** Consecutive ticks `beliefs.data.foodDepletedTicks` (tracked by
 *  HollowPerceiveSystem, hollow-03) must hold at/above this before
 *  starvation actually kills — a strictly larger threshold than
 *  STARVATION_TICKS (economy/constants.ts's onset-belief grace window, 60),
 *  so death is a further-escalated consequence of the SAME signal, not a
 *  separate mechanism. Also kept comfortably above the legacy-test safety
 *  margin (see header) — e.g. sim-bootstrap.scarcity.test.ts runs a
 *  deliberately-starving population for 600 ticks and expects them to still
 *  be alive-and-starving at the end, not dead and gone. */
export const STARVATION_DEATH_TICKS = 3000;

// --- pair-bonding ------------------------------------------------------------

/** Mutual-trust floor (UNIT_TRUST_SCALE 0..1, neutral 0.5) — BOTH directed
 *  scores between a candidate pair must clear this for `HollowPairBondSystem`
 *  to consider them eligible. */
export const PAIRBOND_TRUST_THRESHOLD = 0.65;

/** Trait-compatibility floor (see `traitCompatibility` in
 *  family/pairbond-system.ts — 1 minus the normalized L1 distance over
 *  PAIRBOND_COMPAT_GENES). */
export const PAIRBOND_COMPAT_THRESHOLD = 0.6;

/** Chebyshev-tile radius within which two candidates count as "close enough
 *  right now" to pair-bond. */
export const PAIRBOND_PROXIMITY_TILES = 3;

/** Fixed subset of `BEHAVIOR_GENES` (components/genome.ts) the trait-
 *  compatibility metric is computed over — a deliberately small subset (not
 *  all seven genes) so compatibility isn't dominated by genes that have
 *  nothing to do with "do these two get along" (e.g. `risk`, `greed`). */
export const PAIRBOND_COMPAT_GENES = ["sociability", "loyalty", "curiosity"] as const;

// --- reproduction ------------------------------------------------------------

/** How often (in ticks) each household rolls for a new pregnancy — periodic,
 *  mirrors COMMUNITY_CHECK_INTERVAL_TICKS's "not every tick" cadence rather
 *  than an every-tick coin flip with a tiny probability. Also the first
 *  addend of the legacy-test safety margin — see header. */
export const BIRTH_WINDOW_TICKS = 500;

/** Chance of conceiving on a birth-window roll that clears the food-security
 *  gate below — tuned alongside the death hazards for population stability
 *  (see header). */
export const BIRTH_CHANCE = 0.35;

/** Neither partner may be below this fraction of the `food` need (nor
 *  currently `starving`) for a household's birth-window roll to even
 *  attempt conception — couples reproduction to scarcity: a starving
 *  village doesn't grow. */
export const BIRTH_FOOD_SECURITY_FRACTION = 0.4;

/** Density-dependent birth regulator (the load-bearing population stabilizer).
 *  The per-partner food-security gate above is a BIMODAL signal — the villager
 *  AI keeps everyone fed right up until food suddenly crashes, so on its own it
 *  lets births run free and then triggers a mass-starvation bust rather than a
 *  smooth brake. This target turns it into a GRADED, logistic brake: the
 *  effective birth chance is scaled by `clamp(foodSupplyPerCapita / target)`,
 *  where `foodSupplyPerCapita = (sum of food-node regenPerTick) / aliveCount`.
 *  A village only grows as fast as its per-capita food surplus allows — as
 *  population rises (or food supply falls), per-capita food drops, births
 *  throttle continuously, and the population settles at a self-limiting
 *  plateau instead of the bistable explode-or-collapse of the raw gate. This
 *  is what makes population "scarcity-stable across seeds" (the M1 exit-bar).
 *
 *  Value derivation: births run at the full `BIRTH_CHANCE` when per-capita
 *  food regen is at/above this target, and throttle linearly below it. With
 *  the default food supply (DEFAULT_FOOD_NODE_COUNT * FOOD_NODE_REGEN_PER_TICK
 *  = 16 * 14 = 224/tick) and a DEFAULT_POPULATION of 40, per-capita = 5.6; the
 *  target is set a little below that so the founding population breeds at
 *  roughly full rate and throttling engages as the town grows past its start. */
export const BIRTH_PERCAPITA_FOOD_TARGET = 5;

/** Ticks between a successful conception roll and the child actually
 *  spawning — models pregnancy/gestation. The second addend of the
 *  legacy-test safety margin — see header. */
export const GESTATION_TICKS = 250;

// --- genetics: crossover + mutation ------------------------------------------

/** Bounded per-gene mutation step applied after crossover, symmetric around
 *  0 (continuous genes only — behavior, aptitude, height, build). */
export const MUTATION_STEP_BOUND = 0.05;

/** Probability a categorical gene (skinTone/hairTone) flips to a DIFFERENT
 *  palette role instead of inheriting the picked parent's role verbatim. */
export const MUTATION_ROLE_FLIP_PROBABILITY = 0.05;

// --- genome -> behavior wiring (genome must not be dead data) ---------------

/** How strongly the `industriousness` behavior gene shifts a villager's
 *  effective rest-seek threshold (agents/villager.ts) away from
 *  economy/constants.ts's REST_SEEK_THRESHOLD_FRACTION baseline — a highly
 *  industrious agent (gene near 1) tolerates a LOWER rest need before
 *  working on; a lazy agent (gene near 0) seeks rest SOONER. See
 *  agents/villager.ts's `restSeekThreshold` for the exact formula. */
export const INDUSTRIOUSNESS_REST_INFLUENCE = 0.6;
