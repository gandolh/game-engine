/**
 * Collision-aware home placement (chunk hollow-09 fix) — the "hitbox" layer
 * that stops houses from overlapping. `householdLayout` only gives each home a
 * DESIRED anchor (its community's territory centroid + a small per-id offset),
 * which piles several homes of one community on top of each other. This module
 * treats every home as an axis-aligned footprint rectangle ("hitbox") and, when
 * a new home is first placed, nudges it outward from its desired anchor until
 * its hitbox clears every already-placed home's hitbox.
 *
 * Pure + deterministic (no RNG, no wall-clock): given the same desired anchor,
 * footprint, and set of already-placed rects, `findFreePlacement` always
 * returns the same spot — so a home lands in the same place every run, and the
 * app can freeze it there for the life of the run (no teleport). Corner-anchored
 * to match `@engine/core/render3d`'s `box()` (a home at `(x,y)` spans
 * `[x, x+w] x [y, y+d]`).
 *
 * `HomeRectIndex` + `HomeRegistry` (chunk audit-11 fix) own the LIFETIME half
 * of this: Hollow is generational, households dissolve continuously, and the
 * app used to only ever `push` a placed rect — never release one — so a
 * dissolved household's footprint stayed reserved forever and the spiral
 * search below degraded without bound as the map saturated. `HomeRegistry`
 * reconciles against each frame's live household ids and drops a dissolved
 * one's rect + frozen position; `HomeRectIndex` buckets rects into a coarse
 * tile grid so a search only tests nearby rects instead of scanning the
 * whole (no-longer-ever-growing) set.
 */
import type { HouseholdPosition } from "./household-layout";

/** An axis-aligned footprint rectangle in tile-space (a home's "hitbox"). */
export interface Rect {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

/** Default spacing (tiles) kept BETWEEN home footprints — applied as a margin
 *  on every side of each hitbox, so two homes end up at least `2 * HOME_MARGIN`
 *  apart. Kept small so a community still reads as a cluster, not a sprawl. */
export const HOME_MARGIN = 0.8;

/** True iff two rects overlap (touching edges do NOT count as overlap). */
export function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.minX < b.maxX && a.maxX > b.minX && a.minY < b.maxY && a.maxY > b.minY;
}

/** The hitbox of a home whose min-corner is at `(x, y)` with footprint `w x d`,
 *  inflated by `margin` on every side. */
export function footprintRect(x: number, y: number, w: number, d: number, margin = 0): Rect {
  return { minX: x - margin, minY: y - margin, maxX: x + w + margin, maxY: y + d + margin };
}

export interface PlacementOptions {
  /** Radial step (tiles) between search rings; defaults to the footprint's
   *  larger dimension so each ring clears a whole home. */
  readonly step?: number;
  /** Max rings to search before giving up (and returning the desired anchor,
   *  allowing overlap rather than looping forever). */
  readonly maxRings?: number;
}

/** A source of "rects that might overlap a query rect" — a conservative
 *  superset; `isFree` below still confirms every candidate with
 *  `rectsOverlap`. A plain `readonly Rect[]` trivially satisfies this (used
 *  by small/test placement sets, where scanning the whole thing is cheap);
 *  `HomeRectIndex` implements it with O(neighbours) lookup for the
 *  large/long-lived case (chunk audit-11 fix). */
export interface RectSource {
  near(query: Rect): readonly Rect[];
}

function isRectSource(placed: readonly Rect[] | RectSource): placed is RectSource {
  return !Array.isArray(placed);
}

function candidatesNear(placed: readonly Rect[] | RectSource, query: Rect): readonly Rect[] {
  return isRectSource(placed) ? placed.near(query) : placed;
}

/**
 * Find a position (min-corner) for a `w x d` home near `desired` whose hitbox
 * (footprint + `margin`) overlaps none of `placed`. Tries `desired` first, then
 * spirals outward in rings of increasing radius, sampling more angles per ring
 * so density stays even. Deterministic: same inputs -> same output. Falls back
 * to `desired` if no free spot is found within `maxRings` (degrades to the old
 * overlapping behaviour rather than hanging).
 */
export function findFreePlacement(
  desired: { readonly x: number; readonly y: number },
  w: number,
  d: number,
  margin: number,
  placed: readonly Rect[] | RectSource,
  opts: PlacementOptions = {},
): { x: number; y: number } {
  const step = opts.step ?? Math.max(w, d);
  const maxRings = opts.maxRings ?? 48;

  const isFree = (x: number, y: number): boolean => {
    const rect = footprintRect(x, y, w, d, margin);
    for (const r of candidatesNear(placed, rect)) {
      if (rectsOverlap(r, rect)) return false;
    }
    return true;
  };

  if (isFree(desired.x, desired.y)) return { x: desired.x, y: desired.y };

  for (let ring = 1; ring <= maxRings; ring++) {
    const radius = ring * step;
    const samples = ring * 8;
    for (let i = 0; i < samples; i++) {
      const angle = (i / samples) * Math.PI * 2;
      const x = desired.x + Math.cos(angle) * radius;
      const y = desired.y + Math.sin(angle) * radius;
      if (isFree(x, y)) return { x, y };
    }
  }
  return { x: desired.x, y: desired.y };
}

// --- HomeRectIndex (chunk audit-11 fix) ---------------------------------

/**
 * Coarse tile-grid spatial index over placed home rects, keyed by household
 * id. `findFreePlacement`'s spiral search calls `isFree` once per sample and,
 * against a plain array, each call linearly rescans the WHOLE set of placed
 * rects — on a saturated 64x64 town that's ~9,400 samples x N placed homes
 * for every household whose search fails, every frame. Bucketing rects into
 * fixed-size cells means a query only has to look at the handful of cells
 * its own bounding box touches.
 *
 * A rect is stored in EVERY cell it overlaps (not just one), so two
 * overlapping rects are guaranteed to share at least one bucket — `near()`
 * is therefore always a SUPERSET of the true overlap set, never a subset.
 * `findFreePlacement` still confirms every candidate with `rectsOverlap`, so
 * correctness doesn't depend on the bucketing being exact.
 */
export class HomeRectIndex implements RectSource {
  private readonly cellSize: number;
  private readonly cells = new Map<string, { id: number; rect: Rect }[]>();
  private readonly byId = new Map<number, { rect: Rect; cellKeys: readonly string[] }>();

  constructor(cellSize = 8) {
    this.cellSize = Math.max(1, cellSize);
  }

  private cellKeysFor(rect: Rect): string[] {
    const minCx = Math.floor(rect.minX / this.cellSize);
    const maxCx = Math.floor(rect.maxX / this.cellSize);
    const minCy = Math.floor(rect.minY / this.cellSize);
    const maxCy = Math.floor(rect.maxY / this.cellSize);
    const keys: string[] = [];
    for (let cx = minCx; cx <= maxCx; cx++) {
      for (let cy = minCy; cy <= maxCy; cy++) {
        keys.push(`${cx}:${cy}`);
      }
    }
    return keys;
  }

  /** Reserve `rect` under `id`, replacing any previous reservation for it. */
  set(id: number, rect: Rect): void {
    this.delete(id);
    const cellKeys = this.cellKeysFor(rect);
    for (const key of cellKeys) {
      let bucket = this.cells.get(key);
      if (!bucket) {
        bucket = [];
        this.cells.set(key, bucket);
      }
      bucket.push({ id, rect });
    }
    this.byId.set(id, { rect, cellKeys });
  }

  /** Release `id`'s reservation, if any. Returns whether one existed. */
  delete(id: number): boolean {
    const entry = this.byId.get(id);
    if (!entry) return false;
    for (const key of entry.cellKeys) {
      const bucket = this.cells.get(key);
      if (!bucket) continue;
      const kept = bucket.filter((item) => item.id !== id);
      if (kept.length > 0) this.cells.set(key, kept);
      else this.cells.delete(key);
    }
    this.byId.delete(id);
    return true;
  }

  has(id: number): boolean {
    return this.byId.has(id);
  }

  /** Number of currently-reserved rects (LIVE, not cumulative — every
   *  `delete` shrinks this). */
  get size(): number {
    return this.byId.size;
  }

  near(query: Rect): readonly Rect[] {
    const seen = new Set<number>();
    const out: Rect[] = [];
    for (const key of this.cellKeysFor(query)) {
      const bucket = this.cells.get(key);
      if (!bucket) continue;
      for (const item of bucket) {
        if (seen.has(item.id)) continue;
        seen.add(item.id);
        out.push(item.rect);
      }
    }
    return out;
  }
}

// --- HomeRegistry (chunk audit-11 fix) ----------------------------------

export interface HomeRegistryOptions extends PlacementOptions {
  /** `HomeRectIndex` bucket size (tiles); defaults to 8. */
  readonly cellSize?: number;
}

/**
 * Owns the full "freeze on first sighting + collision-aware placement +
 * release on dissolve" lifecycle for household homes. Before this existed,
 * `app.ts` kept a `homePosByHousehold` Map and a `placedHomeRects` array
 * that were only ever grown, never shrunk — since Hollow is the
 * *generational* sim (households form and dissolve continuously across
 * generations), a dissolved household's frozen position and reserved
 * footprint leaked forever, and the free-space search degraded without
 * bound as the map saturated with dead reservations.
 *
 * Pure and deterministic (no RNG, no wall-clock) beyond its own internal
 * state — the SAME sequence of `positionsFor` calls with the same `layout`
 * content always yields the same positions, so this stays render-only
 * dressing, never a sim input.
 *
 * **Anti-teleport guarantee**: a household's position is computed exactly
 * ONCE — the first frame its id appears in `layout` — via `findFreePlacement`
 * against every other currently-LIVE home's rect. Every later call for that
 * same id reuses the frozen position untouched (`positions.has(id)` short-
 * circuits before `findFreePlacement` is ever called again for it).
 * Releasing a DIFFERENT, dissolved household's rect only changes what a
 * *future new* household's search sees — it can never re-trigger placement
 * for a household whose position is already frozen, because release only
 * deletes entries for ids ABSENT from `layout`, and a surviving household's
 * id is (by definition) present.
 */
export class HomeRegistry {
  private readonly positions = new Map<number, HouseholdPosition>();
  private readonly rects: HomeRectIndex;
  private readonly footprint: { readonly w: number; readonly d: number };
  private readonly margin: number;
  private readonly opts: PlacementOptions;

  constructor(footprint: { readonly w: number; readonly d: number }, margin: number, opts: HomeRegistryOptions = {}) {
    this.footprint = footprint;
    this.margin = margin;
    this.opts = opts;
    this.rects = new HomeRectIndex(opts.cellSize);
  }

  /**
   * Reconcile against this frame's live household ids (`layout`'s keys):
   * release any previously-tracked id no longer present, then freeze a
   * position for any new one. Returns the frozen position for every
   * currently-live household — exactly `layout`'s ids, no more, no less.
   */
  positionsFor(layout: ReadonlyMap<number, HouseholdPosition>): ReadonlyMap<number, HouseholdPosition> {
    for (const id of this.positions.keys()) {
      if (!layout.has(id)) {
        this.positions.delete(id);
        this.rects.delete(id);
      }
    }
    for (const [id, freshAnchor] of layout) {
      if (this.positions.has(id)) continue;
      const { w, d } = this.footprint;
      const pos = findFreePlacement(freshAnchor, w, d, this.margin, this.rects, this.opts);
      this.positions.set(id, pos);
      this.rects.set(id, footprintRect(pos.x, pos.y, w, d, this.margin));
    }
    return this.positions;
  }

  /** Number of currently-reserved footprints (LIVE households only — the
   *  metric that must stabilise instead of growing unboundedly). */
  get liveCount(): number {
    return this.rects.size;
  }
}
