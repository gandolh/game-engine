/**
 * Brief 113 (cozy raid departure): a cozy raider that reaches the keep/defenses
 * no longer vanishes on arrival. It pilfers exactly as before (same events, same
 * happiness/threat math), then walks back off the map along its reversed path
 * (`leaving: true`) and is only removed once that walk is exhausted.
 *
 * These tests construct the raider directly (`p.raiders.push(...)`) rather than
 * driving it through `RaidSpawnSystem`'s random schedule/edge/target — that keeps
 * the walked path short and bounded so a real trip "there and back" fits in a
 * small, fast, deterministic test window, and lets each test isolate exactly the
 * invariant it's checking (arrival effects, no re-pilfer, no interception while
 * leaving) without fighting escalating-raid timing. `RaiderMovementSystem` and
 * `SiegeResolutionSystem` are exercised through the full scheduler either way —
 * only the raider's *origin* is synthetic, not its handling.
 *
 * Fixture patterns (findClear/placeBatch) copied from cozy-threats.test.ts and
 * sharp-raid-path.test.ts.
 */
import { describe, it, expect } from "vitest";
import { bootstrapSim } from "../sim-bootstrap";
import { localPlayer } from "../sim-state";
import type { RaiderState } from "../sim-state";
import { computeRaiderPath } from "./raid-spawn";
import { isWalkable } from "../world/terrain";
import type { TerrainGrid } from "../world/terrain";

const SEED = 0xc0ffee;
const TICKS_PER_DAY = 20;
const WORLD = 64;

/** Top-left of a clear (walkable) w×h region near (sx, sy). */
function findClear(terrain: TerrainGrid, w: number, h: number, sx: number, sy: number): { x: number; y: number } {
  for (let r = 0; r < 40; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const x = sx + dx;
        const y = sy + dy;
        let ok = true;
        for (let yy = 0; yy < h && ok; yy++) {
          for (let xx = 0; xx < w; xx++) {
            if (!isWalkable(terrain, x + xx, y + yy)) { ok = false; break; }
          }
        }
        if (ok) return { x, y };
      }
    }
  }
  return { x: sx, y: sy };
}

/** A cozy sim with an undefended keep placed near the map center. */
function simWithKeep(): { sim: ReturnType<typeof bootstrapSim>; keep: { x: number; y: number } } {
  const sim = bootstrapSim({ seed: SEED, ticksPerDay: TICKS_PER_DAY, worldWidth: WORLD, worldHeight: WORLD });
  const lp = localPlayer(sim.state);
  lp.tier = "Town"; // bypasses TIER_LOCK — resolution-mechanics test, not a reachability test
  const g = findClear(sim.terrain, 3, 3, Math.floor(WORLD / 2), Math.floor(WORLD / 2));
  sim.commands.enqueue({ type: "placeBuilding", payload: { buildingType: "keep", x: g.x, y: g.y } });
  sim.scheduler.tick({ tick: 0 });
  expect(lp.keepPosition).not.toBeNull();
  lp.stockpiles.grain = 100;
  lp.stockpiles.wood = 100;
  lp.stockpiles.tools = 50;
  return { sim, keep: lp.keepPosition! };
}

/**
 * Manually construct a raider that has already fully walked a real (BFS-computed)
 * path from a spawn point ~offset tiles from the keep, and push it onto the
 * player's raider list — simulating "arrival" without going through
 * `RaidSpawnSystem`'s random schedule/edge pick.
 */
function pushArrivedRaider(
  sim: ReturnType<typeof bootstrapSim>,
  keep: { x: number; y: number },
  offset: { dx: number; dy: number },
  strength = 20,
): RaiderState {
  const lp = localPlayer(sim.state);
  const spawn = findClear(sim.terrain, 1, 1, keep.x + offset.dx, keep.y + offset.dy);
  const path = computeRaiderPath(spawn.x, spawn.y, keep.x, keep.y, sim.state, lp, sim.terrain);
  expect(path, "test fixture requires a real route from spawn to keep").not.toBeNull();
  expect(path!.length, "test fixture requires a non-trivial walked distance").toBeGreaterThan(2);
  const last = path![path!.length - 1]!;
  const raider: RaiderState = {
    id: lp.raiders.length + 1,
    x: last.x,
    y: last.y,
    tileX: last.x,
    tileY: last.y,
    path: path!,
    pathStep: path!.length, // fully walked — "just arrived"
    strength,
    resolved: false,
  };
  lp.raiders.push(raider);
  return raider;
}

/** Run ticks (from 1) until `pred` is true or `maxTicks` is reached; returns the tick it became true, or -1. */
function runUntil(sim: ReturnType<typeof bootstrapSim>, maxTicks: number, pred: () => boolean): number {
  for (let t = 1; t <= maxTicks; t++) {
    sim.scheduler.tick({ tick: t });
    if (pred()) return t;
  }
  return -1;
}

const PILFER_RE = /made off with some goods|found little worth taking/i;

describe("cozy raid departure — arrival effects unchanged, then walks home", () => {
  it("pilfers exactly once on arrival, is NOT removed that tick, and marks leaving/pathStep=0 with the reversed walked path", () => {
    const { sim, keep } = simWithKeep();
    const lp = localPlayer(sim.state);
    const raider = pushArrivedRaider(sim, keep, { dx: -10, dy: 0 });
    const originalPath = raider.path.slice();

    // Arrival is resolved on the very next tick (SiegeResolutionSystem runs
    // unconditionally every tick, unlike movement which only steps every
    // MOVE_INTERVAL ticks).
    sim.scheduler.tick({ tick: 1 });

    expect(sim.state.events.filter((e) => PILFER_RE.test(e)).length).toBe(1);
    // Not spliced out this tick.
    expect(lp.raiders.length).toBe(1);
    expect(lp.raiders[0]).toBe(raider);
    expect(raider.resolved).toBe(false);
    expect(raider.leaving).toBe(true);
    expect(raider.pathStep).toBe(0);
    expect(raider.path).toEqual(originalPath.slice().reverse());
    // Same magnitude arrival effects as the pre-existing cozy arrival math.
    expect(lp.happiness).toBeLessThanOrEqual(100 - 8);
  });

  it("walks back and is removed once its reversed path is exhausted — bounded, no leak", () => {
    const { sim, keep } = simWithKeep();
    const lp = localPlayer(sim.state);
    const raider = pushArrivedRaider(sim, keep, { dx: -10, dy: 0 });
    const pathLen = raider.path.length;

    const arrivedAt = runUntil(sim, 10, () => raider.leaving === true);
    expect(arrivedAt).toBeGreaterThan(0);

    // Generous bound: MOVE_INTERVAL(3) ticks per reversed step, plus slack.
    // Not tied to the exact internal constant — just proves it's bounded, not
    // stuck or leaking forever.
    const bound = arrivedAt + (pathLen + 5) * 5;
    const removedAt = runUntil(sim, bound, () => lp.raiders.length === 0);
    expect(removedAt, `raider was not removed within ${bound} ticks (leak)`).toBeGreaterThan(0);
    expect(lp.raiders.length).toBe(0);

    // Exactly one pilfer event across the whole lifecycle — no re-arrival, no
    // double-pilfer as it walked back past the keep/defenses.
    expect(sim.state.events.filter((e) => PILFER_RE.test(e)).length).toBe(1);
  });

  it("does not re-pilfer or re-arrive while walking back past the keep", () => {
    const { sim, keep } = simWithKeep();
    const lp = localPlayer(sim.state);
    pushArrivedRaider(sim, keep, { dx: -10, dy: 0 });

    // Run well past the point the raider would have been removed, and confirm
    // stockpiles only ever dropped once (the single arrival pilfer), never twice.
    // Window stays well under the natural first-raid schedule (5 days = 100
    // ticks at TICKS_PER_DAY=20) so a real `RaidSpawnSystem` raid can't sneak
    // in and add a second raider — this test is only about our synthetic one.
    const totalBefore = lp.stockpiles.grain + lp.stockpiles.wood + lp.stockpiles.tools;
    for (let t = 1; t <= 80; t++) sim.scheduler.tick({ tick: t });
    const totalAfter = lp.stockpiles.grain + lp.stockpiles.wood + lp.stockpiles.tools;

    expect(lp.raiders.length).toBe(0); // walked home and despawned
    expect(sim.state.events.filter((e) => PILFER_RE.test(e)).length).toBe(1);
    // A second pilfer would have taken visibly more (strength 20 raider, same
    // undefended keep) — assert the theft is bounded to what one pass can take.
    expect(totalBefore - totalAfter).toBeLessThanOrEqual(strengthCeiling());
  });
});

/** Loose upper bound on a single `applyCozyPilfer` draw at strength 20, undefended keep. */
function strengthCeiling(): number {
  // baseTheft = strength*0.5 = 10; defenseFactor <= 1 (undefended); jitter <= 1.2.
  return Math.ceil(20 * 0.5 * 1.2);
}

describe("cozy raid departure — no garrison interception while leaving", () => {
  it("a leaving raider passing back through a garrison's coverage is not intercepted", () => {
    const { sim, keep } = simWithKeep();
    const lp = localPlayer(sim.state);

    // Site a garrison directly on the raider's walked corridor so it WOULD
    // intercept a non-leaving raider passing through the same tiles.
    const gpos = findClear(sim.terrain, 2, 2, keep.x - 5, keep.y);
    sim.commands.enqueue({ type: "placeBuilding", payload: { buildingType: "garrison", x: gpos.x, y: gpos.y } });
    sim.scheduler.tick({ tick: 0 });

    const raider = pushArrivedRaider(sim, keep, { dx: -10, dy: 0 });
    const strengthAtArrival = raider.strength;

    const arrivedAt = runUntil(sim, 10, () => raider.leaving === true);
    expect(arrivedAt).toBeGreaterThan(0);

    const bound = arrivedAt + (raider.path.length + 5) * 5;
    const removedAt = runUntil(sim, bound, () => lp.raiders.length === 0);
    expect(removedAt).toBeGreaterThan(0);

    // No interception occurred: strength never dropped after arrival/pilfer, and
    // no "harried" event fired, and `intercepted` was never set on the raider.
    expect(sim.state.events.some((e) => /harried/i.test(e))).toBe(false);
    expect(raider.strength).toBe(strengthAtArrival);
    expect(raider.intercepted).not.toBe(true);
  });
});

describe("cozy raid departure — sharp path (cozyThreats:false) unaffected", () => {
  it("a sharp-path raider still resolves and is spliced the same tick (no leaving field set)", () => {
    const sim = bootstrapSim({ seed: SEED, ticksPerDay: TICKS_PER_DAY, worldWidth: WORLD, worldHeight: WORLD, cozyThreats: false });
    const lp = localPlayer(sim.state);
    lp.tier = "Town";
    const g = findClear(sim.terrain, 3, 3, Math.floor(WORLD / 2), Math.floor(WORLD / 2));
    sim.commands.enqueue({ type: "placeBuilding", payload: { buildingType: "keep", x: g.x, y: g.y } });
    sim.scheduler.tick({ tick: 0 });
    expect(lp.keepPosition).not.toBeNull();

    const spawn = findClear(sim.terrain, 1, 1, lp.keepPosition!.x - 10, lp.keepPosition!.y);
    const path = computeRaiderPath(spawn.x, spawn.y, lp.keepPosition!.x, lp.keepPosition!.y, sim.state, lp, sim.terrain);
    expect(path).not.toBeNull();
    const last = path![path!.length - 1]!;
    const raider: RaiderState = {
      id: 1,
      x: last.x, y: last.y, tileX: last.x, tileY: last.y,
      path: path!, pathStep: path!.length,
      strength: 5, // weak, undefended keep — deterministic sack/damage, not repel
      resolved: false,
    };
    lp.raiders.push(raider);

    sim.scheduler.tick({ tick: 1 });

    // Sharp path: resolved and spliced the SAME tick — no `leaving` retrace.
    expect(lp.raiders.length).toBe(0);
    expect(raider.resolved).toBe(true);
    expect(raider.leaving).toBeUndefined();
  });
});
