/**
 * Tests for the ambient crowd layer (brief 18): density-by-tier (monotonic),
 * pool cap, siege hide, and a guard that the source has no Math.random.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { CitadelAmbientCrowd, densityForTier, CROWD_CAP } from "./ambient-crowd";
import type { BuildingSnapshot, RaiderSnapshot, RenderSnapshot } from "@citadel/sim-core";

function mkRoad(x: number, y: number): BuildingSnapshot {
  return {
    type: "road", x, y, w: 1, h: 1,
    connected: true, outputBuffer: 0, workerCount: 0,
    onFire: false, burning: false, level: 1,
  };
}

function mkSnapshot(tier: string, roads: number, raiders: RaiderSnapshot[] = []): RenderSnapshot {
  const buildings: BuildingSnapshot[] = [];
  for (let i = 0; i < roads; i++) buildings.push(mkRoad(i % 90, Math.floor(i / 90)));
  return {
    tick: 0, day: 0, season: "spring", speed: 1,
    buildings, villagers: [], stockpiles: {}, population: 0, popCap: 0,
    foodSurplus: 0, gameOver: false, recentEvents: [],
    happiness: 50, faithCoverage: 0, safetyCoverage: 0, goodsCoverage: 0,
    activeDecrees: [], traderPresent: false, traderOffers: [],
    raiders, armies: [], threatLevel: 0, nextRaidDay: -1, defensiveStrength: 0,
    keepPresent: false, keepSacked: false,
    sickVillagers: 0, outbreakActive: false, activeFires: 0,
    tier, reliefReserve: 0,
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
