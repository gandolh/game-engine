/**
 * Citadel 08 tests — building upgrades (L1→L3, material-cost, tier-gated).
 *
 * All tests drive bootstrapSim() directly (no Worker).
 *
 * Covers:
 *   - happy path: affordable + tier-allowed upgrade bumps level, raises popCap,
 *     deducts materials;
 *   - reject on insufficient materials;
 *   - reject on tier too low (Hamlet);
 *   - reject at max level;
 *   - defense cap guard: an upgraded tower only gains a modest additive bonus.
 */
import { describe, it, expect } from "vitest";
import { localPlayer } from "../sim-state";
import { bootstrapSim } from "../sim-bootstrap";
import { TerrainType, WORLD_WIDTH, WORLD_HEIGHT } from "../world/terrain";
import type { TerrainGrid } from "../world/terrain";
import type { CitadelCommand } from "../snapshot/index";
import {
  effectiveDefenseStrength,
  getProductionDef,
  PRODUCTION_DEFS,
} from "../entities/building";

const TPD = 20;

function boot() {
  return bootstrapSim({ seed: 0xabc08, ticksPerDay: TPD });
}

/** Find a clear (grass) WxH region near (sx,sy). */
function findGrass(terrain: TerrainGrid, w: number, h: number, sx: number, sy: number): { x: number; y: number } {
  for (let r = 0; r < 40; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const x = sx + dx;
        const y = sy + dy;
        let ok = true;
        for (let yy = 0; yy < h && ok; yy++)
          for (let xx = 0; xx < w; xx++) {
            const t = terrain.cells[(y + yy) * terrain.width + (x + xx)];
            if (t !== TerrainType.Grass) { ok = false; break; }
          }
        if (ok) return { x, y };
      }
    }
  }
  return { x: sx, y: sy };
}

function place(type: string, x: number, y: number): CitadelCommand {
  return { type: "placeBuilding", payload: { buildingType: type, x, y } };
}

function upgradeAt(x: number, y: number): CitadelCommand {
  return { type: "upgradeBuilding", payload: { x, y } };
}

const cx = Math.floor(WORLD_WIDTH / 2);
const cy = Math.floor(WORLD_HEIGHT / 2);

describe("building upgrades", () => {
  it("upgrades a house when tier-allowed + affordable: level 2, popCap rises, materials deducted", () => {
    const sim = boot();
    const { x, y } = findGrass(sim.terrain, 2, 2, cx, cy);

    sim.commands.enqueue(place("house", x, y));
    sim.scheduler.tick({ tick: 0 });

    // House must actually have been placed.
    const placed = sim.getBuildings().find((b) => b.type === "house" && b.x === x && b.y === y);
    expect(placed, "house should be placed on grass").toBeDefined();
    expect(placed!.level).toBe(1);

    const popCapBefore = localPlayer(sim.state).popCap;

    // Town tier + plenty of materials.
    localPlayer(sim.state).tier = "Town";
    localPlayer(sim.state).stockpiles.planks = 10;
    localPlayer(sim.state).stockpiles.stone = 10;
    localPlayer(sim.state).stockpiles.tools = 5;

    sim.commands.enqueue(upgradeAt(x, y));
    sim.scheduler.tick({ tick: 1 });

    const after = sim.getBuildings().find((b) => b.type === "house" && b.x === x && b.y === y)!;
    expect(after.level).toBe(2);
    // L2 house = base 6 + 3 = 9 → +3 over base.
    expect(localPlayer(sim.state).popCap).toBe(popCapBefore + 3);
    // L2 cost = { planks: 4, stone: 4 }.
    expect(localPlayer(sim.state).stockpiles.planks).toBe(6);
    expect(localPlayer(sim.state).stockpiles.stone).toBe(6);
    expect(localPlayer(sim.state).stockpiles.tools).toBe(5); // untouched at L2
  });

  it("rejects upgrade with insufficient materials: level stays 1, no deduction", () => {
    const sim = boot();
    const { x, y } = findGrass(sim.terrain, 2, 2, cx, cy);
    sim.commands.enqueue(place("house", x, y));
    sim.scheduler.tick({ tick: 0 });
    expect(sim.getBuildings().find((b) => b.x === x && b.y === y)!.level).toBe(1);

    const popCapBefore = localPlayer(sim.state).popCap;
    localPlayer(sim.state).tier = "Town";
    localPlayer(sim.state).stockpiles.planks = 1; // need 4
    localPlayer(sim.state).stockpiles.stone = 1; // need 4

    sim.commands.enqueue(upgradeAt(x, y));
    sim.scheduler.tick({ tick: 1 });

    const after = sim.getBuildings().find((b) => b.x === x && b.y === y)!;
    expect(after.level).toBe(1);
    expect(localPlayer(sim.state).popCap).toBe(popCapBefore);
    expect(localPlayer(sim.state).stockpiles.planks).toBe(1);
    expect(localPlayer(sim.state).stockpiles.stone).toBe(1);
  });

  it("rejects upgrade when tier too low (Hamlet): level stays 1, no deduction", () => {
    const sim = boot();
    const { x, y } = findGrass(sim.terrain, 2, 2, cx, cy);
    sim.commands.enqueue(place("house", x, y));
    sim.scheduler.tick({ tick: 0 });

    expect(localPlayer(sim.state).tier).toBe("Hamlet");
    localPlayer(sim.state).stockpiles.planks = 10;
    localPlayer(sim.state).stockpiles.stone = 10;

    sim.commands.enqueue(upgradeAt(x, y));
    sim.scheduler.tick({ tick: 1 });

    const after = sim.getBuildings().find((b) => b.x === x && b.y === y)!;
    expect(after.level).toBe(1);
    expect(localPlayer(sim.state).stockpiles.planks).toBe(10);
    expect(localPlayer(sim.state).stockpiles.stone).toBe(10);
  });

  it("rejects upgrade at max level (L3): no further change", () => {
    const sim = boot();
    const { x, y } = findGrass(sim.terrain, 2, 2, cx, cy);
    sim.commands.enqueue(place("house", x, y));
    sim.scheduler.tick({ tick: 0 });

    localPlayer(sim.state).tier = "Town";
    localPlayer(sim.state).stockpiles.planks = 100;
    localPlayer(sim.state).stockpiles.stone = 100;
    localPlayer(sim.state).stockpiles.tools = 100;

    // L1→L2→L3 over three ticks.
    sim.commands.enqueue(upgradeAt(x, y));
    sim.scheduler.tick({ tick: 1 });
    sim.commands.enqueue(upgradeAt(x, y));
    sim.scheduler.tick({ tick: 2 });
    expect(sim.getBuildings().find((b) => b.x === x && b.y === y)!.level).toBe(3);

    const planksBefore = localPlayer(sim.state).stockpiles.planks;
    // Fourth attempt — already max.
    sim.commands.enqueue(upgradeAt(x, y));
    sim.scheduler.tick({ tick: 3 });

    const after = sim.getBuildings().find((b) => b.x === x && b.y === y)!;
    expect(after.level).toBe(3);
    expect(localPlayer(sim.state).stockpiles.planks).toBe(planksBefore); // no deduction at max
  });
});

describe("defense cap guard", () => {
  it("effectiveDefenseStrength of a tower rises only modestly across levels (additive, capped)", () => {
    const towerDef = getProductionDef("tower")!;
    const base = towerDef.defenseStrength!; // 5
    expect(effectiveDefenseStrength(towerDef, 1)).toBe(base);
    // +2 per level above 1, NOT a multiplier.
    expect(effectiveDefenseStrength(towerDef, 2)).toBe(base + 2);
    expect(effectiveDefenseStrength(towerDef, 3)).toBe(base + 4);
    // Guard: an L3 tower is at most base+4 — a multiplicative scheme (e.g. ×2 → base*2=10)
    // would exceed this. This keeps sieges winnable-losable rather than trivially repelled.
    expect(effectiveDefenseStrength(towerDef, 3)).toBeLessThanOrEqual(base + 4);
    expect(effectiveDefenseStrength(towerDef, 3)).toBeLessThan(base * 2);
  });

  it("the keep's effective defense is also additively capped", () => {
    const keepDef = PRODUCTION_DEFS.keep!;
    const base = keepDef.defenseStrength!; // 8
    expect(effectiveDefenseStrength(keepDef, 3)).toBe(base + 4);
    expect(effectiveDefenseStrength(keepDef, 3)).toBeLessThan(base * 2);
  });
});
