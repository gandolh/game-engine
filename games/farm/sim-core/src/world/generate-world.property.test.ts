import { describe, it, expect } from "vitest";
import { generateWorld, regionMaskAt, forEachLandTile, WORLD_WIDTH, WORLD_HEIGHT, type RegionId } from "./regions";
import { forcedCoreTiles } from "./region-setup/anchors";
import type { RegionDef } from "./regions";

/**
 * Brief 92/93 accept-check: over many seeds, the FULLY generated world must
 * satisfy every layout invariant. This is the gate for "any seed produces a
 * playable, connected map." Determinism per seed is checked in regions.test.ts.
 */

const SEEDS = Array.from({ length: 30 }, (_, i) => (0x51ed0000 ^ (i * 0x9e3779b1)) >>> 0);

function gap(a: RegionDef["bounds"], b: RegionDef["bounds"]): number {
  const gx = Math.max(b.minX - a.maxX - 1, a.minX - b.maxX - 1);
  const gy = Math.max(b.minY - a.maxY - 1, a.minY - b.maxY - 1);
  return Math.max(gx, gy);
}

/** BFS over land+road tiles from the village center; returns reachable mask. */
function reachableFromVillage(w: ReturnType<typeof generateWorld>): Uint8Array {
  const walk = new Uint8Array(WORLD_WIDTH * WORLD_HEIGHT);
  for (const r of w.regions) forEachLandTile(r, (x, y) => { walk[y * WORLD_WIDTH + x] = 1; });
  for (const road of w.roads) {
    for (let y = road.minY; y <= road.maxY; y++) {
      for (let x = road.minX; x <= road.maxX; x++) {
        if (x >= 0 && y >= 0 && x < WORLD_WIDTH && y < WORLD_HEIGHT) walk[y * WORLD_WIDTH + x] = 1;
      }
    }
  }
  const village = w.regions.find((r) => r.id === "village")!;
  const seen = new Uint8Array(WORLD_WIDTH * WORLD_HEIGHT);
  const start = village.center.y * WORLD_WIDTH + village.center.x;
  const q = [start];
  seen[start] = 1;
  let head = 0;
  while (head < q.length) {
    const k = q[head++]!;
    const x = k % WORLD_WIDTH;
    const y = (k - x) / WORLD_WIDTH;
    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]] as const) {
      if (nx < 0 || ny < 0 || nx >= WORLD_WIDTH || ny >= WORLD_HEIGHT) continue;
      const nk = ny * WORLD_WIDTH + nx;
      if (walk[nk] === 1 && seen[nk] === 0) { seen[nk] = 1; q.push(nk); }
    }
  }
  return seen;
}

describe("generateWorld — multi-seed properties", () => {
  it("generates a world for every seed (never throws)", () => {
    for (const seed of SEEDS) {
      expect(() => generateWorld(seed)).not.toThrow();
    }
  });

  it("every region pair keeps a >=2-tile ocean gap (bounds)", () => {
    for (const seed of SEEDS) {
      const { regions } = generateWorld(seed);
      for (let i = 0; i < regions.length; i++) {
        for (let j = i + 1; j < regions.length; j++) {
          expect(
            gap(regions[i]!.bounds, regions[j]!.bounds),
            `seed ${seed}: ${regions[i]!.id} / ${regions[j]!.id}`,
          ).toBeGreaterThanOrEqual(2);
        }
      }
    }
  });

  it("every region center is reachable from the village over land+road", () => {
    for (const seed of SEEDS) {
      const w = generateWorld(seed);
      const seen = reachableFromVillage(w);
      for (const r of w.regions) {
        expect(
          seen[r.center.y * WORLD_WIDTH + r.center.x],
          `seed ${seed}: ${r.id} center unreachable`,
        ).toBe(1);
      }
    }
  });

  it("every forced-core tile of every region is mask land", () => {
    for (const seed of SEEDS) {
      const { regions } = generateWorld(seed);
      for (const r of regions) {
        for (const core of forcedCoreTiles(r)) {
          expect(
            regionMaskAt(r, core.x, core.y),
            `seed ${seed}: ${r.id} core (${core.x},${core.y})`,
          ).toBe(true);
        }
      }
    }
  });

  it("every island stays inside the world", () => {
    for (const seed of SEEDS) {
      for (const r of generateWorld(seed).regions) {
        expect(r.bounds.minX).toBeGreaterThanOrEqual(0);
        expect(r.bounds.minY).toBeGreaterThanOrEqual(0);
        expect(r.bounds.maxX).toBeLessThan(WORLD_WIDTH);
        expect(r.bounds.maxY).toBeLessThan(WORLD_HEIGHT);
      }
    }
  });

  it("the expected roster of regions exists for every seed", () => {
    const required: RegionId[] = [
      "village", "blacksmith", "carpentry", "mill", "harbor",
      "fishing-isle", "fishing-isle-2", "casino", "volcano",
      "farm-pip", "farm-cora", "farm-0", "ranch-0",
    ];
    for (const seed of SEEDS) {
      const ids = new Set(generateWorld(seed).regions.map((r) => r.id));
      for (const id of required) expect(ids.has(id), `seed ${seed} missing ${id}`).toBe(true);
    }
  });

  it("land coverage stays in the ~60% band across seeds", () => {
    for (const seed of SEEDS) {
      const { regions } = generateWorld(seed);
      let land = 0;
      for (const r of regions) forEachLandTile(r, () => { land++; });
      const cov = land / (WORLD_WIDTH * WORLD_HEIGHT);
      // Carve shaves a little off the rect coverage, so allow a touch under 0.55.
      expect(cov, `seed ${seed} coverage ${(cov * 100).toFixed(1)}%`).toBeGreaterThan(0.45);
      expect(cov, `seed ${seed} coverage ${(cov * 100).toFixed(1)}%`).toBeLessThan(0.68);
    }
  });
});
