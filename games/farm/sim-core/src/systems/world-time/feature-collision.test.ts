import { describe, it, expect } from "vitest";
import { World } from "@engine/core";
import type { GameEntity } from "../../components";
import { FeatureCollisionSystem } from "./feature-collision";
import { buildWalkableGrid } from "../../world/walkable-grid";
import { getRegion } from "../../world/regions";

const PIP = getRegion("farm-pip").center;

function idx(grid: { width: number }, x: number, y: number): number {
  return y * grid.width + x;
}

describe("FeatureCollisionSystem", () => {
  it("blocks a tree/stone tile in the grid, and clears it when the feature is gone", () => {
    const world = new World<GameEntity>();
    const grid = buildWalkableGrid();
    const sys = new FeatureCollisionSystem(world, grid);
    const i = idx(grid, PIP.x, PIP.y);

    expect(grid.cells[i]).toBe(0);

    const tree = world.spawn({
      transform: { x: PIP.x, y: PIP.y, prevX: PIP.x, prevY: PIP.y, rotation: 0 },
      tileFeature: { kind: "tree", tileX: PIP.x, tileY: PIP.y, regionId: "farm-pip", ownerId: 1 },
    });
    sys.run({ tick: 0 });
    expect(grid.cells[i]).toBe(1);

    world.despawn(tree);
    sys.run({ tick: 1 });
    expect(grid.cells[i]).toBe(0);
  });

  it("never marks a non-feature tile and leaves ocean/void blocked", () => {
    const world = new World<GameEntity>();
    const grid = buildWalkableGrid();
    const sys = new FeatureCollisionSystem(world, grid);
    sys.run({ tick: 0 });

    expect(grid.cells[idx(grid, PIP.x, PIP.y)]).toBe(0);

    expect(grid.cells[idx(grid, 26, 2)]).toBe(1);
  });
});

describe("FeatureCollisionSystem — stamp only on change", () => {
  const T = { x: 0, y: 0, prevX: 0, prevY: 0, rotation: 0 };

  it("leaves grid.cells alone while nothing joined or left, and restamps when something does", () => {
    const world = new World<GameEntity>();
    const grid = buildWalkableGrid();
    const sys = new FeatureCollisionSystem(world, grid);
    const i = idx(grid, PIP.x, PIP.y);
    const j = idx(grid, PIP.x + 1, PIP.y);

    sys.run({ tick: 0 });
    // Someone else writes a cell; with no feature change the system must not touch it.
    grid.cells[j] = 1;
    sys.run({ tick: 1 });
    expect(grid.cells[j]).toBe(1);

    const tree = world.spawn({
      transform: T,
      tileFeature: { kind: "tree", tileX: PIP.x, tileY: PIP.y, regionId: "farm-pip", ownerId: 1 },
    });
    sys.run({ tick: 2 });
    expect(grid.cells[i]).toBe(1);

    world.despawn(tree);
    sys.run({ tick: 3 });
    expect(grid.cells[i]).toBe(0);
  });

  it("stamps a solid and clears it when the solid leaves", () => {
    const world = new World<GameEntity>();
    const grid = buildWalkableGrid();
    const sys = new FeatureCollisionSystem(world, grid);
    const i = idx(grid, PIP.x, PIP.y);
    const solid = world.spawn({ solid: { isSolid: true, tileX: PIP.x, tileY: PIP.y } });
    sys.run({ tick: 0 });
    expect(grid.cells[i]).toBe(1);
    world.despawn(solid);
    sys.run({ tick: 1 });
    expect(grid.cells[i]).toBe(0);
  });
});
