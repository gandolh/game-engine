import { describe, it, expect } from "vitest";
import {
  rectsOverlap,
  footprintRect,
  findFreePlacement,
  HOME_MARGIN,
  HomeRectIndex,
  HomeRegistry,
  type Rect,
  type RectSource,
} from "./home-placement";
import { MAX_HOME_FOOTPRINT, type HouseholdPosition } from "./household-layout";
import { GRID_SIZE } from "@hollow/sim-core/world";

describe("rectsOverlap", () => {
  it("detects overlapping rects", () => {
    const a: Rect = { minX: 0, minY: 0, maxX: 4, maxY: 4 };
    const b: Rect = { minX: 2, minY: 2, maxX: 6, maxY: 6 };
    expect(rectsOverlap(a, b)).toBe(true);
  });

  it("treats separated rects as non-overlapping", () => {
    const a: Rect = { minX: 0, minY: 0, maxX: 4, maxY: 4 };
    const b: Rect = { minX: 5, minY: 0, maxX: 9, maxY: 4 };
    expect(rectsOverlap(a, b)).toBe(false);
  });

  it("treats edge-touching rects as non-overlapping", () => {
    const a: Rect = { minX: 0, minY: 0, maxX: 4, maxY: 4 };
    const b: Rect = { minX: 4, minY: 0, maxX: 8, maxY: 4 };
    expect(rectsOverlap(a, b)).toBe(false);
  });
});

describe("footprintRect", () => {
  it("is corner-anchored (spans [x, x+w] x [y, y+d]) with no margin", () => {
    expect(footprintRect(10, 20, 3, 2)).toEqual({ minX: 10, minY: 20, maxX: 13, maxY: 22 });
  });

  it("inflates by the margin on every side", () => {
    expect(footprintRect(10, 20, 3, 2, 1)).toEqual({ minX: 9, minY: 19, maxX: 14, maxY: 23 });
  });
});

describe("findFreePlacement", () => {
  it("returns the desired position when nothing is placed yet", () => {
    const pos = findFreePlacement({ x: 30, y: 30 }, 4, 3, HOME_MARGIN, []);
    expect(pos).toEqual({ x: 30, y: 30 });
  });

  it("moves a home off an occupied anchor so its hitbox clears the placed one", () => {
    const w = 4;
    const d = 3;
    const placed: Rect[] = [footprintRect(30, 30, w, d, HOME_MARGIN)];
    const pos = findFreePlacement({ x: 30, y: 30 }, w, d, HOME_MARGIN, placed);
    // It must not overlap the occupied hitbox.
    expect(rectsOverlap(footprintRect(pos.x, pos.y, w, d, HOME_MARGIN), placed[0]!)).toBe(false);
    // And it should have actually moved.
    expect(pos.x === 30 && pos.y === 30).toBe(false);
  });

  it("places a run of homes at the same anchor with zero mutual overlap", () => {
    const w = 5;
    const d = 4;
    const placed: Rect[] = [];
    for (let i = 0; i < 8; i++) {
      const pos = findFreePlacement({ x: 32, y: 32 }, w, d, HOME_MARGIN, placed);
      const rect = footprintRect(pos.x, pos.y, w, d, HOME_MARGIN);
      for (const r of placed) expect(rectsOverlap(r, rect)).toBe(false);
      placed.push(rect);
    }
    expect(placed).toHaveLength(8);
  });

  it("is deterministic for identical inputs", () => {
    const placed: Rect[] = [footprintRect(30, 30, 5, 4, HOME_MARGIN)];
    const a = findFreePlacement({ x: 30, y: 30 }, 5, 4, HOME_MARGIN, placed);
    const b = findFreePlacement({ x: 30, y: 30 }, 5, 4, HOME_MARGIN, placed);
    expect(a).toEqual(b);
  });
});

// --- HomeRectIndex (audit-11) --------------------------------------------

describe("HomeRectIndex", () => {
  it("starts empty", () => {
    const index = new HomeRectIndex();
    expect(index.size).toBe(0);
    expect(index.near({ minX: 0, minY: 0, maxX: 4, maxY: 4 })).toHaveLength(0);
  });

  it("near() finds a reserved rect from a query in a different but overlapping cell", () => {
    const index = new HomeRectIndex(4); // small cells so a rect can span several
    const big: Rect = { minX: 1, minY: 1, maxX: 20, maxY: 3 }; // spans many x-cells
    index.set(1, big);
    // Query far along the rect's span, in a cell nowhere near where `big`
    // was first inserted — it must still be found via the multi-cell index.
    const query: Rect = { minX: 15, minY: 1, maxX: 17, maxY: 3 };
    const near = index.near(query);
    expect(near.some((r) => r === big)).toBe(true);
  });

  it("near() excludes rects nowhere close to the query", () => {
    const index = new HomeRectIndex(4);
    index.set(1, { minX: 0, minY: 0, maxX: 2, maxY: 2 });
    const near = index.near({ minX: 500, minY: 500, maxX: 502, maxY: 502 });
    expect(near).toHaveLength(0);
  });

  it("delete() releases a reservation so near() stops returning it", () => {
    const index = new HomeRectIndex();
    const rect: Rect = { minX: 0, minY: 0, maxX: 4, maxY: 4 };
    index.set(1, rect);
    expect(index.size).toBe(1);
    expect(index.near(rect)).toHaveLength(1);

    expect(index.delete(1)).toBe(true);

    expect(index.size).toBe(0);
    expect(index.near(rect)).toHaveLength(0);
    // Deleting an id that was never (or no longer) present is a no-op, not
    // an error — `HomeRegistry` calls this unconditionally for every id
    // that drops out of a frame's live set.
    expect(index.delete(1)).toBe(false);
  });

  it("set() on an id that already has a reservation replaces it, not adds a second", () => {
    const index = new HomeRectIndex();
    index.set(1, { minX: 0, minY: 0, maxX: 4, maxY: 4 });
    index.set(1, { minX: 100, minY: 100, maxX: 104, maxY: 104 });
    expect(index.size).toBe(1);
    expect(index.near({ minX: 0, minY: 0, maxX: 4, maxY: 4 })).toHaveLength(0);
    expect(index.near({ minX: 100, minY: 100, maxX: 104, maxY: 104 })).toHaveLength(1);
  });
});

// --- HomeRegistry (audit-11) ----------------------------------------------

/** A tiny fixed footprint for registry tests — big enough to force
 *  `findFreePlacement` to actually nudge homes apart when packed close
 *  together, small enough to keep the arithmetic easy to reason about. */
const TEST_FOOTPRINT = { w: 3, d: 2 } as const;
const TEST_MARGIN = 0.5;

function anchor(x: number, y: number): HouseholdPosition {
  return { x, y };
}

describe("HomeRegistry — release on dissolve (audit-11 fix #1)", () => {
  it("liveCount tracks the number of LIVE households, not cumulative formations", () => {
    const registry = new HomeRegistry(TEST_FOOTPRINT, TEST_MARGIN);

    // Frame 1: households 1..4 form, all packed at the same anchor so they
    // must actually spread out (exercising real placement, not just a map
    // insert).
    let layout = new Map<number, HouseholdPosition>([
      [1, anchor(10, 10)],
      [2, anchor(10, 10)],
      [3, anchor(10, 10)],
      [4, anchor(10, 10)],
    ]);
    registry.positionsFor(layout);
    expect(registry.liveCount).toBe(4);

    // Frame 2: household 2 dissolves (drops out of the snapshot).
    layout = new Map([
      [1, anchor(10, 10)],
      [3, anchor(10, 10)],
      [4, anchor(10, 10)],
    ]);
    registry.positionsFor(layout);
    expect(registry.liveCount).toBe(3); // NOT 4 — the dissolved one is gone.

    // Frame 3: two new households (5, 6) form while 2 stays dissolved.
    layout = new Map([
      [1, anchor(10, 10)],
      [3, anchor(10, 10)],
      [4, anchor(10, 10)],
      [5, anchor(10, 10)],
      [6, anchor(10, 10)],
    ]);
    registry.positionsFor(layout);
    // Live count == current live households (5), never the running total
    // of every formation ever seen (which would be 6).
    expect(registry.liveCount).toBe(5);

    // Frame 4: everyone dissolves.
    registry.positionsFor(new Map());
    expect(registry.liveCount).toBe(0);
  });

  it("THE INVARIANT: a surviving household's position is unchanged by a neighbour's dissolution", () => {
    const registry = new HomeRegistry(TEST_FOOTPRINT, TEST_MARGIN);

    // Pack 6 households at the same anchor so placement genuinely spreads
    // them out (if dissolving a neighbour ever re-ran placement for a
    // survivor, THIS is the scenario that would move it — freed space right
    // next to it).
    const fullLayout = new Map<number, HouseholdPosition>([
      [1, anchor(20, 20)],
      [2, anchor(20, 20)],
      [3, anchor(20, 20)],
      [4, anchor(20, 20)],
      [5, anchor(20, 20)],
      [6, anchor(20, 20)],
    ]);
    const before = new Map(registry.positionsFor(fullLayout));
    expect(before.size).toBe(6);

    // Household 3 dissolves — drop it from the layout, as app.ts would once
    // `householdLayout` stops reporting it.
    const afterDissolveLayout = new Map(fullLayout);
    afterDissolveLayout.delete(3);
    const afterDissolve = registry.positionsFor(afterDissolveLayout);

    expect(afterDissolve.has(3)).toBe(false);
    for (const id of [1, 2, 4, 5, 6]) {
      expect(afterDissolve.get(id)).toEqual(before.get(id));
    }

    // A brand-new household (7) forms in the same frame the old one's spot
    // frees up. It must place successfully (proving the freed rect IS
    // usable again) without perturbing any survivor.
    const nextLayout = new Map(afterDissolveLayout);
    nextLayout.set(7, anchor(20, 20));
    const afterNewArrival = registry.positionsFor(nextLayout);

    expect(afterNewArrival.has(7)).toBe(true);
    for (const id of [1, 2, 4, 5, 6]) {
      expect(afterNewArrival.get(id)).toEqual(before.get(id));
    }
  });
});

// --- Worst-case rectsOverlap call counts, measured (audit-11 fixes #2/#3) -

/** Wraps `rects` so every element actually pulled through `for...of`
 *  increments `counter.calls` — since `findFreePlacement`'s inner loop calls
 *  `rectsOverlap` exactly once for every candidate it pulls before deciding
 *  whether to continue or return, this counts the REAL number of
 *  `rectsOverlap` invocations made by production code, not an estimate.
 *  `Array.isArray` on a Proxy unwraps to the target, so this is still
 *  treated as the plain-array branch by `findFreePlacement`. */
function countingIterable(rects: readonly Rect[], counter: { calls: number }): Rect[] {
  const target = rects as Rect[];
  return new Proxy(target, {
    get(obj, prop, receiver): unknown {
      if (prop === Symbol.iterator) {
        return (): Iterator<Rect> => {
          const inner = obj[Symbol.iterator]();
          return {
            next(): IteratorResult<Rect> {
              const step = inner.next();
              if (!step.done) counter.calls++;
              return step;
            },
          };
        };
      }
      return Reflect.get(obj, prop, receiver);
    },
  });
}

/** Same instrumentation, for the indexed (`RectSource`) path. */
function countingRectSource(index: HomeRectIndex, counter: { calls: number }): RectSource {
  return {
    near(query: Rect): readonly Rect[] {
      return countingIterable(index.near(query), counter);
    },
  };
}

describe("measured rectsOverlap call counts on a saturated map (audit-11)", () => {
  it("fix #2 (index instead of scan): the index does far fewer overlap checks than a plain array for the same saturated map", () => {
    // Reproduce the spec's own saturation estimate: ~190 reservations tiled
    // across the 64x64 town. A new household is placed dead-center, the
    // worst case — every ring near the center is fully blocked until the
    // search escapes past the town's edge.
    const fillers: Rect[] = [];
    const index = new HomeRectIndex();
    let id = 0;
    outer: for (let gx = 0; gx <= GRID_SIZE; gx += 4) {
      for (let gy = 0; gy <= GRID_SIZE; gy += 4) {
        const rect: Rect = { minX: gx, minY: gy, maxX: gx + 1, maxY: gy + 1 };
        fillers.push(rect);
        index.set(id, rect);
        id++;
        if (id >= 190) break outer;
      }
    }
    expect(fillers).toHaveLength(190);

    const { w, d } = MAX_HOME_FOOTPRINT;
    const desired = { x: GRID_SIZE / 2, y: GRID_SIZE / 2 };

    const beforeCounter = { calls: 0 };
    const beforePos = findFreePlacement(desired, w, d, HOME_MARGIN, countingIterable(fillers, beforeCounter));

    const afterCounter = { calls: 0 };
    const afterPos = findFreePlacement(desired, w, d, HOME_MARGIN, countingRectSource(index, afterCounter));

    // Indexing must not change WHERE a home lands — same candidate rects,
    // same search order, just cheaper lookup.
    expect(afterPos).toEqual(beforePos);

    // eslint-disable-next-line no-console
    console.log(
      `[audit-11] rectsOverlap calls on a 190-reservation saturated map: ` +
        `before(array)=${beforeCounter.calls} after(index)=${afterCounter.calls}`,
    );

    expect(beforeCounter.calls).toBeGreaterThan(0);
    // The index must do meaningfully less work, not just marginally less.
    expect(afterCounter.calls).toBeLessThan(beforeCounter.calls / 5);
  });

  it("fix #3 (fail fast): capping maxRings to the town's real extent cuts total samples attempted vs the old default of 48", () => {
    // A single rect big enough to block every sample point out past ring 48
    // (48 * step, where step = the larger MAX_HOME_FOOTPRINT dimension) —
    // this isolates the RING-COUNT effect alone (an array of one is cheap
    // to scan regardless of maxRings, so any difference in call count comes
    // purely from how many rings/samples are attempted before giving up).
    const { w, d } = MAX_HOME_FOOTPRINT;
    const step = Math.max(w, d);
    const desired = { x: 0, y: 0 };
    const OLD_DEFAULT_MAX_RINGS = 48;
    const blockHalf = OLD_DEFAULT_MAX_RINGS * step + step; // covers past ring 48 entirely
    const wallOfBlock: Rect = {
      minX: desired.x - blockHalf,
      minY: desired.y - blockHalf,
      maxX: desired.x + blockHalf,
      maxY: desired.y + blockHalf,
    };

    // The cap app.ts actually computes: ceil(sqrt(2) * GRID_SIZE / step) + 2
    // — enough rings to reach past the town's real diagonal, no more.
    const CAPPED_MAX_RINGS = Math.ceil((Math.SQRT2 * GRID_SIZE) / step) + 2;
    expect(CAPPED_MAX_RINGS).toBeLessThan(OLD_DEFAULT_MAX_RINGS);

    const oldCounter = { calls: 0 };
    const oldPos = findFreePlacement(desired, w, d, HOME_MARGIN, countingIterable([wallOfBlock], oldCounter), {
      maxRings: OLD_DEFAULT_MAX_RINGS,
    });

    const cappedCounter = { calls: 0 };
    const cappedPos = findFreePlacement(desired, w, d, HOME_MARGIN, countingIterable([wallOfBlock], cappedCounter), {
      maxRings: CAPPED_MAX_RINGS,
    });

    // Both configurations are equally "impossible" here (the block covers
    // past ring 48 entirely), so both fall back to the desired anchor.
    expect(oldPos).toEqual(desired);
    expect(cappedPos).toEqual(desired);

    const expectedOldSamples = 1 + sumRingSamples(OLD_DEFAULT_MAX_RINGS);
    const expectedCappedSamples = 1 + sumRingSamples(CAPPED_MAX_RINGS);

    // eslint-disable-next-line no-console
    console.log(
      `[audit-11] rectsOverlap calls, impossible search — ` +
        `maxRings=48 (old default)=${oldCounter.calls} (expected ${expectedOldSamples}); ` +
        `maxRings=${CAPPED_MAX_RINGS} (town-extent cap)=${cappedCounter.calls} (expected ${expectedCappedSamples})`,
    );

    expect(oldCounter.calls).toBe(expectedOldSamples);
    expect(cappedCounter.calls).toBe(expectedCappedSamples);
    expect(cappedCounter.calls).toBeLessThan(oldCounter.calls);
  });
});

function sumRingSamples(maxRings: number): number {
  let total = 0;
  for (let ring = 1; ring <= maxRings; ring++) total += ring * 8;
  return total;
}
