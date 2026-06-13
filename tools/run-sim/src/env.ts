

export const SEED = Number(process.env["SEED"] ?? 0xc0ffee);
export const TICKS_PER_DAY = Number(process.env["TICKS_PER_DAY"] ?? 1200);
export const MAX_DAYS = Number(process.env["MAX_DAYS"] ?? 100);
export const PROGRESS_EVERY = Number(process.env["PROGRESS_EVERY"] ?? 10);

export const CHECK_DETERMINISM =
  process.env["CHECK_DETERMINISM"] === "1" || process.argv.includes("--check-determinism");
export const EXPORT = (process.env["EXPORT"] ?? "").toLowerCase(); 
export const EXPORT_FILE = process.env["EXPORT_FILE"]; 

export function determinismSeeds(): number[] {
  const raw = process.env["SEEDS"];
  if (raw !== undefined && raw !== "") {
    return raw.split(",").map((s) => Number(s.trim()));
  }
  return [SEED];
}
