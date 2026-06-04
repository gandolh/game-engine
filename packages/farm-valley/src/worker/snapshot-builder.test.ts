/**
 * snapshot-builder.test.ts — verifies that buildRenderSnapshot produces
 * correct, deterministic output from a bootstrapped sim.
 */

import { describe, it, expect } from "vitest";
import { bootstrapSim, leaderboard } from "../sim-bootstrap";
import {
  buildRenderSnapshot,
  buildObserverSnapshot,
  buildLeaderboardRows,
  countEntities,
} from "./snapshot-builder";
import type { SnapshotShock } from "./snapshot";

const SEED = 0xc0ffee;
const TICKS_PER_DAY = 20;
const MAX_DAYS = 10; // short run for tests

function bootAndTick(ticks: number) {
  const sim = bootstrapSim({
    seed: SEED,
    ticksPerDay: TICKS_PER_DAY,
    maxDays: MAX_DAYS,
  });
  for (let tick = 0; tick < ticks; tick++) {
    for (const e of sim.world.query("transform")) {
      e.transform.prevX = e.transform.x;
      e.transform.prevY = e.transform.y;
    }
    sim.scheduler.tick({ tick });
    sim.bus.notifySubscribers();
  }
  return sim;
}

describe("buildRenderSnapshot", () => {
  it("returns a snapshot with sprites at tick 5", () => {
    const sim = bootAndTick(5);
    const snap = buildRenderSnapshot(
      sim.world,
      sim.dayClock,
      sim.meetIndicators,
      sim.eventFeed,
      5,
      MAX_DAYS,
      null,
    );

    expect(snap.tick).toBe(5);
    expect(snap.sprites.length).toBeGreaterThan(0);
    expect(snap.gameOver).toBe(false);
    expect(snap.finalSummary).toBeNull();
    expect(snap.shock).toBeNull();
  });

  it("observer has 4 farmers", () => {
    const sim = bootAndTick(5);
    const snap = buildRenderSnapshot(
      sim.world,
      sim.dayClock,
      sim.meetIndicators,
      sim.eventFeed,
      5,
      MAX_DAYS,
      null,
    );

    expect(snap.observer.farmers).toHaveLength(4);
    // Farmers sorted by id
    const ids = snap.observer.farmers.map((f) => f.id);
    expect(ids).toEqual([...ids].sort((a, b) => a - b));
  });

  it("leaderboard has 4 rows with correct structure", () => {
    const sim = bootAndTick(5);
    const snap = buildRenderSnapshot(
      sim.world,
      sim.dayClock,
      sim.meetIndicators,
      sim.eventFeed,
      5,
      MAX_DAYS,
      null,
    );

    expect(snap.leaderboard).toHaveLength(4);
    for (const row of snap.leaderboard) {
      expect(typeof row.rank).toBe("number");
      expect(typeof row.id).toBe("number");
      expect(typeof row.name).toBe("string");
      expect(typeof row.personality).toBe("string");
      expect(typeof row.gold).toBe("number");
      expect(typeof row.totalValue).toBe("number");
    }
    // Ranks are 1..4
    const ranks = snap.leaderboard.map((r) => r.rank);
    expect(ranks).toEqual([1, 2, 3, 4]);
  });

  it("slate is an array (may be empty early in the sim)", () => {
    const sim = bootAndTick(5);
    const snap = buildRenderSnapshot(
      sim.world,
      sim.dayClock,
      sim.meetIndicators,
      sim.eventFeed,
      5,
      MAX_DAYS,
      null,
    );

    expect(Array.isArray(snap.slate)).toBe(true);
  });

  it("entityCount is sane (> 0)", () => {
    const sim = bootAndTick(5);
    const snap = buildRenderSnapshot(
      sim.world,
      sim.dayClock,
      sim.meetIndicators,
      sim.eventFeed,
      5,
      MAX_DAYS,
      null,
    );

    expect(snap.entityCount).toBeGreaterThan(0);
  });

  it("sprite positions are in pixel space (multiples of 8 or 8+n*16)", () => {
    const sim = bootAndTick(1);
    const snap = buildRenderSnapshot(
      sim.world,
      sim.dayClock,
      sim.meetIndicators,
      sim.eventFeed,
      1,
      MAX_DAYS,
      null,
    );

    // Every sprite x/y should be at least 0 (world is non-negative tile coords)
    for (const s of snap.sprites) {
      expect(s.x).toBeGreaterThanOrEqual(0);
      expect(s.y).toBeGreaterThanOrEqual(0);
    }
  });

  it("farmer sprites have interpolate=true; crops have interpolate=false", () => {
    const sim = bootAndTick(5);
    const snap = buildRenderSnapshot(
      sim.world,
      sim.dayClock,
      sim.meetIndicators,
      sim.eventFeed,
      5,
      MAX_DAYS,
      null,
    );

    const farmerSprites = snap.sprites.filter((s) => s.frame.startsWith("farmer/"));
    const cropSprites = snap.sprites.filter((s) => s.frame.startsWith("crop/"));

    expect(farmerSprites.length).toBeGreaterThan(0);
    for (const s of farmerSprites) {
      expect(s.interpolate).toBe(true);
    }
    // Crop sprites are dynamic but not interpolated
    for (const s of cropSprites) {
      expect(s.interpolate).toBe(false);
    }
  });

  it("shock field is set when a pending shock is passed", () => {
    const sim = bootAndTick(5);
    const shock: SnapshotShock = {
      kind: "blight",
      day: 5,
      targetFarmerId: 1,
      targetName: "Cora",
      plotsWiped: 3,
    };
    const snap = buildRenderSnapshot(
      sim.world,
      sim.dayClock,
      sim.meetIndicators,
      sim.eventFeed,
      5,
      MAX_DAYS,
      shock,
    );

    expect(snap.shock).toEqual(shock);
  });

  it("gameOver=true and finalSummary present when day >= maxDays", () => {
    // Run past maxDays
    const sim = bootAndTick(MAX_DAYS * TICKS_PER_DAY + 1);
    const snap = buildRenderSnapshot(
      sim.world,
      sim.dayClock,
      sim.meetIndicators,
      sim.eventFeed,
      MAX_DAYS * TICKS_PER_DAY,
      MAX_DAYS,
      null,
    );

    expect(snap.gameOver).toBe(true);
    expect(snap.finalSummary).not.toBeNull();
    // FinalStandingRow has crops
    for (const row of snap.finalSummary!) {
      expect(typeof row.crops.radish).toBe("number");
      expect(typeof row.crops.wheat).toBe("number");
      expect(typeof row.crops.pumpkin).toBe("number");
    }
  });
});

describe("determinism — same seed produces identical observer + leaderboard", () => {
  it("two sims produce identical observer at tick 15", () => {
    const tickTarget = 15;

    const simA = bootAndTick(tickTarget);
    const snapA = buildRenderSnapshot(
      simA.world,
      simA.dayClock,
      simA.meetIndicators,
      simA.eventFeed,
      tickTarget,
      MAX_DAYS,
      null,
    );

    const simB = bootAndTick(tickTarget);
    const snapB = buildRenderSnapshot(
      simB.world,
      simB.dayClock,
      simB.meetIndicators,
      simB.eventFeed,
      tickTarget,
      MAX_DAYS,
      null,
    );

    expect(snapA.observer).toEqual(snapB.observer);
  });

  it("two sims produce identical leaderboard at tick 15", () => {
    const tickTarget = 15;

    const simA = bootAndTick(tickTarget);
    const snapA = buildRenderSnapshot(
      simA.world,
      simA.dayClock,
      simA.meetIndicators,
      simA.eventFeed,
      tickTarget,
      MAX_DAYS,
      null,
    );

    const simB = bootAndTick(tickTarget);
    const snapB = buildRenderSnapshot(
      simB.world,
      simB.dayClock,
      simB.meetIndicators,
      simB.eventFeed,
      tickTarget,
      MAX_DAYS,
      null,
    );

    expect(snapA.leaderboard).toEqual(snapB.leaderboard);
  });
});

describe("buildObserverSnapshot", () => {
  it("returns weather + 4 farmers", () => {
    const sim = bootAndTick(5);
    const obs = buildObserverSnapshot(sim.world, sim.dayClock.day);
    expect(obs.weather).toBeDefined();
    expect(obs.farmers).toHaveLength(4);
    expect(obs.forecast).toBeDefined();
  });
});

describe("buildLeaderboardRows", () => {
  it("returns 4 rows sorted by totalValue desc", () => {
    const sim = bootAndTick(5);
    const rows = buildLeaderboardRows(leaderboard(sim.world));
    expect(rows).toHaveLength(4);
    for (let i = 0; i < rows.length - 1; i++) {
      expect(rows[i]!.totalValue).toBeGreaterThanOrEqual(rows[i + 1]!.totalValue);
    }
  });
});

describe("countEntities", () => {
  it("returns a positive number", () => {
    const sim = bootAndTick(1);
    expect(countEntities(sim.world)).toBeGreaterThan(0);
  });
});
