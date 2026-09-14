/**
 * audit-23: placement-rejection tests that exercise `placeOne` / `placeDragged` /
 * `describeReject` / `actsAsKeepAnchor` directly against a hand-built `SimState` —
 * WITHOUT booting the whole sim (no scheduler, no systems, no command queue, no
 * `bootstrapSim` at all). Before the extraction this coverage was impossible: the
 * placement logic only existed as closures inside `bootstrapSim`.
 */
import { describe, it, expect } from "vitest";
import { World, OccupancyGrid, createRng, rebuildWalkable } from "@engine/core";
import type { BuildingEntity } from "../entities/building";
import type { VillagerEntity } from "../entities/villager";
import type { SimState } from "../sim-state";
import { makePlayerState } from "../sim-state";
import { TerrainType } from "../world/terrain";
import type { TerrainGrid } from "../world/terrain";
import {
  createPlacementContext,
  placeOne,
  placeDragged,
  describeReject,
  actsAsKeepAnchor,
  isWalkableTile,
  rebakeWalkable,
} from "./placement";

/** A 32×32 all-grass terrain grid (TerrainType.Grass === 0, the zeroed default). */
function makeTerrain(width = 32, height = 32): TerrainGrid {
  return { cells: new Uint8Array(width * height), width, height };
}

/** Minimal hand-built SimState — deliberately NOT going through bootstrapSim. */
function makeState(width = 32, height = 32): SimState {
  return {
    width,
    height,
    ticksPerDay: 20,
    daysPerYear: 16,
    buildingWorld: new World<BuildingEntity>(),
    villagerWorld: new World<VillagerEntity>(),
    occupancy: new OccupancyGrid(width, height),
    roadGrid: new Uint8Array(width * height),
    buildingTiles: new Map<number, number>(),
    buildingState: new Map(),
    nextVillagerId: 1,
    connectivityDirty: true,
    events: [],
    eventsSeq: 0,
    rng: createRng(1).fork("placement-test"),
    day: 0,
    players: [makePlayerState(0)],
    localId: 0,
    armies: [],
    nextArmyId: 1,
    commandLog: [],
  };
}

describe("placement (unit, no bootstrapSim)", () => {
  it("rejects a tier-locked building type and mutates nothing", () => {
    const state = makeState();
    const terrain = makeTerrain();
    const ctx = createPlacementContext({ state, terrain, chargeBuildCost: false, enforceTerritory: false, multiplayer: false });

    // "wall" is Village-tier-locked (TIER_LOCK); a fresh Hamlet player can't place it.
    const r = placeOne(ctx, "wall", 5, 5);
    expect(r).toBe("tier");
    expect(describeReject(state, "wall", r)).toContain("Village");

    // Nothing was mutated on rejection.
    expect([...state.buildingWorld.query("building")]).toHaveLength(0);
    expect(state.occupancy.isOccupied(5, 5)).toBe(false);
    expect(state.buildingTiles.size).toBe(0);
  });

  it("places a building, then rejects a second placement on the same tiles as occupied", () => {
    const state = makeState();
    const terrain = makeTerrain();
    const ctx = createPlacementContext({ state, terrain, chargeBuildCost: false, enforceTerritory: false, multiplayer: false });

    const ok = placeOne(ctx, "house", 10, 10); // 2×2, no tier lock, no terrain req
    expect(ok).toBe("ok");
    expect([...state.buildingWorld.query("building")]).toHaveLength(1);
    expect(state.buildingTiles.has(10 * state.width + 10)).toBe(true);

    const rejected = placeOne(ctx, "house", 10, 10);
    expect(rejected).toBe("occupied");
    expect(describeReject(state, "house", rejected)).toContain("taken");
    // The rejected attempt spawned nothing new.
    expect([...state.buildingWorld.query("building")]).toHaveLength(1);
  });

  it("rejects an out-of-bounds placement", () => {
    const state = makeState();
    const terrain = makeTerrain();
    const ctx = createPlacementContext({ state, terrain, chargeBuildCost: false, enforceTerritory: false, multiplayer: false });

    const r = placeOne(ctx, "house", state.width - 1, state.height - 1); // 2×2 footprint runs off the edge
    expect(r).toBe("bounds");
    expect(describeReject(state, "house", r)).toContain("off the map");
  });

  it("rejects for cost when chargeBuildCost is on and the player is broke", () => {
    const state = makeState();
    const terrain = makeTerrain();
    const ctx = createPlacementContext({ state, terrain, chargeBuildCost: true, enforceTerritory: false, multiplayer: false });

    const r = placeOne(ctx, "house", 4, 4);
    expect(r).toBe("cost");
    expect([...state.buildingWorld.query("building")]).toHaveLength(0);
  });

  it("placeDragged coalesces a fully tier-locked drag into one summary event", () => {
    const state = makeState();
    const terrain = makeTerrain();
    const ctx = createPlacementContext({ state, terrain, chargeBuildCost: false, enforceTerritory: false, multiplayer: false });

    const tiles = [{ x: 1, y: 1 }, { x: 2, y: 1 }, { x: 3, y: 1 }];
    placeDragged(ctx, "wall", tiles); // Village-tier-locked, so every tile is rejected
    expect(state.events).toHaveLength(1);
    expect(state.events[0]).toContain("3 walls need Village tier");
    expect([...state.buildingWorld.query("building")]).toHaveLength(0);
  });

  it("actsAsKeepAnchor: solo town-hall is civic-only, MP town-hall anchors", () => {
    expect(actsAsKeepAnchor("town-hall", false)).toBe(false);
    expect(actsAsKeepAnchor("town-hall", true)).toBe(true);
    expect(actsAsKeepAnchor("keep", false)).toBe(true);
    expect(actsAsKeepAnchor("keep", true)).toBe(true);
    expect(actsAsKeepAnchor("house", false)).toBe(false);
  });
});

describe("audit-10: rebakeWalkable patches in place instead of rebuilding the whole grid", () => {
  /**
   * `rebakeWalkable(ctx, mode, fp)` mutates `ctx.walkable` IN PLACE (see
   * `patchWalkable`); the only case that reassigns the array to a new
   * instance is the fp-less full rebuild (`createPlacementContext`'s initial
   * bake). So "how many full rebuilds happened" is directly observable as
   * "did `ctx.walkable`'s object identity ever change" — no spy/mock needed,
   * and it can't be fooled by an implementation that still full-rebuilds but
   * happens to produce the same values.
   */
  it("a 60-tile road drag performs ZERO full-grid rebuilds — only per-tile in-place patches", () => {
    const state = makeState(80, 80);
    const terrain = makeTerrain(80, 80);
    const ctx = createPlacementContext({ state, terrain, chargeBuildCost: false, enforceTerritory: false, multiplayer: false });

    const afterBootstrapBake = ctx.walkable; // the ONE full rebuild (createPlacementContext)

    const tiles = Array.from({ length: 60 }, (_v, i) => ({ x: i, y: 40 }));
    placeDragged(ctx, "road", tiles);

    // Same array instance ⇒ every one of the 60 placements patched in place;
    // rebakeWalkable's fp-less (full-rebuild) branch never ran during the drag.
    expect(ctx.walkable).toBe(afterBootstrapBake);
    expect(state.buildingTiles.size).toBe(60); // the drag actually landed
    for (const t of tiles) {
      // `ctx.walkable` is the BUILD/obstacle grid (can another footprint go
      // here?), not the villager-path grid (that's `villagerWalkable`, keyed
      // off `roadGrid`/`buildingTiles`) — a placed road occupies its own tile
      // like any other building, so it reads 0 here. Each tile got PATCHED to
      // that correct value, which is what this test actually proves.
      expect(ctx.walkable[t.y * state.width + t.x]).toBe(0); // road tile now occupied
    }
  });

  it("a single placeOne patches in place too (not just placeDragged's loop)", () => {
    const state = makeState(32, 32);
    const terrain = makeTerrain(32, 32);
    const ctx = createPlacementContext({ state, terrain, chargeBuildCost: false, enforceTerritory: false, multiplayer: false });
    const afterBootstrapBake = ctx.walkable;

    expect(placeOne(ctx, "house", 10, 10)).toBe("ok");
    expect(ctx.walkable).toBe(afterBootstrapBake);
    expect(ctx.walkable[10 * state.width + 10]).toBe(0); // now occupied
  });

  /**
   * The safety argument for patch-in-place: for ANY sequence of placements/
   * demolitions, the resulting `ctx.walkable` must be byte-identical to what
   * a from-scratch full rebuild (the pre-audit-10 behaviour) would produce
   * from the same final `occupancy` + `roadGrid` state. `isWalkableTile` is
   * the widest predicate (terrain OR road/bridge) — since a buildable-terrain
   * cell reads walkable under both `"buildable"` and `"roads"` regardless of
   * roadGrid, and a non-buildable cell only differs when it was bridged (and
   * bridges always patch under `"roads"`), comparing against a full
   * `isWalkableTile` rebuild is a valid oracle no matter which mode patched
   * which cell along the way.
   */
  function assertMatchesFullRebuildOracle(state: SimState, terrain: TerrainGrid, ctx: { walkable: Uint8Array }): void {
    const oracle = rebuildWalkable(
      state.width,
      state.height,
      state.occupancy,
      (tx, ty) => isWalkableTile(state, terrain, tx, ty),
    );
    expect(Array.from(ctx.walkable)).toEqual(Array.from(oracle));
  }

  it("patched grid matches a full-rebuild oracle after a mixed placement batch", () => {
    const state = makeState(48, 48);
    const terrain = makeTerrain(48, 48);
    const ctx = createPlacementContext({ state, terrain, chargeBuildCost: false, enforceTerritory: false, multiplayer: false });

    expect(placeOne(ctx, "house", 5, 5)).toBe("ok"); // 2×2, "buildable" mode
    placeDragged(ctx, "road", [{ x: 10, y: 10 }, { x: 11, y: 10 }, { x: 12, y: 10 }]);
    expect(placeOne(ctx, "storehouse", 20, 20)).toBe("ok");

    assertMatchesFullRebuildOracle(state, terrain, ctx);
  });

  it("patched grid matches the oracle for a bridge placement (the roads-mode path)", () => {
    const state = makeState(16, 16);
    const terrain = makeTerrain(16, 16);
    // Carve a single water tile at (8,8) — isWaterTile/isWalkableTile both key off this.
    terrain.cells[8 * 16 + 8] = TerrainType.Water;
    const ctx = createPlacementContext({ state, terrain, chargeBuildCost: false, enforceTerritory: false, multiplayer: false });

    // A "road" command onto a water tile auto-decks into a bridge (placeOne's own rule).
    expect(placeOne(ctx, "road", 8, 8)).toBe("ok");
    // Same obstacle-grid semantics as above: the bridge deck occupies its own
    // tile (nothing else can be built on it), so `ctx.walkable` reads 0 here
    // too — villager/raider crossability is a separate grid (`roadGrid`).
    expect(ctx.walkable[8 * 16 + 8]).toBe(0);

    assertMatchesFullRebuildOracle(state, terrain, ctx);
  });

  it("patched grid matches the oracle after a demolish (including a demolished bridge)", () => {
    const state = makeState(16, 16);
    const terrain = makeTerrain(16, 16);
    terrain.cells[8 * 16 + 8] = TerrainType.Water;
    const ctx = createPlacementContext({ state, terrain, chargeBuildCost: false, enforceTerritory: false, multiplayer: false });

    expect(placeOne(ctx, "house", 2, 2)).toBe("ok");
    expect(placeOne(ctx, "road", 8, 8)).toBe("ok"); // becomes a bridge

    // Demolish mirrors sim-bootstrap.ts's `demolish` handler exactly (same order:
    // clear tile bookkeeping, clear the road-grid entry for a road/bridge, free
    // occupancy, THEN rebakeWalkable through the real "roads"-mode + fp path).
    function demolish(x: number, y: number, w: number, h: number, isRoad: boolean): void {
      for (let dy = 0; dy < h; dy++) {
        for (let dx = 0; dx < w; dx++) state.buildingTiles.delete((y + dy) * state.width + (x + dx));
      }
      if (isRoad) state.roadGrid[y * state.width + x] = 0;
      const freedFp = { x, y, w, h };
      state.occupancy.remove(freedFp);
      rebakeWalkable(ctx, "roads", freedFp);
    }
    demolish(2, 2, 2, 2, false); // house
    demolish(8, 8, 1, 1, true); // the bridge — must stop reading walkable (water, no more road)

    expect(ctx.walkable[8 * 16 + 8]).toBe(0); // demolished bridge: water again, not walkable
    expect(ctx.walkable[2 * 16 + 2]).toBe(1); // demolished house: bare grass, walkable again

    assertMatchesFullRebuildOracle(state, terrain, ctx);
  });
});
