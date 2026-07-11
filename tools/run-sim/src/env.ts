

export const SEED = Number(process.env["SEED"] ?? 0xc0ffee);
/**
 * World-gen seed (brief 92/93). When unset the world uses the fixed default map
 * (WORLD_GEN_SEED in regions.ts); set WORLD_SEED for a fresh archipelago per run.
 * Persist this alongside results so a replay regenerates the same map.
 */
export const WORLD_SEED: number | undefined =
  process.env["WORLD_SEED"] !== undefined && process.env["WORLD_SEED"] !== ""
    ? Number(process.env["WORLD_SEED"])
    : undefined;
export const TICKS_PER_DAY = Number(process.env["TICKS_PER_DAY"] ?? 1200);
export const MAX_DAYS = Number(process.env["MAX_DAYS"] ?? 100);
export const PROGRESS_EVERY = Number(process.env["PROGRESS_EVERY"] ?? 10);

export const CHECK_DETERMINISM =
  process.env["CHECK_DETERMINISM"] === "1" || process.argv.includes("--check-determinism");
export const EXPORT = (process.env["EXPORT"] ?? "").toLowerCase();
export const EXPORT_FILE = process.env["EXPORT_FILE"];

export const REPORT_FILE = process.env["REPORT_FILE"];
export const REPORT = process.env["REPORT"] === "1" || REPORT_FILE !== undefined;

export function determinismSeeds(): number[] {
  const raw = process.env["SEEDS"];
  if (raw !== undefined && raw !== "") {
    return raw.split(",").map((s) => Number(s.trim()));
  }
  return [SEED];
}
