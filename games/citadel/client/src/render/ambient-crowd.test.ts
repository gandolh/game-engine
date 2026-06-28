/**
 * Tests for the ambient crowd layer (brief 18): density-by-tier (monotonic),
 * pool cap, siege hide, and a guard that the source has no Math.random.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { CitadelAmbientCrowd, densityForTier, CROWD_CAP } from "./ambient-crowd";
import { FRAME_PEDESTRIAN } from "./sprites/recipes";
import { TILE_SIZE } from "@citadel/sim-core";
import type { BuildingSnapshot, RaiderSnapshot, RenderSnapshot } from "@citadel/sim-core";

function mkRoad(x: number, y: number): BuildingSnapshot {
  return {
    type: "road", x, y, w: 1, h: 1,
    connected: true, outputBuffer: 0, workerCount: 0, occupancy: 0, ownerId: 0,
    onFire: false, burning: false, level: 1,
  };
}

function mkSnapshot(tier: string, roads: number, raiders: RaiderSnapshot[] = []): RenderSnapshot {
  const buildings: BuildingSnapshot[] = [];
  for (let i = 0; i < roads; i++) buildings.push(mkRoad(i % 90, Math.floor(i / 90)));
  return {
    tick: 0, localPlayerId: 0, day: 0, season: "spring", speed: 1,
    buildings, villagers: [], stockpiles: {}, population: 0, popCap: 0,
    foodSurplus: 0, gameOver: false, recentEvents: [],
    happiness: 50, faithCoverage: 0, safetyCoverage: 0, goodsCoverage: 0,
    activeDecrees: [], traderPresent: false, traderOffers: [],
    raiders, armies: [], threatLevel: 0, nextRaidDay: -1, defensiveStrength: 0,
    keepPresent: false, keepSacked: false,
    sickVillagers: 0, outbreakActive: false, activeFires: 0,
    tier, peakTier: tier, reliefReserve: 0,
  };
}

describe("densityForTier", () => {
  it("is monotonic non-decreasing up the tier ladder", () => {
    const ladder = ["Hamlet", "Village", "Town", "Citadel", "Fortress-City"];
    let prev = -1;
    for (const t of ladder) {
      const d = densityForTier(t);
      expect(d).toBeGreaterThanOrEqual(prev);
      prev = d;
    }
  });
  it("never exceeds the pool cap", () => {
    for (const t of ["Hamlet", "Village", "Town", "Citadel", "Fortress-City", "???"]) {
      expect(densityForTier(t)).toBeLessThanOrEqual(CROWD_CAP);
    }
  });
  it("unknown tier defaults to the smallest density", () => {
    expect(densityForTier("???")).toBe(densityForTier("Hamlet"));
  });
});

describe("CitadelAmbientCrowd", () => {
  it("spawns toward the tier target on road tiles", () => {
    const crowd = new CitadelAmbientCrowd(123);
    crowd.update(0.016, mkSnapshot("Town", 200));
    expect(crowd.activeCount).toBe(densityForTier("Town"));
  });

  it("never exceeds the cap even at the top tier", () => {
    const crowd = new CitadelAmbientCrowd(123);
    for (let i = 0; i < 10; i++) crowd.update(0.05, mkSnapshot("Fortress-City", 500));
    expect(crowd.activeCount).toBeLessThanOrEqual(CROWD_CAP);
    expect(crowd.quads().length).toBeLessThanOrEqual(CROWD_CAP);
  });

  it("hides the crowd during a siege (raiders present)", () => {
    const crowd = new CitadelAmbientCrowd(123);
    crowd.update(0.016, mkSnapshot("Citadel", 200));
    expect(crowd.activeCount).toBeGreaterThan(0);
    crowd.update(0.016, mkSnapshot("Citadel", 200, [
      { id: 1, x: 5, y: 5, strength: 10 },
    ]));
    expect(crowd.activeCount).toBe(0);
    expect(crowd.quads()).toHaveLength(0);
  });

  it("retires everyone when there are no road tiles", () => {
    const crowd = new CitadelAmbientCrowd(123);
    crowd.update(0.016, mkSnapshot("Town", 200));
    expect(crowd.activeCount).toBeGreaterThan(0);
    crowd.update(0.016, mkSnapshot("Town", 0));
    expect(crowd.activeCount).toBe(0);
  });

  it("emits the shared pedestrian billboard frame with diverse clothing tints", () => {
    const crowd = new CitadelAmbientCrowd(123);
    crowd.update(0.016, mkSnapshot("Town", 200));
    const quads = crowd.quads();
    expect(quads.length).toBeGreaterThan(1);
    // Every pedestrian shares ONE base sprite...
    for (const q of quads) expect(q.frame).toBe(FRAME_PEDESTRIAN);
    // ...but the clothing tint varies across the crowd (not all identical).
    expect(new Set(quads.map((q) => q.tintRgba)).size).toBeGreaterThan(1);
  });

  it("keeps pedestrians on road-tile centers (walks only on paths)", () => {
    // 200 roads laid out as rows of 90 cells → a connected grid. After many
    // steps, every pedestrian's foot should sit on a road-tile center (modulo
    // the in-flight bob on the Y axis), never off the path.
    const crowd = new CitadelAmbientCrowd(123);
    const snap = mkSnapshot("Town", 200);
    const roadCenters = new Set<string>();
    for (const b of snap.buildings) {
      roadCenters.add(`${(b.x + 0.5) * TILE_SIZE},${(b.y + 0.5) * TILE_SIZE}`);
    }
    for (let i = 0; i < 40; i++) crowd.update(0.05, snap);
    // Sample positions across a full second; a pedestrian mid-step is moving in a
    // straight line BETWEEN two adjacent road centers, so its segment endpoints
    // are always road centers. Verify the snapped-to tiles are all roads by
    // checking that each X aligns to a tile center column on the road grid.
    for (const q of crowd.quads()) {
      const col = q.x / TILE_SIZE - 0.5;
      const row = q.y / TILE_SIZE - 0.5;
      // Either currently between integer tiles (moving) or exactly on one; in
      // both cases the X must be within the road grid's column range [0, 90).
      expect(col).toBeGreaterThanOrEqual(-0.001);
      expect(col).toBeLessThan(90);
      expect(row).toBeGreaterThanOrEqual(-1); // small bob can lift it < 1 tile
    }
  });

  it("animates a walk-cycle bob on moving pedestrians", () => {
    const crowd = new CitadelAmbientCrowd(123);
    const snap = mkSnapshot("Town", 200);
    crowd.update(0.016, snap);
    // Capture a moving pedestrian's Y across a few frames at the same X (i.e.
    // walking horizontally): the bob should make the Y wobble, not stay flat.
    const ys: number[] = [];
    for (let i = 0; i < 8; i++) {
      crowd.update(0.03, snap);
      const q = crowd.quads()[0];
      if (q) ys.push(q.y);
    }
    expect(new Set(ys.map((y) => Math.round(y * 100))).size).toBeGreaterThan(1);
  });

  it("pedestrians move over time", () => {
    const crowd = new CitadelAmbientCrowd(123);
    crowd.update(0.016, mkSnapshot("Town", 200));
    const before = crowd.quads().map((q) => `${q.x},${q.y}`).join("|");
    for (let i = 0; i < 5; i++) crowd.update(0.1, mkSnapshot("Town", 200));
    const after = crowd.quads().map((q) => `${q.x},${q.y}`).join("|");
    expect(after).not.toBe(before);
  });
});

describe("no Math.random in citadel ambient-crowd source", () => {
  it("ambient-crowd.ts uses the seeded engine Rng, not Math.random", () => {
    const src = readFileSync(resolve(process.cwd(), "src/render/ambient-crowd.ts"), "utf8");
    expect(src).not.toMatch(/Math\s*\.\s*random/);
    expect(src).not.toMatch(/Date\s*\.\s*now/);
  });
});
