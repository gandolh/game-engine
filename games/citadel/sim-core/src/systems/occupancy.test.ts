/**
 * Occupancy snapshot invariant (Part B of the road-only-when-moving work).
 *
 * Every villager is counted in EXACTLY one place each snapshot: a travelling
 * villager (walk states) is a road dot, a stationary one (idle/work) is folded
 * into its building's `occupancy`. So Σ occupancy + travelling == population.
 * These tests drive bootstrapSim() directly.
 */
import { describe, it, expect } from "vitest";
import { bootstrapSim } from "../sim-bootstrap";
import { isTravellingFsm } from "../entities/villager";
import type { CitadelCommand } from "../snapshot/index";

const SEED = 0xc17ade1;
const TICKS_PER_DAY = 20;

function roadRow(y: number, x0: number, x1: number): CitadelCommand {
  const tiles: Array<{ x: number; y: number }> = [];
  for (let x = x0; x <= x1; x++) tiles.push({ x, y });
  return { type: "placeRoad", payload: { tiles } };
}

describe("snapshot occupancy invariant", () => {
  function bootEconomy() {
    const sim = bootstrapSim({ seed: SEED, ticksPerDay: TICKS_PER_DAY });
    const cmds: CitadelCommand[] = [
      { type: "placeBuilding", payload: { buildingType: "storehouse", x: 10, y: 10 } },
      { type: "placeBuilding", payload: { buildingType: "house", x: 10, y: 6 } },
      { type: "placeBuilding", payload: { buildingType: "house", x: 14, y: 6 } },
      roadRow(10, 13, 17),
      { type: "placeRoad", payload: { tiles: [{ x: 11, y: 8 }, { x: 11, y: 9 }] } },
      { type: "placeRoad", payload: { tiles: [{ x: 15, y: 7 }, { x: 15, y: 8 }, { x: 15, y: 9 }, { x: 15, y: 10 }] } },
      { type: "placeBuilding", payload: { buildingType: "farm", x: 18, y: 10 } },
    ];
    for (const c of cmds) sim.commands.enqueue(c);
    return sim;
  }

  it("Σ building occupancy + travelling villagers == population, every snapshot", () => {
    const sim = bootEconomy();
    let maxPop = 0;
    let sawOccupied = false;
    let sawTravelling = false;
    for (let tick = 0; tick < TICKS_PER_DAY * 30; tick++) {
      sim.scheduler.tick({ tick });
      const snap = sim.getSnapshot(tick);
      const inBuildings = snap.buildings.reduce((n, b) => n + b.occupancy, 0);
      const travelling = snap.villagers.filter((v) => isTravellingFsm(v.fsm)).length;
      expect(inBuildings + travelling).toBe(snap.population);
      // And the total villager-entity count equals population (parity invariant).
      expect(snap.villagers.length).toBe(snap.population);
      maxPop = Math.max(maxPop, snap.population);
      if (inBuildings > 0) sawOccupied = true;
      if (travelling > 0) sawTravelling = true;
    }
    // The scenario must actually have exercised both sides of the split — at some
    // point a villager sat in a building (occupancy) AND at some point one walked.
    expect(maxPop).toBeGreaterThan(0);
    expect(sawOccupied).toBe(true);
    expect(sawTravelling).toBe(true);
  });

  it("a stationary villager is never also a road dot (no double count)", () => {
    const sim = bootEconomy();
    for (let tick = 0; tick < TICKS_PER_DAY * 30; tick++) sim.scheduler.tick({ tick });
    const snap = sim.getSnapshot(TICKS_PER_DAY * 30);
    // Occupancy only ever counts non-travelling villagers, so it can never exceed
    // the number of stationary villagers.
    const stationary = snap.villagers.filter((v) => !isTravellingFsm(v.fsm)).length;
    const inBuildings = snap.buildings.reduce((n, b) => n + b.occupancy, 0);
    expect(inBuildings).toBeLessThanOrEqual(stationary);
  });

  it("snapshot carries the local player id", () => {
    const sim = bootEconomy();
    sim.scheduler.tick({ tick: 0 });
    expect(sim.getSnapshot(0).localPlayerId).toBe(0);
  });
});
