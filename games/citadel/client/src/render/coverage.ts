/**
 * Service catchment / coverage math (OpenTTD-influence brief, 2026-06-22).
 *
 * Pure, render-only helpers that mirror the sim's coverage rule so the client
 * can VISUALISE reach (placement ring + coverage overlay) without recomputing a
 * second source of truth. The authoritative coverage math lives in
 * `@citadel/sim-core` (systems/needs-happiness.ts); here we re-derive only the
 * geometry it uses — same service centre, same Manhattan radius, same
 * `SERVICE_RADII` constant — so the overlay can never drift from the sim.
 *
 * No GPU, no RNG, no sim mutation — unit-tested headlessly.
 */
import { SERVICE_RADII, SERVICE_RECTS, WORLD_WIDTH, WORLD_HEIGHT } from "@citadel/sim-core";
import type { BuildingSnapshot } from "@citadel/sim-core";
import { EDG } from "@engine/core";

/**
 * The need types the NeedsHappinessSystem scores, by service type. "festival"
 * is the cozy-pivot Phase G public-square mood lift — spatial + autonomous,
 * same shape as the other three (see needs-happiness.ts).
 */
export type Need = "faith" | "safety" | "goods" | "festival";
export const COVERAGE_SERVICE: Readonly<Record<string, Need>> = {
  chapel: "faith",
  watchpost: "safety",
  market: "goods",
  "public-square": "festival",
};

/** Tint per need — distinct, palette-legal hues for the overlay/ring. */
export const NEED_TINT: Readonly<Record<Need, string>> = {
  faith: EDG.mauve,
  safety: EDG.skyBlue,
  goods: EDG.gold,
  festival: EDG.green,
};

/**
 * The service centre tile of a building — IDENTICAL to the sim's
 * `b.x + floor(b.w/2)`, `b.y + floor(b.h/2)` (needs-happiness.ts:47-48). The
 * coverage math keys off this, so it must match the sim exactly.
 */
export function serviceCenter(b: BuildingSnapshot): { cx: number; cy: number } {
  return { cx: b.x + Math.floor(b.w / 2), cy: b.y + Math.floor(b.h / 2) };
}

/** Service radius for a building type (0 if the type has no coverage). */
export function serviceRadius(type: string): number {
  return SERVICE_RADII[type] ?? 0;
}

/** Hex tint to preview a service's reach: its need colour, else neutral cream. */
export function serviceTint(type: string): string {
  const need = COVERAGE_SERVICE[type];
  return need !== undefined ? NEED_TINT[need] : EDG.cream;
}

export interface CatchmentTile {
  tx: number;
  ty: number;
  /** On the Manhattan perimeter (`|dx|+|dy| === radius`) — drawn as the ring. */
  edge: boolean;
}

/**
 * All tiles within Manhattan `radius` of `(cx,cy)`, clamped to the world grid.
 * The Manhattan ball is a diamond in tile space; `edge` marks its perimeter so
 * the placement preview can draw a crisp ring with a faint fill inside.
 */
export function catchmentTiles(cx: number, cy: number, radius: number): CatchmentTile[] {
  const tiles: CatchmentTile[] = [];
  if (radius <= 0) return tiles;
  for (let dy = -radius; dy <= radius; dy++) {
    const span = radius - Math.abs(dy);
    const ty = cy + dy;
    if (ty < 0 || ty >= WORLD_HEIGHT) continue;
    for (let dx = -span; dx <= span; dx++) {
      const tx = cx + dx;
      if (tx < 0 || tx >= WORLD_WIDTH) continue;
      tiles.push({ tx, ty, edge: Math.abs(dx) + Math.abs(dy) === radius });
    }
  }
  return tiles;
}

/**
 * All tiles inside the `w`×`h` RECTANGLE centred on `(cx,cy)`, clamped to the
 * world grid. Even spans are anchored the same half-open way as the sim's
 * `coversRect` (extra column/row on the +x / +y side), so the preview matches
 * the gameplay area exactly. `edge` marks the rectangle's border for a crisp
 * ring with a faint interior fill.
 */
export function rectCatchmentTiles(cx: number, cy: number, w: number, h: number): CatchmentTile[] {
  const tiles: CatchmentTile[] = [];
  if (w <= 0 || h <= 0) return tiles;
  const x0 = cx - Math.floor(w / 2);
  const x1 = cx + Math.ceil(w / 2) - 1;
  const y0 = cy - Math.floor(h / 2);
  const y1 = cy + Math.ceil(h / 2) - 1;
  for (let ty = y0; ty <= y1; ty++) {
    if (ty < 0 || ty >= WORLD_HEIGHT) continue;
    for (let tx = x0; tx <= x1; tx++) {
      if (tx < 0 || tx >= WORLD_WIDTH) continue;
      tiles.push({ tx, ty, edge: tx === x0 || tx === x1 || ty === y0 || ty === y1 });
    }
  }
  return tiles;
}

/**
 * The placement-ring tiles for a service of `type` centred at `(cx,cy)`,
 * dispatching on shape: a rectangle for types in `SERVICE_RECTS` (the well),
 * otherwise the Manhattan diamond from `SERVICE_RADII`. Empty if the type has no
 * coverage. One accessor so callers don't special-case the well's shape.
 */
export function serviceCatchment(type: string, cx: number, cy: number): CatchmentTile[] {
  const rect = SERVICE_RECTS[type];
  if (rect !== undefined) return rectCatchmentTiles(cx, cy, rect.w, rect.h);
  return catchmentTiles(cx, cy, serviceRadius(type));
}

/**
 * How many houses fall inside a prospective service at `(cx,cy)` with `radius`
 * — the same house-centre Manhattan test the sim uses. Drives the "covers 0
 * homes" placement warning. (Counts every house in the snapshot; in solo there
 * is one owner, so this matches the player's own coverage exactly.)
 */
export function housesInRadius(
  buildings: readonly BuildingSnapshot[],
  cx: number,
  cy: number,
  radius: number,
): number {
  let n = 0;
  for (const b of buildings) {
    if (b.type !== "house") continue;
    const { cx: hx, cy: hy } = serviceCenter(b);
    if (Math.abs(hx - cx) + Math.abs(hy - cy) <= radius) n++;
  }
  return n;
}

export interface NeedCatchment {
  need: Need;
  hex: string;
  tiles: CatchmentTile[];
}

/**
 * The combined catchment of every chapel/watchpost/market in the snapshot,
 * grouped by need, with each need's tiles de-duplicated into a flat fill (no
 * per-tile edges — overlapping rings inside a region read as noise). Powers the
 * coverage-overlay toggle: three translucent regions whose gaps are the homes
 * no service reaches.
 */
export function coverageByNeed(buildings: readonly BuildingSnapshot[]): NeedCatchment[] {
  const groups = new Map<Need, Map<string, CatchmentTile>>();
  for (const b of buildings) {
    const need = COVERAGE_SERVICE[b.type];
    if (need === undefined) continue;
    const radius = serviceRadius(b.type);
    if (radius <= 0) continue;
    const { cx, cy } = serviceCenter(b);
    let bucket = groups.get(need);
    if (bucket === undefined) {
      bucket = new Map<string, CatchmentTile>();
      groups.set(need, bucket);
    }
    for (const t of catchmentTiles(cx, cy, radius)) {
      bucket.set(`${t.tx},${t.ty}`, { tx: t.tx, ty: t.ty, edge: false });
    }
  }
  const out: NeedCatchment[] = [];
  for (const need of ["faith", "safety", "goods", "festival"] as const) {
    const bucket = groups.get(need);
    if (bucket === undefined) continue;
    out.push({ need, hex: NEED_TINT[need], tiles: [...bucket.values()] });
  }
  return out;
}
