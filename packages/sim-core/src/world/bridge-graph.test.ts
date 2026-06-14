import { describe, it, expect } from "vitest";
import { buildBridgeGraph, isConnected, BRIDGE_WIDTH, type RoadRect } from "./bridge-graph";
import { placeIslands, type RegionSpec, type PlacedIsland } from "./island-placement";
import { createRng } from "@engine/core";
import { type RegionId } from "./regions";

function buildSpecs(): RegionSpec[] {
  const specs: RegionSpec[] = [];
  for (let i = 0; i < 21; i++) {
    specs.push({ id: `farm-${i}` as RegionId, kind: "farm", area: 400, minSide: 14, maxAspect: 2.5 });
    specs.push({ id: `ranch-${i}` as RegionId, kind: "ranch", area: 144, minSide: 10, maxAspect: 2 });
  }
  for (let k = 0; k < 31; k++) {
    specs.push({ id: `special-${k}` as RegionId, kind: "landmark", area: 300, minSide: 8 });
  }
  return specs;
}

function rectsOverlap(a: RoadRect, b: RoadRect): boolean {
  return !(a.maxX < b.minX || b.maxX < a.minX || a.maxY < b.minY || b.maxY < a.minY);
}

const SEEDS = Array.from({ length: 30 }, (_, i) => 0x2000 + i * 0x9e37);
const specs = buildSpecs();

function placeAndBridge(seed: number, delta: number): { islands: PlacedIsland[]; result: ReturnType<typeof buildBridgeGraph> } {
  const islands = placeIslands(seed, specs).islands;
  const result = buildBridgeGraph(islands, createRng(seed).fork("bridges"), delta);
  return { islands, result };
}

describe("buildBridgeGraph — multi-seed properties", () => {
  it("is deterministic per seed", () => {
    for (const seed of SEEDS.slice(0, 5)) {
      const a = placeAndBridge(seed, 0.2);
      const b = placeAndBridge(seed, 0.2);
      expect(a.result).toEqual(b.result);
    }
  });

  it("connects all islands (BSP+overlap yields a connectable layout)", () => {
    let connectable = 0;
    for (const seed of SEEDS) {
      const { islands, result } = placeAndBridge(seed, 0.15);
      if (result !== null) {
        expect(isConnected(islands.length, result.edges)).toBe(true);
        connectable++;
      }
    }
    // The whole point of BSP+overlap bridges is reliable connectivity.
    expect(connectable).toBe(SEEDS.length);
  });

  it("emits only straight, BRIDGE_WIDTH-wide bridges", () => {
    for (const seed of SEEDS) {
      const { result } = placeAndBridge(seed, 0.2);
      if (!result) continue;
      for (const r of result.roads) {
        const w = r.maxX - r.minX + 1;
        const h = r.maxY - r.minY + 1;
        // Straight = one dimension is exactly the bridge width.
        expect(w === BRIDGE_WIDTH || h === BRIDGE_WIDTH).toBe(true);
      }
    }
  });

  it("bridges never overlap an island (other than their endpoints)", () => {
    for (const seed of SEEDS) {
      const { islands, result } = placeAndBridge(seed, 0.25);
      if (!result) continue;
      for (const r of result.roads) {
        for (const isl of islands) {
          // Endpoints share the facing edge but the corridor is strictly between
          // the sides (gap>0), so it must never overlap any island body.
          expect(rectsOverlap(r, isl.bounds)).toBe(false);
        }
      }
    }
  });

  it("loopDelta controls edge count (more loops with higher delta)", () => {
    for (const seed of SEEDS.slice(0, 10)) {
      const tree = placeAndBridge(seed, 0);
      const loopy = placeAndBridge(seed, 0.5);
      if (!tree.result || !loopy.result) continue;
      const n = tree.islands.length;
      // Spanning tree has exactly n-1 edges; loopy has at least that many.
      expect(tree.result.edges.length).toBe(n - 1);
      expect(loopy.result.edges.length).toBeGreaterThanOrEqual(tree.result.edges.length);
    }
  });
});
