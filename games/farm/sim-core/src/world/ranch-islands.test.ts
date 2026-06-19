import { describe, it, expect } from "vitest";
import { World } from "@engine/core";
import { REGIONS, ROADS, ranchForFarm, regionAt, WORLD_WIDTH, WORLD_HEIGHT, forEachLandTile } from "./regions";
import type { RegionId } from "./regions";
import { sameComponent, _resetComponentMap } from "./connectivity";
import { ZERO_CROPS } from "../economy";
import type { GameEntity, FarmerFsmState } from "../components";
import { handleBuildPen } from "../systems/act/handlers/build";
import type { ActingFarmer } from "../systems/act/types";

const farmIds = REGIONS.filter((r) => r.kind === "farm").map((r) => r.id);
const ranchIds = REGIONS.filter((r) => r.kind === "ranch").map((r) => r.id);

function oceanGap(
  a: { minX: number; minY: number; maxX: number; maxY: number },
  b: { minX: number; minY: number; maxX: number; maxY: number },
): number {
  const gx = Math.max(b.minX - a.maxX - 1, a.minX - b.maxX - 1);
  const gy = Math.max(b.minY - a.maxY - 1, a.minY - b.maxY - 1);
  return Math.max(gx, gy);
}

function roadTouches(
  road: { minX: number; minY: number; maxX: number; maxY: number },
  b: { minX: number; minY: number; maxX: number; maxY: number },
): boolean {
  const exp = { minX: road.minX - 1, minY: road.minY - 1, maxX: road.maxX + 1, maxY: road.maxY + 1 };
  return !(exp.maxX < b.minX || b.maxX < exp.minX || exp.maxY < b.minY || b.maxY < exp.minY);
}

describe("per-farm ranch islands", () => {
  it("there are exactly 21 ranch regions, one per farm", () => {
    expect(farmIds).toHaveLength(21);
    expect(ranchIds).toHaveLength(21);
    for (const id of ranchIds) expect(id).toMatch(/^ranch-\d+$/);

    expect(new Set(ranchIds).size).toBe(21);
  });

  it("ranchForFarm maps every farm to a distinct existing ranch", () => {
    const mapped = new Set<RegionId>();
    for (const farmId of farmIds) {
      const ranch = ranchForFarm(farmId);
      expect(ranch, `ranch for ${farmId}`).toBeDefined();
      expect(REGIONS.some((r) => r.id === ranch), `${ranch} exists`).toBe(true);
      expect(mapped.has(ranch!), `${ranch} not reused`).toBe(false);
      mapped.add(ranch!);
    }
    expect(mapped.size).toBe(21);

    expect(ranchForFarm("village" as RegionId)).toBeUndefined();
  });

  it("every ranch keeps a ≥2-tile ocean gap from every other region", () => {
    for (const id of ranchIds) {
      const ranch = REGIONS.find((r) => r.id === id)!;
      for (const other of REGIONS) {
        if (other.id === id) continue;
        expect(
          oceanGap(ranch.bounds, other.bounds),
          `${id} and ${other.id} must keep ≥2 ocean tiles`,
        ).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it("every ranch is reachable from its farm over the bridge graph", () => {
    // Brief 93: ranches are placed islands connected by the world's overlap
    // bridge graph — not by a dedicated farm↔ranch bridge. The requirement is
    // that a farmer can WALK from a farm to its ranch, i.e. they share a walkable
    // component (proven below). This replaces the old direct-edge assertion.
    _resetComponentMap();
    for (const farmId of farmIds) {
      const ranchId = ranchForFarm(farmId)!;
      const farm = REGIONS.find((r) => r.id === farmId)!.center;
      const ranch = REGIONS.find((r) => r.id === ranchId)!.center;
      expect(
        sameComponent(farm.x, farm.y, ranch.x, ranch.y),
        `${farmId} reachable from ${ranchId}`,
      ).toBe(true);
    }
    _resetComponentMap();
  });

  it("every ranch center is in the same walkable component as its farm center", () => {
    _resetComponentMap();
    for (const farmId of farmIds) {
      const ranchId = ranchForFarm(farmId)!;
      const farm = REGIONS.find((r) => r.id === farmId)!.center;
      const ranch = REGIONS.find((r) => r.id === ranchId)!.center;
      expect(
        sameComponent(farm.x, farm.y, ranch.x, ranch.y),
        `${farmId} center connected to ${ranchId} center`,
      ).toBe(true);
    }
    _resetComponentMap();
  });

  it("every ranch LAND tile is walkable and regionAt === its ranch id", () => {
    // Ranches are organic masks now: only the mask LAND tiles are the ranch.
    // Each must be in-world and resolve to its id; every ranch must keep a
    // substantial land body (its forced core + carved blob).
    for (const id of ranchIds) {
      const region = REGIONS.find((r) => r.id === id)!;
      let land = 0;
      forEachLandTile(region, (x, y) => {
        expect(x >= 0 && y >= 0 && x < WORLD_WIDTH && y < WORLD_HEIGHT, `${id} (${x},${y}) in-world`).toBe(true);
        expect(regionAt(x, y), `${id} tile (${x},${y})`).toBe(id);
        land++;
      });
      expect(land, `${id} should keep a substantial land body`).toBeGreaterThanOrEqual(16);
    }
  });

  it("handleBuildPen places a built pen on the farm's ranch, not the farm", () => {
    const world = new World<GameEntity>();
    const homeRegion = "farm-pip" as RegionId;
    const expectedRanch = ranchForFarm(homeRegion)!;

    const farmer = world.spawn({
      farmer: { name: "F", currentRegion: "carpentry" as const, homeRegion },
      fsm: { current: "ACT" as FarmerFsmState, enteredTick: 0 },
      intentions: { queue: [] },
      transform: { x: 0, y: 0, prevX: 0, prevY: 0, rotation: 0 },
      inventory: { gold: 999, crops: { ...ZERO_CROPS }, seeds: { ...ZERO_CROPS }, tools: [] },
      resources: { wood: 0, stone: 0, ironOre: 0, geodes: 0 },
      beliefs: { data: { currentDay: 0 }, revision: 0 },
    }) as ActingFarmer;

    handleBuildPen(
      farmer,
      { kind: "build-pen", data: { penKind: "coop", animal: "chicken" }, priority: 0 },
      world,
    );

    const pens = [...world.query("pen")];
    expect(pens).toHaveLength(1);
    const pen = pens[0]!.pen;
    expect(pen.regionId).toBe(expectedRanch);
    expect(pen.regionId).not.toBe(homeRegion);

    expect(regionAt(pen.tileX, pen.tileY)).toBe(expectedRanch);
  });
});
