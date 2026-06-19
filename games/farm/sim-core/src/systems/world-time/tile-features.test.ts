
import { describe, it, expect, beforeAll } from "vitest";
import { bootstrapSim } from "../../sim-bootstrap";
import { REGIONS } from "../../world/regions";
import type { GameEntity } from "../../components";
import type { World } from "@engine/core";

const TICKS_PER_DAY = 10;
const MAX_PER_ZONE = 20;
const MAX_PER_FARM = 6;

function runDays(sim: ReturnType<typeof bootstrapSim>, days: number, startTick = 0): number {
  const end = startTick + days * TICKS_PER_DAY;
  for (let t = startTick; t < end; t++) {
    sim.scheduler.tick({ tick: t });
  }
  return end;
}

interface Feat {
  kind: "tree" | "stone" | "bush";
  x: number;
  y: number;
  regionId: string;
}

function collectFeatures(world: World<GameEntity>): Feat[] {
  const out: Feat[] = [];
  for (const e of world.query("tileFeature")) {
    const f = e.tileFeature!;
    out.push({ kind: f.kind, x: f.tileX, y: f.tileY, regionId: f.regionId });
  }
  return out;
}

function byRegion(feats: Feat[]): Map<string, Feat[]> {
  const m = new Map<string, Feat[]>();
  for (const f of feats) {
    if (!m.has(f.regionId)) m.set(f.regionId, []);
    m.get(f.regionId)!.push(f);
  }
  return m;
}

function meanNearestNeighbour(pts: ReadonlyArray<{ x: number; y: number }>): number {
  if (pts.length < 2) return 0;
  let sum = 0;
  for (let i = 0; i < pts.length; i++) {
    let best = Infinity;
    for (let j = 0; j < pts.length; j++) {
      if (i === j) continue;
      const d = Math.abs(pts[i]!.x - pts[j]!.x) + Math.abs(pts[i]!.y - pts[j]!.y);
      if (d < best) best = d;
    }
    sum += best;
  }
  return sum / pts.length;
}

const ZONE_IDS = ["forest-north", "forest-south", "quarry-north", "quarry-south"] as const;

describe("TileFeatureSystem — organic clusters", () => {

  let longRun: Map<string, Feat[]>;

  beforeAll(() => {
    const sim = bootstrapSim({ seed: 3, ticksPerDay: TICKS_PER_DAY, maxDays: 80 });
    runDays(sim, 80);
    longRun = byRegion(collectFeatures(sim.world));
  });

  it("never exceeds caps per zone / per farm over many days", () => {
    const regions = longRun;
    for (const def of REGIONS) {
      const feats = regions.get(def.id) ?? [];
      const isZone = ZONE_IDS.includes(def.id as (typeof ZONE_IDS)[number]);
      const cap = isZone ? MAX_PER_ZONE : MAX_PER_FARM;
      if (def.kind === "farm" || isZone) {
        expect(feats.length).toBeLessThanOrEqual(cap);
      }
    }
  });

  it("respects the cap even when pre-seeded near it", () => {
    const sim = bootstrapSim({ seed: 5, ticksPerDay: TICKS_PER_DAY, maxDays: 40 });
    const { world } = sim;
    const def = REGIONS.find((r) => r.id === "forest-north")!;

    let placed = 0;
    for (let ty = def.bounds.minY; ty <= def.bounds.maxY && placed < 19; ty++) {
      for (let tx = def.bounds.minX; tx <= def.bounds.maxX && placed < 19; tx++) {
        world.spawn({
          tileFeature: { kind: "tree", tileX: tx, tileY: ty, regionId: "forest-north", ownerId: 0 },
        });
        placed++;
      }
    }
    runDays(sim, 40);
    const feats = byRegion(collectFeatures(world)).get("forest-north") ?? [];
    expect(feats.length).toBeLessThanOrEqual(MAX_PER_ZONE);
  });

  it("zones trend toward their cap over many days (count behaviour preserved)", () => {

    const regions = longRun;
    let total = 0;
    for (const id of ZONE_IDS) total += (regions.get(id) ?? []).length;
    const avg = total / ZONE_IDS.length;

    expect(avg).toBeGreaterThan(MAX_PER_ZONE * 0.6);
  });

  it("features are spatially clustered, not uniform", () => {

    let measuredSum = 0;
    let uniformSum = 0;
    let counted = 0;
    for (const seed of [9, 3, 11, 42, 7, 1]) {
      const sim = bootstrapSim({ seed, ticksPerDay: TICKS_PER_DAY, maxDays: 1 });
      runDays(sim, 1);
      const regions = byRegion(collectFeatures(sim.world));
      for (const id of ZONE_IDS) {
        const feats = regions.get(id) ?? [];
        if (feats.length < 6) continue;
        const def = REGIONS.find((r) => r.id === id)!;
        const w = def.bounds.maxX - def.bounds.minX + 1;
        const h = def.bounds.maxY - def.bounds.minY + 1;
        measuredSum += meanNearestNeighbour(feats);
        uniformSum += uniformExpectedNN(w, h, feats.length);
        counted++;
      }
    }
    expect(counted).toBeGreaterThan(0);
    const measured = measuredSum / counted;
    const uniform = uniformSum / counted;

    expect(measured).toBeLessThan(uniform * 0.9);
  });

  it("is deterministic — same seed yields identical placements", () => {
    const a = bootstrapSim({ seed: 42, ticksPerDay: TICKS_PER_DAY, maxDays: 25 });
    const b = bootstrapSim({ seed: 42, ticksPerDay: TICKS_PER_DAY, maxDays: 25 });
    runDays(a, 25);
    runDays(b, 25);
    const fa = collectFeatures(a.world)
      .map((f) => `${f.regionId}:${f.kind}:${f.x},${f.y}`)
      .sort();
    const fb = collectFeatures(b.world)
      .map((f) => `${f.regionId}:${f.kind}:${f.x},${f.y}`)
      .sort();
    expect(fa.length).toBeGreaterThan(0);
    expect(fa).toEqual(fb);
  });

  it("forests spawn trees + berry-bushes (no stone), quarry spawns stones only, farms are mixed-capable", () => {
    const regions = longRun;
    for (const id of ["forest-north", "forest-south"]) {
      for (const f of regions.get(id) ?? []) expect(["tree", "bush"]).toContain(f.kind);
    }
    for (const id of ["quarry-north", "quarry-south"]) {
      for (const f of regions.get(id) ?? []) expect(f.kind).toBe("stone");
    }
  });
});

function uniformExpectedNN(w: number, h: number, n: number): number {
  const tiles = w * h;
  if (n < 2 || n > tiles) return 0;

  const area = tiles;
  const euclid = 0.5 / Math.sqrt(n / area);
  return euclid * 1.27;
}
