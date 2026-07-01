/**
 * Chunk 2 — cozy cold-open threat-defer.
 *
 * `bootstrapSim({ deferThreatsUntilBuildings: N })` suppresses fire ignition,
 * disease ONSET, and raid scheduling for a player until they own at least N
 * non-road buildings (the same count the tier ladder uses). The cold-open passes
 * N=6: the seed drops 5 structures, so threats only become possible once the
 * player has added their own 6th building.
 *
 * The default (N=0) is disabled and MUST be byte-identical to today — the gate
 * short-circuits BEFORE any RNG draw, so the RNG sequence is untouched. That
 * invariant is proven here by replaying an existing cozy scenario with the flag
 * explicitly 0 and asserting the same threat still fires.
 *
 * All tests drive bootstrapSim() directly — no Worker, no browser. Patterns
 * (findClear, placeBatch, forceIgnite) mirror cozy-threats.test.ts.
 */
import { describe, it, expect } from "vitest";
import { localPlayer } from "../sim-state";
import { bootstrapSim } from "../sim-bootstrap";
import type { CitadelSimResult } from "../sim-bootstrap";
import { isWalkable } from "../world/terrain";
import { countNonRoadBuildings } from "./tiers";

const SEED = 0x1234_5678;
const TICKS_PER_DAY = 20;
const SEED_CORE = 5; // farm, mill, bakery, house, storehouse
const DEFER = 6; // threats begin at the 6th non-road building (cold-open value)

/** Find a clear w×h area on the terrain starting near (sx, sy). */
function findClear(
  terrain: { width: number; height: number; cells: Uint8Array },
  w: number, h: number, sx: number, sy: number,
): { x: number; y: number } {
  for (let r = 0; r < 40; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const x = sx + dx;
        const y = sy + dy;
        let ok = true;
        for (let yy = 0; yy < h && ok; yy++)
          for (let xx = 0; xx < w; xx++)
            if (!isWalkable(terrain, x + xx, y + yy)) { ok = false; break; }
        if (ok) return { x, y };
      }
    }
  }
  return { x: sx, y: sy };
}

/** Run n days from startTick (inclusive of tick startTick). Returns the next tick. */
function runDays(sim: CitadelSimResult, n: number, startTick: number): number {
  let t = startTick;
  for (let i = 0; i < n * TICKS_PER_DAY; i++, t++) sim.scheduler.tick({ tick: t });
  return t;
}

const THREAT_RE = /caught fire|fire spread|disease outbreak|Raid \d+ spotted|Scouts report raiders/i;

describe("deferThreatsUntilBuildings — cold-open threat defer", () => {
  it("suppresses ALL threats while the player is at/below the seeded core (past the founding grace)", () => {
    const sim = bootstrapSim({
      seed: SEED,
      ticksPerDay: TICKS_PER_DAY,
      maxDays: 60,
      seedTown: true,
      deferThreatsUntilBuildings: DEFER,
    });
    const lp = localPlayer(sim.state);

    // The seed lands exactly the 5-structure core.
    // (One tick to flush connectivity — buildings are placed at bootstrap.)
    sim.scheduler.tick({ tick: 0 });
    expect(countNonRoadBuildings(sim.state, lp.id)).toBe(SEED_CORE);
    expect(SEED_CORE).toBeLessThan(DEFER); // seed is below the gate

    // Push crowding + misery so disease onset chance would otherwise be high — the
    // gate must still hold it off while the town is stuck at its seeded core.
    lp.happiness = 0;

    // Run well past the founding grace (6 days) — 30 days — with the town stuck at
    // the seeded core. No fire/disease event may appear.
    runDays(sim, 30, 1);

    // Sanity: still at the seeded core, and the temporal founding grace has expired.
    expect(countNonRoadBuildings(sim.state, lp.id)).toBe(SEED_CORE);
    expect(sim.state.events.some((e) => THREAT_RE.test(e))).toBe(false);
    // No outbreak, no fire materialized.
    expect(lp.outbreakActive).toBe(false);
    let anyBurning = false;
    for (const [, fs] of lp.fireState) if (fs.burning) anyBurning = true;
    expect(anyBurning).toBe(false);
    // No raid either (solo has no keep anyway; the count-gate is proven separately).
    expect(lp.raiders.length).toBe(0);
    expect(lp.raidCount).toBe(0);
  });

  it("raid scheduling stays parked while below the gate EVEN with a keep, then arms once past it", () => {
    // No seedTown — build by hand so we control the exact non-road building count and
    // can hold a keep BELOW the threshold. This isolates the raid count-gate from the
    // keep-gate (a keep alone would otherwise arm the raid clock).
    const sim = bootstrapSim({
      seed: SEED,
      ticksPerDay: TICKS_PER_DAY,
      maxDays: 60,
      deferThreatsUntilBuildings: DEFER,
    });
    const lp = localPlayer(sim.state);
    lp.tier = "Town"; // keep needs Town tier to place

    // Place a keep — count = 1 (< DEFER). The keep-gate is satisfied; the count-gate
    // must still hold the raid clock at -1.
    const kp = findClear(sim.terrain, 3, 3, 48, 48);
    sim.commands.enqueue({ type: "placeBuilding", payload: { buildingType: "keep", x: kp.x, y: kp.y } });
    let t = runDays(sim, 12, 0); // well past day-5 first-raid + founding
    expect(countNonRoadBuildings(sim.state, lp.id)).toBeLessThan(DEFER);
    expect(lp.nextRaidTick).toBe(-1); // parked by the count-gate despite the keep
    expect(lp.raidCount).toBe(0);

    // Grow past the gate: add buildings until count >= DEFER.
    let n = 0;
    for (const type of ["house", "house", "farm", "mill", "bakery", "chapel"]) {
      const pos = findClear(sim.terrain, 2, 2, 20 + n * 4, 20);
      sim.commands.enqueue({ type: "placeBuilding", payload: { buildingType: type, x: pos.x, y: pos.y } });
      n++;
    }
    sim.scheduler.tick({ tick: t }); t++;
    expect(countNonRoadBuildings(sim.state, lp.id)).toBeGreaterThanOrEqual(DEFER);

    // Gate flipped: the raid clock arms now that the town has grown past the core.
    runDays(sim, 8, t);
    expect(lp.nextRaidTick).not.toBe(-1);
  });

  it("with defer on, an already-active outbreak still progresses/recovers (only ONSET is gated)", () => {
    const sim = bootstrapSim({
      seed: SEED,
      ticksPerDay: TICKS_PER_DAY,
      maxDays: 60,
      seedTown: true,
      deferThreatsUntilBuildings: DEFER,
    });
    const lp = localPlayer(sim.state);
    sim.scheduler.tick({ tick: 0 });
    expect(countNonRoadBuildings(sim.state, lp.id)).toBeLessThan(DEFER);

    // Grow population so there are villagers to be sick, then force an active outbreak
    // by hand (the ONSET path is what's gated — an active one must still tick down).
    let t = runDays(sim, 6, 1);
    if (lp.population > 0) {
      lp.outbreakActive = true;
      lp.sickVillagers = lp.population;
      const sickBefore = lp.sickVillagers;
      // Run several days; the cozy recovery floor sheds sick villagers each day even
      // while onset is deferred — proof the "else" (active-outbreak) branch still runs.
      runDays(sim, 10, t);
      expect(lp.sickVillagers).toBeLessThan(sickBefore);
    }
    void t;
  });
});

describe("deferThreatsUntilBuildings default (0) — baseline unchanged", () => {
  it("with the flag explicitly 0, the sharp raid path still sacks an undefended keep (RNG sequence untouched)", () => {
    // Mirror cozy-threats.test.ts's regression guard, but with deferThreatsUntilBuildings: 0
    // set explicitly. If the gate consumed RNG or short-circuited when it shouldn't, the
    // schedule would shift and this deterministic sack would not reproduce.
    const sim = bootstrapSim({
      seed: 0xc17ade1,
      ticksPerDay: TICKS_PER_DAY,
      maxDays: 100,
      cozyThreats: false,
      deferThreatsUntilBuildings: 0,
    });
    const lp = localPlayer(sim.state);
    lp.tier = "Town";
    const g = findClear(sim.terrain, 3, 3, 48, 48);
    sim.commands.enqueue({ type: "placeBuilding", payload: { buildingType: "keep", x: g.x, y: g.y } });

    let sacked = false;
    for (let tick = 0; tick < 60 * TICKS_PER_DAY; tick++) {
      sim.scheduler.tick({ tick });
      if (lp.keepSacked) { sacked = true; break; }
    }
    expect(sacked).toBe(true);
    expect(lp.gameOver).toBe(true);
  });

  it("omitting the flag (undefined ⇒ 0) reproduces the same sack, tick-for-tick", () => {
    const raidTickWith0 = (defer: number | undefined): number => {
      const sim = bootstrapSim({
        seed: 0xc17ade1,
        ticksPerDay: TICKS_PER_DAY,
        maxDays: 100,
        cozyThreats: false,
        ...(defer !== undefined ? { deferThreatsUntilBuildings: defer } : {}),
      });
      const lp = localPlayer(sim.state);
      lp.tier = "Town";
      const g = findClear(sim.terrain, 3, 3, 48, 48);
      sim.commands.enqueue({ type: "placeBuilding", payload: { buildingType: "keep", x: g.x, y: g.y } });
      let sackTick = -1;
      for (let tick = 0; tick < 60 * TICKS_PER_DAY; tick++) {
        sim.scheduler.tick({ tick });
        if (lp.keepSacked) { sackTick = tick; break; }
      }
      return sackTick;
    };
    const omitted = raidTickWith0(undefined);
    const explicitZero = raidTickWith0(0);
    expect(omitted).toBeGreaterThan(0);
    // Byte-identical schedule: the sack lands on the exact same tick either way.
    expect(explicitZero).toBe(omitted);
  });
});
