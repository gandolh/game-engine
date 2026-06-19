/**
 * Seasonal cycle for Citadel. The year is divided into four equal seasons;
 * the grain multiplier models seasonal crop yields.
 */

export type Season = "spring" | "summer" | "autumn" | "winter";

const SEASON_ORDER: readonly Season[] = ["spring", "summer", "autumn", "winter"];

/**
 * Return the season for a given (0-based) day, given the number of days in a
 * year. Days wrap modulo the year length; each season is one quarter.
 */
export function getSeason(day: number, daysPerYear: number): Season {
  if (daysPerYear <= 0) return "spring";
  const perSeason = daysPerYear / 4;
  const dayOfYear = ((day % daysPerYear) + daysPerYear) % daysPerYear;
  const idx = Math.min(3, Math.floor(dayOfYear / perSeason));
  return SEASON_ORDER[idx]!;
}

/** Grain yield multiplier per season. */
export function grainMultiplier(season: Season): number {
  switch (season) {
    case "spring":
      return 0.5;
    case "summer":
      return 1.0;
    case "autumn":
      return 1.2;
    case "winter":
      return 0.0;
  }
}
