import type { SnapshotWealthSeries } from "../../worker/snapshot";

/** One {x,y} coordinate in canvas pixel space. */
export interface ChartPoint {
  x: number;
  y: number;
}

/** Layout bounds for the chart's drawable area (inside padding). */
export interface ChartBounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/**
 * Compute canvas pixel coordinates for each farmer's data points.
 *
 * Maps:
 *   day 0      → x = bounds.left
 *   maxDay     → x = bounds.right
 *   gold 0     → y = bounds.bottom
 *   maxGold    → y = bounds.top
 *
 * Returns an array in the same order as `series`. If a farmer has no rows, their
 * entry is an empty array. Returns [] for all if `series` is empty.
 *
 * @param series   Per-farmer wealth rows (ascending day order assumed).
 * @param bounds   Pixel bounds of the drawable area.
 */
export function computePoints(
  series: SnapshotWealthSeries[],
  bounds: ChartBounds,
): ChartPoint[][] {
  if (series.length === 0) return [];

  // Compute data domain.
  let maxDay = 1;
  let maxGold = 1;
  for (const s of series) {
    for (const row of s.rows) {
      if (row.day > maxDay) maxDay = row.day;
      if (row.gold > maxGold) maxGold = row.gold;
    }
  }

  const rangeX = bounds.right - bounds.left;
  const rangeY = bounds.bottom - bounds.top;

  return series.map((s) =>
    s.rows.map((row) => ({
      x: bounds.left + (row.day / maxDay) * rangeX,
      y: bounds.bottom - (row.gold / maxGold) * rangeY,
    })),
  );
}

/** Describes a crossing between two farmers between consecutive days. */
export interface WealthCrossing {
  /** The day number of the EARLIER of the two rows forming the crossing. */
  day: number;
  /** Farmer id of the first participant. */
  aId: number;
  /** Farmer id of the second participant. */
  bId: number;
  /**
   * The interpolated x-coordinate (in data space: day fraction) where the
   * crossing occurs. In [day, day+1].
   */
  crossX: number;
  /**
   * The gold value at the crossing (same for both farmers by definition of
   * a crossing). In data gold units (not canvas pixels).
   */
  crossGold: number;
}

/**
 * Detect all pairwise crossings in the wealth series.
 *
 * A crossing is defined as: between consecutive days D and D+1, farmer A's
 * gold was higher (or equal) than farmer B's at day D, but lower (or equal)
 * at day D+1, AND the relative ordering actually SWAPPED (strict crossing —
 * equal-to-equal is not a crossing). The interpolated crossing point is
 * returned in data space.
 *
 * Runs in O(farmerCount² × maxDays) — fine for 4 farmers × 100 days = 400 ops.
 *
 * @param series  Per-farmer wealth rows (each sorted ascending by day).
 */
export function detectCrossings(series: SnapshotWealthSeries[]): WealthCrossing[] {
  const crossings: WealthCrossing[] = [];
  const n = series.length;

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const a = series[i]!;
      const b = series[j]!;
      // Build day-indexed maps for fast lookup.
      const aByDay = new Map<number, number>();
      const bByDay = new Map<number, number>();
      for (const row of a.rows) aByDay.set(row.day, row.gold);
      for (const row of b.rows) bByDay.set(row.day, row.gold);

      // Collect the union of days both farmers have recorded.
      const days = [...new Set([...aByDay.keys(), ...bByDay.keys()])].sort(
        (x, y) => x - y,
      );

      for (let k = 0; k + 1 < days.length; k++) {
        const d0 = days[k]!;
        const d1 = days[k + 1]!;
        const ag0 = aByDay.get(d0);
        const bg0 = bByDay.get(d0);
        const ag1 = aByDay.get(d1);
        const bg1 = bByDay.get(d1);
        if (
          ag0 === undefined ||
          bg0 === undefined ||
          ag1 === undefined ||
          bg1 === undefined
        ) {
          continue;
        }
        // Strict sign change: a was above (or equal) b at d0, a is below b at d1
        // OR a was below b at d0, a is above (or equal) b at d1 — but both sides
        // must be a genuine swap (a≠b at both endpoints for a visual crossing).
        const diff0 = ag0 - bg0;
        const diff1 = ag1 - bg1;
        if (diff0 === 0 || diff1 === 0) continue; // touching, not crossing
        if ((diff0 > 0 && diff1 > 0) || (diff0 < 0 && diff1 < 0)) continue; // no swap

        // Interpolate: find t in [0,1] where ag0 + t*(ag1-ag0) = bg0 + t*(bg1-bg0)
        // → t = (ag0 - bg0) / ((ag0 - bg0) - (ag1 - bg1))
        const denom = diff0 - diff1;
        const t = denom === 0 ? 0.5 : diff0 / denom;
        const crossX = d0 + t * (d1 - d0);
        const crossGold = ag0 + t * (ag1 - ag0);

        crossings.push({
          day: d0,
          aId: a.farmerId,
          bId: b.farmerId,
          crossX,
          crossGold,
        });
      }
    }
  }

  return crossings;
}
