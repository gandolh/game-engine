import { describe, it, expect } from "vitest";
import { World } from "@engine/core";
import type { GameEntity } from "../components";
import { FeatureCells } from "./feature-cells";

type Kind = "tree" | "stone" | "bush";

function spawnFeature(world: World<GameEntity>, kind: Kind, tx: number, ty: number): GameEntity {
  return world.spawn({ tileFeature: { kind, tileX: tx, tileY: ty, regionId: "farm-pip", ownerId: 1 } });
}

/** The scan the index replaces: first tile feature on the tile in query order. */
function scan(world: World<GameEntity>, tx: number, ty: number): GameEntity | undefined {
  for (const f of world.query("tileFeature")) {
    if (f.tileFeature.tileX === tx && f.tileFeature.tileY === ty) return f;
  }
  return undefined;
}

describe("FeatureCells", () => {
  it("returns the first feature in spawn order for a shared tile", () => {
    const world = new World<GameEntity>();
    const cells = new FeatureCells(world);
    const a = spawnFeature(world, "bush", 5, 5);
    spawnFeature(world, "tree", 5, 5);
    expect(cells.featureAt(5, 5)).toBe(a);
    expect(cells.featureAt(5, 5)).toBe(scan(world, 5, 5));
  });

  it("agrees with the scan after despawns and late joins", () => {
    const world = new World<GameEntity>();
    const cells = new FeatureCells(world);
    const a = spawnFeature(world, "tree", 1, 1);
    const b = spawnFeature(world, "bush", 1, 1);
    const c = spawnFeature(world, "stone", 2, 2);
    expect(cells.featureAt(1, 1)).toBe(a);
    world.despawn(a);
    expect(cells.featureAt(1, 1)).toBe(b);
    const late = world.spawn({ transform: { x: 0, y: 0, prevX: 0, prevY: 0, rotation: 0 } });
    world.addComponent(late, "tileFeature", { kind: "tree", tileX: 1, tileY: 1, regionId: "farm-pip", ownerId: 1 });
    expect(cells.featureAt(1, 1)).toBe(b);
    world.despawn(b);
    expect(cells.featureAt(1, 1)).toBe(late);
    for (const [x, y] of [
      [1, 1],
      [2, 2],
      [3, 3],
    ] as const) {
      expect(cells.featureAt(x, y)).toBe(scan(world, x, y));
    }
    expect(cells.featureAt(2, 2)).toBe(c);
  });

  it("reports solids, rebuilds only on change, and handles off-grid tiles", () => {
    const world = new World<GameEntity>();
    const cells = new FeatureCells(world);
    expect(cells.blockedAt(3, 3)).toBe(false);
    const r0 = cells.revision;
    expect(cells.revision).toBe(r0);
    const solid = world.spawn({ solid: { isSolid: true, tileX: 3, tileY: 3 } });
    expect(cells.blockedAt(3, 3)).toBe(true);
    expect(cells.revision).toBe(r0 + 1);
    spawnFeature(world, "tree", -2, 400);
    expect(cells.blockedAt(-2, 400)).toBe(true);
    world.despawn(solid);
    expect(cells.blockedAt(3, 3)).toBe(false);
  });

  it("does not rebuild for an unrelated entity", () => {
    const world = new World<GameEntity>();
    const cells = new FeatureCells(world);
    const r0 = cells.revision;
    world.spawn({ transform: { x: 0, y: 0, prevX: 0, prevY: 0, rotation: 0 } });
    expect(cells.revision).toBe(r0);
  });
});
