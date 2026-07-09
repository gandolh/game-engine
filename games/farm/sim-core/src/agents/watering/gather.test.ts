import { describe, it, expect } from "vitest";
import type { GameEntity, TileFeature } from "../../components";
import { deliberateResourceZoneVisit } from "./gather";

function makeFarmer(over: Partial<GameEntity> = {}): GameEntity {
  return {
    id: 1,
    transform: { x: 0, y: 0, prevX: 0, prevY: 0, rotation: 0 },
    beliefs: { data: {}, revision: 0 },
    intentions: { queue: [] },
    farmer: { name: "Tester", currentRegion: "farm-cora", homeRegion: "farm-cora" },
    ...over,
  } as GameEntity;
}

const bush: TileFeature = { kind: "bush", tileX: 1, tileY: 1, regionId: "farm-cora", ownerId: 1 };

describe("deliberateResourceZoneVisit", () => {
  it("still travels to the quarry when the only owned feature is a bush (kind-blind gate, item 23)", () => {

    const f = makeFarmer();
    deliberateResourceZoneVisit(f, [bush], "stone", 9);
    expect(f.intentions!.queue.some((i) => i.kind === "travel")).toBe(true);
  });

  it("still travels to the forest when the only owned feature is a bush (kind-blind gate, item 23)", () => {
    const f = makeFarmer();
    deliberateResourceZoneVisit(f, [bush], "tree", 9);
    expect(f.intentions!.queue.some((i) => i.kind === "travel")).toBe(true);
  });

  it("does not travel when a matching-kind feature is already owned", () => {
    const tree: TileFeature = { kind: "tree", tileX: 2, tileY: 2, regionId: "farm-cora", ownerId: 1 };
    const f = makeFarmer();
    deliberateResourceZoneVisit(f, [tree], "tree", 9);
    expect(f.intentions!.queue.some((i) => i.kind === "travel")).toBe(false);
  });
});
