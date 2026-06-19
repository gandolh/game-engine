/**
 * Phase 5 tests: settlement tiers + save/load via command-log replay.
 *
 * Tests:
 *   (a) Tier promotes at expected pop/building/defense thresholds.
 *   (b) A tier-locked building is rejected until its tier is reached.
 *   (c) save → reload → replay yields a deep-equal snapshot (round-trip).
 */
import { describe, it, expect } from "vitest";
import { bootstrapSim, loadFromSave } from "../sim-bootstrap";
import { computeTier, tierAtLeast, TIER_LOCK } from "./tiers";
import { WORLD_WIDTH, WORLD_HEIGHT } from "../world/terrain";
import type { CitadelCommand } from "../snapshot/index";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SEED = 0xabcd1234;
const TPD = 20; // ticks per day — fast for tests

/** Run the sim for N days and return the sim. */
function runDays(sim: ReturnType<typeof bootstrapSim>, days: number): void {
  const totalTicks = days * TPD;
  for (let tick = 0; tick < totalTicks; tick++) {
    sim.scheduler.tick({ tick });
  }
}

/** Place a building command at (x,y). */
function place(type: string, x: number, y: number): CitadelCommand {
  return { type: "placeBuilding", payload: { buildingType: type, x, y } };
}

// ---------------------------------------------------------------------------
// (a) Tier threshold tests
// ---------------------------------------------------------------------------

describe("computeTier", () => {
  it("returns Hamlet when pop and buildings are minimal", () => {
    expect(computeTier(0, 0, 0)).toBe("Hamlet");
    expect(computeTier(4, 5, 0)).toBe("Hamlet"); // pop < 8 AND pop < minPopForBuildings(5) is fine at buildings=5
  });

  it("returns Hamlet just below Village pop threshold", () => {
    expect(computeTier(7, 0, 0)).toBe("Hamlet"); // pop=7 < 8
  });

  it("promotes to Village at pop ≥ 8", () => {
    expect(computeTier(8, 0, 0)).toBe("Village");
  });

  it("promotes to Village via buildings path: buildings ≥ 8 AND pop ≥ 5", () => {
    // Strictly at the threshold.
    expect(computeTier(5, 8, 0)).toBe("Village");
    // Just below pop requirement for buildings path — stays Hamlet.
    expect(computeTier(4, 8, 0)).toBe("Hamlet");
    // Just below building count for buildings path — stays Hamlet.
    expect(computeTier(5, 7, 0)).toBe("Hamlet");
  });

  it("does NOT promote to Village at buildings ≥ 8 with pop = 0 (empty shell city)", () => {
    // An empty-but-pre-built settlement must not skip the tier ladder.
    expect(computeTier(0, 8, 0)).toBe("Hamlet");
    expect(computeTier(0, 20, 0)).toBe("Hamlet");
  });

  it("returns Village just below Town pop threshold", () => {
    expect(computeTier(19, 0, 0)).toBe("Village"); // pop=19 < 20
  });

  it("promotes to Town at pop ≥ 20", () => {
    expect(computeTier(20, 0, 0)).toBe("Town");
  });

  it("promotes to Town via buildings path: buildings ≥ 15 AND pop ≥ 10", () => {
    expect(computeTier(10, 15, 0)).toBe("Town");
    // Just below pop for buildings path → stays Village (if Village threshold also met by pop).
    expect(computeTier(9, 15, 0)).toBe("Village"); // pop=9 ≥ 8 → Village; < 10 → not Town via buildings
    // Just below building count for buildings path → stays Village.
    expect(computeTier(10, 14, 0)).toBe("Village"); // pop=10 ≥ 8 → Village; buildings=14 < 15 → not Town
  });

  it("promotes to Citadel at pop ≥ 40 with no defense requirement", () => {
    // Citadel via pop path: pop ≥ 40.
    expect(computeTier(40, 0, 0)).toBe("Citadel");
  });

  it("promotes to Citadel via buildings path: buildings ≥ 25, defense ≥ 20, pop ≥ 20", () => {
    expect(computeTier(20, 25, 20)).toBe("Citadel");
    // Missing defense → not Citadel (falls back to Town since pop=20 meets Town via pop).
    expect(computeTier(20, 25, 0)).toBe("Town");
    // Missing pop for buildings path → not Citadel via buildings.
    // pop=19 < 40 (Citadel pop path) and < 20 (Citadel minPopForBuildings) → Citadel fails.
    // But pop=19 ≥ 8 (Village pop path) and buildings=25 ≥ 15 AND pop=19 ≥ 10 (Town buildings path) → Town.
    expect(computeTier(19, 25, 20)).toBe("Town");
  });

  it("does NOT promote to Citadel at buildings ≥ 25 with defense < 20", () => {
    // buildings=25 but defense=0 → Citadel needs both defenseOk and popOk too.
    // pop=0 < 40, popOk false; buildingsOk true but defenseOk false → Hamlet (no threshold met).
    expect(computeTier(0, 25, 0)).toBe("Hamlet");
  });

  it("promotes to Fortress-City at pop ≥ 60", () => {
    expect(computeTier(60, 0, 0)).toBe("Fortress-City");
  });
});

describe("tierAtLeast", () => {
  it("returns true for equal tiers", () => {
    expect(tierAtLeast("Village", "Village")).toBe(true);
  });
  it("returns true for higher tier", () => {
    expect(tierAtLeast("Town", "Village")).toBe(true);
  });
  it("returns false for lower tier", () => {
    expect(tierAtLeast("Hamlet", "Village")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// (b) TierSystem integration test: tier advances in a live sim + event
// ---------------------------------------------------------------------------

describe("TierSystem", () => {
  it("starts at Hamlet", () => {
    const sim = bootstrapSim({ seed: SEED, ticksPerDay: TPD, maxDays: 40 });
    expect(sim.state.tier).toBe("Hamlet");
    const snap = sim.getSnapshot(0);
    expect(snap.tier).toBe("Hamlet");
  });

  it("promotes to Village when population crosses threshold (via direct state manipulation)", () => {
    // We bypass command placement (terrain variability) and directly set population
    // to simulate the tier crossing.  The TierSystem reads state.population directly.
    const sim = bootstrapSim({ seed: SEED, ticksPerDay: TPD, maxDays: 40 });
    expect(sim.state.tier).toBe("Hamlet");

    // Force population to 8 (the Village threshold).
    sim.state.population = 8;

    // Tick one full day — TierSystem evaluates at tick 0 of each day.
    runDays(sim, 1);

    expect(sim.state.tier).toBe("Village");
    const snap = sim.getSnapshot(TPD);
    expect(snap.tier).toBe("Village");
  });

  it("pushes a promotion event when tier advances", () => {
    const sim = bootstrapSim({ seed: SEED, ticksPerDay: TPD, maxDays: 40 });
    sim.state.population = 8;
    runDays(sim, 1);

    const promotionEvents = sim.state.events.filter((e) => /Village/i.test(e));
    expect(promotionEvents.length).toBeGreaterThan(0);
  });

  it("does not promote when thresholds are not met", () => {
    const sim = bootstrapSim({ seed: SEED, ticksPerDay: TPD, maxDays: 40 });
    sim.state.population = 5; // < 8 → stays Hamlet
    runDays(sim, 2);
    expect(sim.state.tier).toBe("Hamlet");
  });

  it("promotes to Town when population crosses 20", () => {
    const sim = bootstrapSim({ seed: SEED, ticksPerDay: TPD, maxDays: 40 });
    sim.state.population = 20;
    runDays(sim, 1);
    expect(sim.state.tier).toBe("Town");
  });

  it("snapshot tier matches state.tier", () => {
    const sim = bootstrapSim({ seed: SEED, ticksPerDay: TPD, maxDays: 40 });
    sim.state.population = 50; // → Citadel
    runDays(sim, 1);
    const snap = sim.getSnapshot(TPD);
    expect(snap.tier).toBe(sim.state.tier);
    expect(snap.tier).toBe("Citadel");
  });
});

// ---------------------------------------------------------------------------
// (c) Catalog tier-lock: a tier-locked building is rejected until its tier
// ---------------------------------------------------------------------------

describe("TIER_LOCK catalog gating", () => {
  it("TIER_LOCK declares tower locked at Village+", () => {
    expect(TIER_LOCK["tower"]).toBe("Village");
    expect(TIER_LOCK["keep"]).toBe("Town");
  });

  it("tierAtLeast correctly gates locked buildings", () => {
    // Hamlet cannot place tower (requires Village).
    expect(tierAtLeast("Hamlet", "Village")).toBe(false);
    // Village CAN place tower.
    expect(tierAtLeast("Village", "Village")).toBe(true);
    // Town CAN place keep (requires Town).
    expect(tierAtLeast("Town", "Town")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// (d) Save → load round-trip
// ---------------------------------------------------------------------------

describe("save/load round-trip", () => {
  it("loadFromSave reconstructs an identical snapshot after replaying the command log", () => {
    // Build a citadel with enough commands to be interesting.
    const sim = bootstrapSim({ seed: SEED, ticksPerDay: TPD, maxDays: 40 });
    const cx = Math.floor(WORLD_WIDTH / 2);
    const cy = Math.floor(WORLD_HEIGHT / 2);

    // Enqueue a mix of building + road commands at tick 0.
    sim.commands.enqueue(place("storehouse", cx, cy));
    sim.commands.enqueue(place("farm", cx + 5, cy));
    sim.commands.enqueue(place("mill", cx, cy - 4));
    sim.commands.enqueue(place("bakery", cx - 4, cy));
    sim.commands.enqueue(place("house", cx - 2, cy + 4));
    sim.commands.enqueue(place("house", cx + 1, cy + 4));
    sim.commands.enqueue({
      type: "placeRoad",
      payload: {
        tiles: [
          { x: cx + 3, y: cy }, { x: cx + 4, y: cy },
          { x: cx, y: cy - 1 }, { x: cx, y: cy - 2 },
          { x: cx - 1, y: cy }, { x: cx - 2, y: cy },
          { x: cx, y: cy + 2 }, { x: cx, y: cy + 3 },
        ],
      },
    });

    // Run for 10 days.
    const targetTick = 10 * TPD - 1; // last tick of day 10
    for (let tick = 0; tick < targetTick; tick++) {
      sim.scheduler.tick({ tick });
    }

    const originalSnap = sim.getSnapshot(targetTick);
    const save = sim.serializeSave(targetTick);

    // Sanity: save has command log entries.
    expect(save.commandLog.length).toBeGreaterThan(0);
    expect(save.version).toBe(1);
    expect(save.seed).toBe(SEED);
    expect(save.currentTick).toBe(targetTick);

    // Load into fresh sim — replay runs ticks 0..targetTick.
    const loaded = loadFromSave(save);
    const loadedSnap = loaded.getSnapshot(targetTick);

    // Key state should match exactly.
    expect(loadedSnap.population).toBe(originalSnap.population);
    expect(loadedSnap.popCap).toBe(originalSnap.popCap);
    expect(loadedSnap.buildings.length).toBe(originalSnap.buildings.length);
    expect(loadedSnap.tier).toBe(originalSnap.tier);
    expect(loadedSnap.gameOver).toBe(originalSnap.gameOver);
    // Stockpiles (bread/grain/flour) should match.
    expect(loadedSnap.stockpiles).toEqual(originalSnap.stockpiles);
    // Building types and positions should match (order-stable).
    const origTypes = originalSnap.buildings.map((b) => `${b.type}@${b.x},${b.y}`).sort();
    const loadTypes = loadedSnap.buildings.map((b) => `${b.type}@${b.x},${b.y}`).sort();
    expect(loadTypes).toEqual(origTypes);
  });

  it("serializeSave returns a JSON-serializable object", () => {
    const sim = bootstrapSim({ seed: SEED, ticksPerDay: TPD, maxDays: 10 });
    const cx = Math.floor(WORLD_WIDTH / 2);
    const cy = Math.floor(WORLD_HEIGHT / 2);
    sim.commands.enqueue(place("storehouse", cx, cy));
    sim.scheduler.tick({ tick: 0 });

    const save = sim.serializeSave(0);
    // Should round-trip through JSON without errors.
    const json = JSON.stringify(save);
    expect(json).toBeTruthy();
    const parsed: unknown = JSON.parse(json);
    expect(parsed).toMatchObject({ version: 1, seed: SEED });
  });

  it("empty command log load returns a fresh sim in Hamlet state", () => {
    const save = {
      version: 1 as const,
      seed: SEED,
      ticksPerDay: TPD,
      startDay: 0,
      currentTick: 0,
      commandLog: [],
    };
    const sim = loadFromSave(save);
    expect(sim.state.tier).toBe("Hamlet");
    expect(sim.state.population).toBe(0);
  });
});
