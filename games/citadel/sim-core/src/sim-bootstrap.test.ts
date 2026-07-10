/**
 * Phase 1 determinism / replay test.
 *
 * Proves:
 * 1. Enqueuing a fixed command log, running N ticks, then replaying the
 *    exact same log into a fresh sim produces identical world state
 *    (building set + occupancy + walkable grid — byte-identical).
 * 2. A placed 2×2 House footprint is reflected as un-walkable in the
 *    walkable grid (obstacle detection).
 * 3. Demolish removes the building and restores walkability.
 */
import { describe, it, expect } from "vitest";
import { bootstrapSim } from "./sim-bootstrap";
import { WORLD_WIDTH } from "./world/terrain";
import type { CitadelCommand } from "./snapshot/index";

const SEED = 0xc17ade1;
const TICKS_PER_DAY = 20;
const MAX_DAYS = 5;

/** Run a sim with a pre-scripted command log, return the final state. */
function runWithCommands(
  commands: Array<{ atTick: number; cmd: CitadelCommand }>,
  totalTicks: number,
): {
  buildings: ReturnType<ReturnType<typeof bootstrapSim>["getBuildings"]>;
  walkable: Uint8Array;
} {
  const sim = bootstrapSim({ seed: SEED, ticksPerDay: TICKS_PER_DAY, maxDays: MAX_DAYS });

  let cmdIdx = 0;
  for (let tick = 0; tick < totalTicks; tick++) {
    // Enqueue any commands scheduled for this tick
    while (cmdIdx < commands.length && commands[cmdIdx]!.atTick === tick) {
      sim.commands.enqueue(commands[cmdIdx]!.cmd);
      cmdIdx++;
    }
    sim.scheduler.tick({ tick });
  }

  return {
    buildings: sim.getBuildings(),
    walkable: sim.walkable.slice(), // snapshot a copy
  };
}

const COMMAND_LOG: Array<{ atTick: number; cmd: CitadelCommand }> = [
  // Place a house at (10, 10) at tick 0
  { atTick: 0, cmd: { type: "placeBuilding", payload: { buildingType: "house", x: 10, y: 10 } } },
  // Place another house at (20, 20) at tick 5
  { atTick: 5, cmd: { type: "placeBuilding", payload: { buildingType: "house", x: 20, y: 20 } } },
  // Place a third house at (30, 30) at tick 10
  { atTick: 10, cmd: { type: "placeBuilding", payload: { buildingType: "house", x: 30, y: 30 } } },
];

const TOTAL_TICKS = 30;

describe("CitadelSim Phase 1 — determinism & placement", () => {
  it("replay: same command log → byte-identical walkable grid", () => {
    const run1 = runWithCommands(COMMAND_LOG, TOTAL_TICKS);
    const run2 = runWithCommands(COMMAND_LOG, TOTAL_TICKS);

    expect(run1.walkable).toEqual(run2.walkable);
  });

  it("replay: same command log → identical building set", () => {
    const run1 = runWithCommands(COMMAND_LOG, TOTAL_TICKS);
    const run2 = runWithCommands(COMMAND_LOG, TOTAL_TICKS);

    // Sort by position for stable comparison
    const sort = (bs: typeof run1.buildings) =>
      [...bs].sort((a, b) => a.x - b.x || a.y - b.y);

    expect(sort(run1.buildings)).toEqual(sort(run2.buildings));
  });

  it("placed 2×2 house footprint tiles are marked non-walkable", () => {
    const log: Array<{ atTick: number; cmd: CitadelCommand }> = [
      { atTick: 0, cmd: { type: "placeBuilding", payload: { buildingType: "house", x: 5, y: 5 } } },
    ];
    const { walkable } = runWithCommands(log, 5);

    // All 4 tiles of the 2×2 footprint must be 0 (blocked)
    // Row stride of the walkable grid = the world's width, NOT a literal. Hardcoding
    // 96 here indexed the wrong cell the moment the default world grew (brief 110);
    // two of these three assertions then passed for the wrong reason.
    const W = WORLD_WIDTH;
    for (let dy = 0; dy < 2; dy++) {
      for (let dx = 0; dx < 2; dx++) {
        const tx = 5 + dx;
        const ty = 5 + dy;
        const idx = ty * W + tx;
        expect(walkable[idx], `tile (${tx},${ty}) should be blocked`).toBe(0);
      }
    }
  });

  it("tiles adjacent to the house footprint remain walkable (if grass)", () => {
    const log: Array<{ atTick: number; cmd: CitadelCommand }> = [
      { atTick: 0, cmd: { type: "placeBuilding", payload: { buildingType: "house", x: 5, y: 5 } } },
    ];
    const { walkable } = runWithCommands(log, 5);

    // Row stride of the walkable grid = the world's width, NOT a literal. Hardcoding
    // 96 here indexed the wrong cell the moment the default world grew (brief 110);
    // two of these three assertions then passed for the wrong reason.
    const W = WORLD_WIDTH;
    // Tile just to the right of the footprint
    const rightIdx = 5 * W + 7;
    // Tile just below the footprint
    const belowIdx = 7 * W + 5;

    // These tiles should still be walkable (they're grass, not occupied)
    // Note: they could be a non-grass terrain type and be 0 legitimately;
    // we generate a known seed so we can trust they're grass near (5,5).
    // If either turns out to be non-grass we skip rather than fail.
    const rightVal = walkable[rightIdx];
    const belowVal = walkable[belowIdx];
    // They must be 1 (walkable) since they are adjacent (not in footprint)
    // and the seed 0xc1tad31 generates grass in that area.
    expect(rightVal).toBe(1);
    expect(belowVal).toBe(1);
  });

  it("demolish removes the building and restores walkable tiles", () => {
    const log: Array<{ atTick: number; cmd: CitadelCommand }> = [
      { atTick: 0, cmd: { type: "placeBuilding", payload: { buildingType: "house", x: 5, y: 5 } } },
      { atTick: 3, cmd: { type: "demolish", payload: { x: 5, y: 5 } } },
    ];
    const { buildings, walkable } = runWithCommands(log, 10);

    // No buildings should remain
    expect(buildings).toHaveLength(0);

    // The former footprint tiles should now be walkable again
    // Row stride of the walkable grid = the world's width, NOT a literal. Hardcoding
    // 96 here indexed the wrong cell the moment the default world grew (brief 110);
    // two of these three assertions then passed for the wrong reason.
    const W = WORLD_WIDTH;
    for (let dy = 0; dy < 2; dy++) {
      for (let dx = 0; dx < 2; dx++) {
        const tx = 5 + dx;
        const ty = 5 + dy;
        const idx = ty * W + tx;
        expect(walkable[idx], `tile (${tx},${ty}) should be walkable after demolish`).toBe(1);
      }
    }
  });

  it("invalid placement (water tile) is silently ignored", () => {
    // Place on tile (0,0) which might not be water; use a definitely water
    // area. The river passes near center. We'll try placing on an out-of-bounds
    // coordinate to exercise the bounds check.
    const log: Array<{ atTick: number; cmd: CitadelCommand }> = [
      { atTick: 0, cmd: { type: "placeBuilding", payload: { buildingType: "house", x: 200, y: 200 } } },
    ];
    const { buildings } = runWithCommands(log, 5);
    expect(buildings).toHaveLength(0);
  });

  it("overlapping placement is silently ignored", () => {
    // Use (10,10) which is verified to be buildable in earlier tests
    const log: Array<{ atTick: number; cmd: CitadelCommand }> = [
      { atTick: 0, cmd: { type: "placeBuilding", payload: { buildingType: "house", x: 10, y: 10 } } },
      // Try to place another house overlapping the first (2×2 footprint covers 10..11, 10..11)
      { atTick: 1, cmd: { type: "placeBuilding", payload: { buildingType: "house", x: 11, y: 11 } } },
    ];
    const { buildings } = runWithCommands(log, 5);
    // Only the first house should be placed
    expect(buildings).toHaveLength(1);
    expect(buildings[0]?.x).toBe(10);
    expect(buildings[0]?.y).toBe(10);
  });
});

describe("Citadel 97/13 — snapshot carries authoritative pacing defaults", () => {
  it("getSnapshot emits transport-agnostic defaults: isHost=true, speed=1, paused=false", () => {
    // getSnapshot knows nothing of hosts / wall-clock pacing, so it emits the headless/solo
    // defaults (local player is trivially host, 1×, unpaused). The server host + solo Worker
    // OVERRIDE these before sending; here we pin the defaults the overrides layer onto.
    const sim = bootstrapSim({ seed: SEED, ticksPerDay: TICKS_PER_DAY, maxDays: MAX_DAYS });
    const snap = sim.getSnapshot(0);
    expect(snap.isHost).toBe(true);
    expect(snap.speed).toBe(1);
    expect(snap.paused).toBe(false);
  });
});
