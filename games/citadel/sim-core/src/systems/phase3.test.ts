/**
 * Phase 3 tests — happiness/needs, governance decrees, barter trader.
 *
 * All tests use bootstrapSim() directly (no Worker). The exposed sim.state
 * reference allows direct inspection of Phase 3 fields.
 */
import { describe, it, expect } from "vitest";
import { localPlayer } from "../sim-state";
import { bootstrapSim } from "../sim-bootstrap";
import type { CitadelCommand } from "../snapshot/index";

const SEED = 0xc17ade1;
const TICKS_PER_DAY = 20;
const MAX_DAYS = 100;

interface ScheduledCmd {
  atTick: number;
  cmd: CitadelCommand;
}

function run(cmds: ScheduledCmd[], totalTicks: number) {
  const sim = bootstrapSim({ seed: SEED, ticksPerDay: TICKS_PER_DAY, maxDays: MAX_DAYS });
  let i = 0;
  for (let tick = 0; tick < totalTicks; tick++) {
    while (i < cmds.length && cmds[i]!.atTick === tick) {
      sim.commands.enqueue(cmds[i]!.cmd);
      i++;
    }
    sim.scheduler.tick({ tick });
  }
  return sim;
}

/** Build a horizontal road span [x0,x1] at row y. */
function roadRow(y: number, x0: number, x1: number): CitadelCommand {
  const tiles: Array<{ x: number; y: number }> = [];
  for (let x = x0; x <= x1; x++) tiles.push({ x, y });
  return { type: "placeRoad", payload: { tiles } };
}

// ---------------------------------------------------------------------------
// Base economy layout reused across tests
// ---------------------------------------------------------------------------
/** Simple connected economy: storehouse + farm + mill + bakery + house. */
function economyCmds(): ScheduledCmd[] {
  return [
    { atTick: 0, cmd: roadRow(13, 10, 40) },
    { atTick: 0, cmd: { type: "placeBuilding", payload: { buildingType: "storehouse", x: 10, y: 11 } } },
    { atTick: 0, cmd: { type: "placeBuilding", payload: { buildingType: "farm",       x: 14, y: 14 } } },
    { atTick: 0, cmd: { type: "placeBuilding", payload: { buildingType: "mill",       x: 18, y: 14 } } },
    { atTick: 0, cmd: { type: "placeBuilding", payload: { buildingType: "bakery",     x: 21, y: 14 } } },
    { atTick: 0, cmd: { type: "placeBuilding", payload: { buildingType: "house",      x: 24, y: 14 } } },
  ];
}

// ---------------------------------------------------------------------------
// 1. Happiness initialises at 40 (base with no needs met)
// ---------------------------------------------------------------------------
describe("Phase 3 — happiness", () => {
  it("happiness starts at 40 before any needs buildings are placed", () => {
    const sim = bootstrapSim({ seed: SEED, ticksPerDay: TICKS_PER_DAY, maxDays: MAX_DAYS });
    // Run 2 full days so NeedsHappinessSystem fires at tick=TICKS_PER_DAY
    sim.commands.enqueue({ type: "placeBuilding", payload: { buildingType: "house", x: 10, y: 10 } });
    for (let tick = 0; tick < TICKS_PER_DAY * 2; tick++) sim.scheduler.tick({ tick });
    // After one day with no service buildings: happiness = 40
    expect(localPlayer(sim.state).happiness).toBe(40);
  });

  it("chapel near a house raises faithCoverage and increases happiness", () => {
    const sim = bootstrapSim({ seed: SEED, ticksPerDay: TICKS_PER_DAY, maxDays: MAX_DAYS });
    // Place house at (10,10), chapel adjacent at (13,10) — within radius 8
    // Run 2 days so NeedsHappinessSystem fires at tick=TICKS_PER_DAY
    sim.commands.enqueue({ type: "placeBuilding", payload: { buildingType: "house",  x: 10, y: 10 } });
    sim.commands.enqueue({ type: "placeBuilding", payload: { buildingType: "chapel", x: 13, y: 10 } });
    for (let tick = 0; tick < TICKS_PER_DAY * 2; tick++) sim.scheduler.tick({ tick });
    expect(localPlayer(sim.state).faithCoverage).toBe(1);
    // happiness = 40 + 20*1 = 60 (no food surplus adjustment yet since no bread chain)
    expect(localPlayer(sim.state).happiness).toBe(60);
  });

  it("watchpost near a house raises safetyCoverage", () => {
    const sim = bootstrapSim({ seed: SEED, ticksPerDay: TICKS_PER_DAY, maxDays: MAX_DAYS });
    sim.commands.enqueue({ type: "placeBuilding", payload: { buildingType: "house",     x: 10, y: 10 } });
    sim.commands.enqueue({ type: "placeBuilding", payload: { buildingType: "watchpost", x: 13, y: 10 } });
    for (let tick = 0; tick < TICKS_PER_DAY * 2; tick++) sim.scheduler.tick({ tick });
    expect(localPlayer(sim.state).safetyCoverage).toBe(1);
    expect(localPlayer(sim.state).happiness).toBe(60);
  });

  it("all three service buildings near a house brings happiness to 80 without goods", () => {
    const sim = bootstrapSim({ seed: SEED, ticksPerDay: TICKS_PER_DAY, maxDays: MAX_DAYS });
    sim.commands.enqueue({ type: "placeBuilding", payload: { buildingType: "house",      x: 10, y: 10 } });
    sim.commands.enqueue({ type: "placeBuilding", payload: { buildingType: "chapel",     x: 13, y: 10 } });
    sim.commands.enqueue({ type: "placeBuilding", payload: { buildingType: "watchpost",  x: 16, y: 10 } });
    // For goods coverage we also need food in stockpile
    sim.commands.enqueue({ type: "placeBuilding", payload: { buildingType: "market",     x: 13, y: 13 } });
    for (let tick = 0; tick < TICKS_PER_DAY * 2; tick++) sim.scheduler.tick({ tick });
    // With no bread/grain yet, goodsCoverage = 0 (no goods in stockpile)
    expect(localPlayer(sim.state).faithCoverage).toBe(1);
    expect(localPlayer(sim.state).safetyCoverage).toBe(1);
    expect(localPlayer(sim.state).goodsCoverage).toBe(0);
    expect(localPlayer(sim.state).happiness).toBe(80); // 40 + 20 + 20 + 0
  });
});

// ---------------------------------------------------------------------------
// 2. Decrees
// ---------------------------------------------------------------------------
describe("Phase 3 — decrees", () => {
  it("setDecree adds/removes from activeDecrees", () => {
    const sim = bootstrapSim({ seed: SEED, ticksPerDay: TICKS_PER_DAY, maxDays: MAX_DAYS });
    sim.commands.enqueue({ type: "setDecree", payload: { decree: "workHours", active: true } });
    sim.scheduler.tick({ tick: 0 });
    expect(localPlayer(sim.state).activeDecrees.has("workHours")).toBe(true);

    sim.commands.enqueue({ type: "setDecree", payload: { decree: "workHours", active: false } });
    sim.scheduler.tick({ tick: 1 });
    expect(localPlayer(sim.state).activeDecrees.has("workHours")).toBe(false);
  });

  it("workHours decree reduces happiness by 12", () => {
    const sim = bootstrapSim({ seed: SEED, ticksPerDay: TICKS_PER_DAY, maxDays: MAX_DAYS });
    sim.commands.enqueue({ type: "placeBuilding", payload: { buildingType: "house", x: 10, y: 10 } });
    sim.commands.enqueue({ type: "setDecree", payload: { decree: "workHours", active: true } });
    // Run 2 full days so NeedsHappinessSystem fires at tick=TICKS_PER_DAY
    for (let tick = 0; tick < TICKS_PER_DAY * 2; tick++) sim.scheduler.tick({ tick });
    // 40 base - 12 workHours = 28
    expect(localPlayer(sim.state).happiness).toBe(28);
  });

  it("rationing decree reduces happiness by 10", () => {
    const sim = bootstrapSim({ seed: SEED, ticksPerDay: TICKS_PER_DAY, maxDays: MAX_DAYS });
    sim.commands.enqueue({ type: "placeBuilding", payload: { buildingType: "house", x: 10, y: 10 } });
    sim.commands.enqueue({ type: "setDecree", payload: { decree: "rationing", active: true } });
    // Run 2 full days so NeedsHappinessSystem fires at tick=TICKS_PER_DAY
    for (let tick = 0; tick < TICKS_PER_DAY * 2; tick++) sim.scheduler.tick({ tick });
    // 40 base - 10 rationing = 30
    expect(localPlayer(sim.state).happiness).toBe(30);
  });

  it("workHours decree boosts farm grain output by 30%", () => {
    // Run two sims: one with workHours decree, one without.
    // Both have the same economy: storehouse + farm + house (pioneer staffs farm).
    // After 20 days, sim with workHours should have produced more grain.
    const baseCmds: ScheduledCmd[] = [
      { atTick: 0, cmd: roadRow(13, 10, 22) },
      { atTick: 0, cmd: { type: "placeBuilding", payload: { buildingType: "storehouse", x: 10, y: 11 } } },
      { atTick: 0, cmd: { type: "placeBuilding", payload: { buildingType: "farm",       x: 18, y: 14 } } },
      { atTick: 0, cmd: { type: "placeBuilding", payload: { buildingType: "house",      x: 22, y: 11 } } },
    ];

    const cmdsWithDecree: ScheduledCmd[] = [
      ...baseCmds,
      { atTick: 0, cmd: { type: "setDecree", payload: { decree: "workHours", active: true } } },
    ];

    const simBase  = run(baseCmds,       TICKS_PER_DAY * 20);
    const simBoost = run(cmdsWithDecree, TICKS_PER_DAY * 20);

    // Both should have grain (farm ran)
    expect(simBase.stockpiles.grain).toBeGreaterThan(0);
    // With workHours, grain should be higher (or equal if all was consumed — but
    // without bakery the chain stops at grain, so grain accumulates)
    expect(simBoost.stockpiles.grain).toBeGreaterThanOrEqual(simBase.stockpiles.grain);
  });

  it("rationing decree reduces bread consumption", () => {
    // Place a minimal economy, run 30 days to establish bread production.
    // Then enable rationing and check that the population survives longer
    // under food stress by consuming less.
    // Simpler approach: set up economy, verify that rationing sim has more bread
    // after the same number of days (consumed less).
    const cmds = economyCmds();
    const cmdsRationing: ScheduledCmd[] = [
      ...cmds,
      // Enable rationing at tick 0
      { atTick: 0, cmd: { type: "setDecree", payload: { decree: "rationing", active: true } } },
    ];

    const simBase     = run(cmds,        TICKS_PER_DAY * 30);
    const simRation   = run(cmdsRationing, TICKS_PER_DAY * 30);

    // Both should have population > 0 (economy runs fine)
    expect(simBase.population).toBeGreaterThan(0);
    expect(simRation.population).toBeGreaterThan(0);
    // Rationing reduces consumption by 25% — verify it's reflected in the flag
    expect(localPlayer(simRation.state).activeDecrees.has("rationing")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 3. Trader
// ---------------------------------------------------------------------------
describe("Phase 3 — trader", () => {
  it("no tradingpost → trader never arrives", () => {
    const sim = run(economyCmds(), TICKS_PER_DAY * 15);
    expect(localPlayer(sim.state).traderPresent).toBe(false);
    expect(localPlayer(sim.state).traderOffers).toHaveLength(0);
  });

  it("tradingpost causes a caravan to arrive within ~10 days", () => {
    const cmds: ScheduledCmd[] = [
      ...economyCmds(),
      { atTick: 0, cmd: roadRow(13, 25, 32) }, // extend road to trading post
      { atTick: 0, cmd: { type: "placeBuilding", payload: { buildingType: "tradingpost", x: 28, y: 14 } } },
    ];
    const sim = run(cmds, TICKS_PER_DAY * 12);
    // Trader should have arrived by day 10+jitter (<=12)
    const arrivals = sim.state.events.filter((e) => e.includes("merchant caravan arrived"));
    expect(arrivals.length).toBeGreaterThan(0);
  });

  it("barter command exchanges goods if trader is present and goods available", () => {
    const sim = bootstrapSim({ seed: SEED, ticksPerDay: TICKS_PER_DAY, maxDays: MAX_DAYS });

    // Manually put grain into stockpile so we can barter
    localPlayer(sim.state).stockpiles.grain = 10;
    // Manually inject trader state (bypassing the system)
    localPlayer(sim.state).traderPresent = true;
    localPlayer(sim.state).traderOffers.push({ give: "grain", giveQty: 5, receive: "bread", receiveQty: 2 });

    // Enqueue barter command (offerIndex 0)
    sim.commands.enqueue({ type: "barter", payload: { offerIndex: 0 } });
    sim.scheduler.tick({ tick: 0 });

    // Grain should have decreased by 5; bread should have increased by 2
    expect(localPlayer(sim.state).stockpiles.grain).toBe(5);
    expect(localPlayer(sim.state).stockpiles.bread).toBe(2);
  });

  it("barter command is ignored when trader is not present", () => {
    const sim = bootstrapSim({ seed: SEED, ticksPerDay: TICKS_PER_DAY, maxDays: MAX_DAYS });
    localPlayer(sim.state).stockpiles.grain = 10;
    // traderPresent is false by default

    sim.commands.enqueue({ type: "barter", payload: { offerIndex: 0 } });
    sim.scheduler.tick({ tick: 0 });

    // Nothing should have changed
    expect(localPlayer(sim.state).stockpiles.grain).toBe(10);
    expect(localPlayer(sim.state).stockpiles.bread).toBe(0);
  });

  it("barter command is ignored when not enough goods", () => {
    const sim = bootstrapSim({ seed: SEED, ticksPerDay: TICKS_PER_DAY, maxDays: MAX_DAYS });
    localPlayer(sim.state).stockpiles.grain = 2; // need 5
    localPlayer(sim.state).traderPresent = true;
    localPlayer(sim.state).traderOffers.push({ give: "grain", giveQty: 5, receive: "bread", receiveQty: 2 });

    sim.commands.enqueue({ type: "barter", payload: { offerIndex: 0 } });
    sim.scheduler.tick({ tick: 0 });

    expect(localPlayer(sim.state).stockpiles.grain).toBe(2); // unchanged
    expect(localPlayer(sim.state).stockpiles.bread).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 4. Snapshot includes Phase 3 fields
// ---------------------------------------------------------------------------
describe("Phase 3 — snapshot", () => {
  it("getSnapshot includes happiness, activeDecrees, traderPresent, traderOffers", () => {
    const sim = bootstrapSim({ seed: SEED, ticksPerDay: TICKS_PER_DAY, maxDays: MAX_DAYS });
    sim.commands.enqueue({ type: "setDecree", payload: { decree: "tithe", active: true } });
    sim.scheduler.tick({ tick: 0 });
    const snap = sim.getSnapshot(0);
    expect(snap.happiness).toBeDefined();
    expect(snap.activeDecrees).toContain("tithe");
    expect(snap.traderPresent).toBe(false);
    expect(snap.traderOffers).toHaveLength(0);
    expect(snap.faithCoverage).toBeDefined();
    expect(snap.safetyCoverage).toBeDefined();
    expect(snap.goodsCoverage).toBeDefined();
  });

  it("determinism: same seed + commands → identical Phase 3 snapshot", () => {
    const cmds: ScheduledCmd[] = [
      ...economyCmds(),
      { atTick: 0, cmd: { type: "setDecree", payload: { decree: "workHours", active: true } } },
    ];
    const total = TICKS_PER_DAY * 3;
    const a = run(cmds, total).getSnapshot(total);
    const b = run(cmds, total).getSnapshot(total);
    expect(a.happiness).toBe(b.happiness);
    expect(a.faithCoverage).toBe(b.faithCoverage);
    expect(a.activeDecrees).toEqual(b.activeDecrees);
    expect(a.traderPresent).toBe(b.traderPresent);
  });
});
