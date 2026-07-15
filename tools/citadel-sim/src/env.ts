/**
 * Flag/env parsing for the Citadel headless runner — mirrors tools/run-sim/src/env.ts.
 */

export const SEED = parseInt(process.env.SEED ?? "0x1a2b3c4d", 16) >>> 0;
export const TICKS_PER_DAY = parseInt(process.env.TICKS_PER_DAY ?? "20", 10);
export const SCENARIO = process.env.SCENARIO ?? "grow";

/**
 * Structured JSON run report (brief 2, chunk 2): `REPORT=1` prints it to
 * stdout; `REPORT_FILE=path` writes it (and implies REPORT). Neither set →
 * this tool's behavior is byte-identical to before the report existed.
 */
export const REPORT_FILE = process.env.REPORT_FILE;
export const REPORT = process.env.REPORT === "1" || REPORT_FILE !== undefined;

/**
 * `sack` needs a longer horizon than the other scenarios, and the reason is
 * geometry, not balance.
 *
 * Raiders march one tile every 3 ticks (`MOVE_INTERVAL`, raider-movement.ts) ≈ 6.7
 * tiles/day, and they spawn on a MAP EDGE. Brief 110 doubled the solo world from
 * 96×96 to 192×192, which doubled that march: a raid aimed at a keep near the map
 * centre is now ~15 days in transit, where it used to be ~7. The old scenario's
 * comment ("raid 4 arrives ~day 27.5 → within 40 days") was arithmetic done on the
 * 96×96 map and quietly stopped being true when the world grew.
 *
 * The honest budget for a REAL playthrough on today's map: ~13 days to grow to Town
 * and raise the keep, then raids 1..N escalating and each ~15 days in transit. The
 * keep falls around day 50 at the default seed; 70 leaves headroom.
 */
export const SACK_MAX_DAYS = 70;
export const MAX_DAYS = parseInt(process.env.MAX_DAYS ?? String(SCENARIO === "sack" ? SACK_MAX_DAYS : 40), 10);

/** Whether SCENARIO drives the sharp (`cozyThreats:false`) raid-resolution path. */
export function isSiegeScenario(): boolean {
  return SCENARIO === "siege" || SCENARIO === "sack";
}
