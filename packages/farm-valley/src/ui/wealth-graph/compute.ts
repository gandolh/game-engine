import type { SnapshotWealthSeries } from "@farm/sim-core/snapshot";

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

/** Map wealth series to canvas pixel coords: day→x (left..right), gold→y (bottom..top). */
export function computePoints(
  series: SnapshotWealthSeries[],
  bounds: ChartBounds,
): ChartPoint[][] {
  if (series.length === 0) return [];

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

/** Crossing between two farmers between consecutive days; coordinates in data space (not pixels). */
export interface WealthCrossing {
  /** Earlier of the two days forming the crossing. */
  day: number;
  aId: number;
  bId: number;
  /** Interpolated day fraction where the crossing occurs. */
  crossX: number;
  /** Gold value at the crossing point (same for both farmers). */
  crossGold: number;
}

/** Detect all pairwise crossings (strict gold-order swaps) across consecutive days. O(N²·D). */
export function detectCrossings(series: SnapshotWealthSeries[]): WealthCrossing[] {
  const crossings: WealthCrossing[] = [];
  const n = series.length;

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const a = series[i]!;
      const b = series[j]!;
      const aByDay = new Map<number, number>();
      const bByDay = new Map<number, number>();
      for (const row of a.rows) aByDay.set(row.day, row.gold);
      for (const row of b.rows) bByDay.set(row.day, row.gold);

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
        const diff0 = ag0 - bg0;
        const diff1 = ag1 - bg1;
        if (diff0 === 0 || diff1 === 0) continue; // touching, not crossing
        if ((diff0 > 0 && diff1 > 0) || (diff0 < 0 && diff1 < 0)) continue; // no swap

        // t = diff0 / (diff0 − diff1) from linear interpolation of the gold-difference.
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
