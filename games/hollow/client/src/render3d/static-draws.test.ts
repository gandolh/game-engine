import { describe, it, expect } from "vitest";
import { instanceAABB, boundsOf, multiply, translation, rotationZ, scaling, box } from "@engine/core/render3d";
import type { HollowCommunitySnapshot, HollowSnapshot } from "@hollow/sim-core/sim-bootstrap";
import { TerritoryInstanceCache, packGroundInstance } from "./static-draws";
import { cachedInstanceAABB } from "./agent-bounds";

function community(id: number, territory: { gx: number; gy: number }[]): HollowCommunitySnapshot {
  return { id, members: [], territory, stockpile: {}, norms: { shareRate: 0, cooperationExpectation: 0 } };
}

function snapshot(communities: HollowCommunitySnapshot[]): HollowSnapshot {
  return {
    tick: 0,
    aliveCount: 0,
    agents: [],
    resourceNodes: [],
    communities,
    bornCount: 0,
    diedCount: 0,
    householdCount: 0,
    socialCounts: {},
  };
}

describe("TerritoryInstanceCache", () => {
  const first = { gx: 1, gy: 2 };
  const tiles = [first, { gx: 3, gy: 4 }];

  it("builds once for two frames on one snapshot", () => {
    const cache = new TerritoryInstanceCache();
    const snap = snapshot([community(1, tiles)]);
    const a = cache.get(snap);
    const b = cache.get(snap);
    expect(cache.builds).toBe(1);
    expect(a?.count).toBe(2);
    expect(b?.instances).toBe(a?.instances);
  });

  it("builds once across new snapshot objects with the same territory", () => {
    const cache = new TerritoryInstanceCache();
    const a = cache.get(snapshot([community(1, tiles)]));
    const b = cache.get(
      snapshot([
        community(
          1,
          tiles.map((t) => ({ ...t })),
        ),
      ]),
    );
    expect(cache.builds).toBe(1);
    expect(b?.instances).toBe(a?.instances);
  });

  it("rebuilds when a tile, a tile count or a community id changes", () => {
    const cache = new TerritoryInstanceCache();
    cache.get(snapshot([community(1, tiles)]));
    const moved = cache.get(snapshot([community(1, [first, { gx: 3, gy: 5 }])]));
    expect(cache.builds).toBe(2);
    expect(moved?.instances[12 + 20 + 1]).toBe(5);
    cache.get(snapshot([community(1, [first])]));
    expect(cache.builds).toBe(3);
    cache.get(snapshot([community(2, [first])]));
    expect(cache.builds).toBe(4);
  });

  it("returns null with no territory, and rebuilds when it appears", () => {
    const cache = new TerritoryInstanceCache();
    expect(cache.get(snapshot([community(1, [])]))).toBeNull();
    expect(cache.get(snapshot([community(1, tiles)]))?.count).toBe(2);
  });
});

describe("packGroundInstance", () => {
  it("is one identity row with a white tint", () => {
    const row = packGroundInstance();
    expect(row).toHaveLength(20);
    expect(row[0]).toBe(1);
    expect(row[15]).toBe(1);
  });
});

describe("cachedInstanceAABB", () => {
  it("equals instanceAABB for a rotated, scaled, translated mesh", () => {
    const mesh = box([1, 2, 3], "m");
    const model = multiply(translation([4, -1, 2]), multiply(rotationZ(0.7), scaling([1.2, 0.8, 1.5])));
    expect(cachedInstanceAABB(mesh, model)).toEqual(instanceAABB(mesh, model));
    expect(cachedInstanceAABB(mesh, model)).toEqual(instanceAABB(mesh, model));
    expect(boundsOf(mesh).max).toEqual([1, 2, 3]);
  });
});
