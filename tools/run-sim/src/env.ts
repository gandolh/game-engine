/**
 * env.ts — parse the headless runner's env-var / argv knobs once.
 *
 * The default (no env set) path must behave exactly as before: seed 0xc0ffee,
 * 1200 ticks/day, 100 days. See index.ts for the calibration rationale behind
 * the tick rate.
 */

export const SEED = Number(process.env["SEED"] ?? 0xc0ffee);

// 1200 ticks/day matches the browser default (main.ts: ticksPerDay: 1200).
// TOOL_WORK_TICKS (60/40/20 at 20Hz = 3s/2s/1s) and STEP_TICKS (8) are
// calibrated for this rate: a path of 8 steps takes 64 ticks = 5% of a day,
// and 9 water actions take 540 ticks = 45% of a day — both comfortably fit.
export const TICKS_PER_DAY = Number(process.env["TICKS_PER_DAY"] ?? 1200);
export const MAX_DAYS = Number(process.env["MAX_DAYS"] ?? 100);
export const PROGRESS_EVERY = Number(process.env["PROGRESS_EVERY"] ?? 10);

export const CHECK_DETERMINISM =
  process.env["CHECK_DETERMINISM"] === "1" || process.argv.includes("--check-determinism");
export const EXPORT = (process.env["EXPORT"] ?? "").toLowerCase(); // "csv" | "json" | ""
export const EXPORT_FILE = process.env["EXPORT_FILE"]; // optional path; default = stdout

/**
 * The seeds to verify in determinism mode. SEEDS=a,b,c overrides the single
 * SEED; otherwise just [SEED].
 */
export function determinismSeeds(): number[] {
  const raw = process.env["SEEDS"];
  if (raw !== undefined && raw !== "") {
    return raw.split(",").map((s) => Number(s.trim()));
  }
  return [SEED];
}
