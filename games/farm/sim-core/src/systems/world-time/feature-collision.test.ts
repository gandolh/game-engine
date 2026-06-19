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
    sys.run({ tick: 0 } as never);
    expect(grid.cells[i]).toBe(1);

    world.despawn(tree);
    sys.run({ tick: 1 } as never);
    expect(grid.cells[i]).toBe(0);
  });

  it("never marks a non-feature tile and leaves ocean/void blocked", () => {
    const world = new World<GameEntity>();
    const grid = buildWalkableGrid();
    const sys = new FeatureCollisionSystem(world, grid);
    sys.run({ tick: 0 } as never);

    expect(grid.cells[idx(grid, PIP.x, PIP.y)]).toBe(0);

    expect(grid.cells[idx(grid, 26, 2)]).toBe(1);
  });
});
