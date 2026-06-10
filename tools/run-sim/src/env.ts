// Headless runner env-var knobs. Defaults match the browser (seed 0xc0ffee, 1200 ticks/day, 100 days).
// 1200 ticks/day: TOOL_WORK_TICKS and STEP_TICKS are calibrated for this rate.
export const SEED = Number(process.env["SEED"] ?? 0xc0ffee);
export const TICKS_PER_DAY = Number(process.env["TICKS_PER_DAY"] ?? 1200);
export const MAX_DAYS = Number(process.env["MAX_DAYS"] ?? 100);
export const PROGRESS_EVERY = Number(process.env["PROGRESS_EVERY"] ?? 10);

export const CHECK_DETERMINISM =
  process.env["CHECK_DETERMINISM"] === "1" || process.argv.includes("--check-determinism");
export const EXPORT = (process.env["EXPORT"] ?? "").toLowerCase(); // "csv" | "json" | ""
export const EXPORT_FILE = process.env["EXPORT_FILE"]; // optional path; stdout if absent

// SEEDS=a,b,c overrides the single SEED for determinism mode.
export function determinismSeeds(): number[] {
  const raw = process.env["SEEDS"];
  if (raw !== undefined && raw !== "") {
    return raw.split(",").map((s) => Number(s.trim()));
  }
  return [SEED];
}
