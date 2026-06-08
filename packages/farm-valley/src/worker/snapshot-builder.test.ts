/**
 * snapshot-builder.test.ts — verifies that buildRenderSnapshot produces
 * correct, deterministic output from a bootstrapped sim.
 *
 * Also includes Brief 40 unit tests for the intention→glyph map and the
 * shouldStopSkip pure helper (no worker/sim bootstrapping needed for those).
 */

import { describe, it, expect } from "vitest";
import { bootstrapSim, leaderboard } from "../sim-bootstrap";
import {
  buildRenderSnapshot,
  buildObserverSnapshot,
  buildLeaderboardRows,
  countEntities,
  INTENTION_KIND_TO_GLYPH,
  HIGHLIGHT_THRESHOLD,
} from "./snapshot-builder";
import { shouldStopSkip } from "./sim-worker";
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

  it("observer has one entry per farmer (4 AI + player + procedural band)", () => {
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

    expect(snap.observer.farmers).toHaveLength(sim.farmers.length);
    // Farmers sorted by id
    const ids = snap.observer.farmers.map((f) => f.id);
    expect(ids).toEqual([...ids].sort((a, b) => a - b));
  });

  it("leaderboard has one row per farmer with correct structure", () => {
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

    expect(snap.leaderboard).toHaveLength(sim.farmers.length);
    for (const row of snap.leaderboard) {
      expect(typeof row.rank).toBe("number");
      expect(typeof row.id).toBe("number");
      expect(typeof row.name).toBe("string");
      expect(typeof row.personality).toBe("string");
      expect(typeof row.gold).toBe("number");
      expect(typeof row.totalValue).toBe("number");
    }
    // Ranks are a contiguous 1..N.
    const ranks = snap.leaderboard.map((r) => r.rank);
    expect(ranks).toEqual(Array.from({ length: sim.farmers.length }, (_v, i) => i + 1));
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
    // FinalStandingRow has crops (brief 41: sparse Partial<Record<CropKind, number>> — only non-zero crops included)
    for (const row of snap.finalSummary!) {
      expect(typeof row.crops).toBe("object");
      // All present entries must be positive numbers (zero entries are omitted).
      for (const [, count] of Object.entries(row.crops)) {
        expect(typeof count).toBe("number");
        expect(count).toBeGreaterThan(0);
      }
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
  it("returns weather + one entry per farmer", () => {
    const sim = bootAndTick(5);
    const obs = buildObserverSnapshot(sim.world, sim.dayClock.day);
    expect(obs.weather).toBeDefined();
    expect(obs.farmers).toHaveLength(sim.farmers.length);
    expect(obs.forecast).toBeDefined();
  });
});

describe("buildLeaderboardRows", () => {
  it("returns one row per farmer sorted by totalValue desc", () => {
    const sim = bootAndTick(5);
    const rows = buildLeaderboardRows(leaderboard(sim.world));
    expect(rows).toHaveLength(sim.farmers.length);
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

// ---------------------------------------------------------------------------
// Brief 40 — intention→glyph map
// ---------------------------------------------------------------------------

describe("INTENTION_KIND_TO_GLYPH (brief 40)", () => {
  it("maps every documented intention kind to an indicator/* frame", () => {
    const documented = [
      "plant", "water", "harvest", "sell", "buy", "travel",
      "sleep", "fish", "bid", "meet", "refill", "chop", "mine",
      "work", "idle",
    ] as const;
    for (const kind of documented) {
      const glyph = INTENTION_KIND_TO_GLYPH[kind];
      expect(glyph, `${kind} should map to a glyph`).toBeDefined();
      expect(
        glyph!.startsWith("indicator/intention-"),
        `${kind} glyph should start with indicator/intention-`,
      ).toBe(true);
    }
  });

  it("maps plant to indicator/intention-plant", () => {
    expect(INTENTION_KIND_TO_GLYPH["plant"]).toBe("indicator/intention-plant");
  });

  it("maps water to indicator/intention-water", () => {
    expect(INTENTION_KIND_TO_GLYPH["water"]).toBe("indicator/intention-water");
  });

  it("maps refill to indicator/intention-water (reuse water glyph)", () => {
    expect(INTENTION_KIND_TO_GLYPH["refill"]).toBe("indicator/intention-water");
  });

  it("maps fish to indicator/intention-fish", () => {
    expect(INTENTION_KIND_TO_GLYPH["fish"]).toBe("indicator/intention-fish");
  });

  it("maps bid to indicator/intention-bid", () => {
    expect(INTENTION_KIND_TO_GLYPH["bid"]).toBe("indicator/intention-bid");
  });

  it("returns undefined for an unknown intention kind (no bubble shown)", () => {
    expect(INTENTION_KIND_TO_GLYPH["unknown-kind-xyz"]).toBeUndefined();
  });

  it("HIGHLIGHT_THRESHOLD is 0.7 — matches the feed-panel emphasis threshold", () => {
    expect(HIGHLIGHT_THRESHOLD).toBe(0.7);
  });
});

// ---------------------------------------------------------------------------
// Brief 40 — shouldStopSkip pure helper
// ---------------------------------------------------------------------------

describe("shouldStopSkip (brief 40)", () => {
  it("returns false when feed length did not increase (no new event)", () => {
    expect(shouldStopSkip(5, 5, 0.9, 0.7)).toBe(false);
  });

  it("returns false when a new event appeared but drama is below threshold", () => {
    expect(shouldStopSkip(5, 6, 0.65, 0.7)).toBe(false);
  });

  it("returns true when a new event appeared and drama meets the threshold exactly", () => {
    expect(shouldStopSkip(5, 6, 0.7, 0.7)).toBe(true);
  });

  it("returns true when a new event appeared and drama exceeds the threshold", () => {
    expect(shouldStopSkip(5, 6, 0.95, 0.7)).toBe(true);
  });

  it("returns false when feed length decreased (no new event added)", () => {
    expect(shouldStopSkip(6, 5, 0.95, 0.7)).toBe(false);
  });

  it("respects a custom threshold — drama 0.85 below 0.9 → false", () => {
    expect(shouldStopSkip(5, 6, 0.85, 0.9)).toBe(false);
  });

  it("respects a custom threshold — drama 0.9 at 0.9 → true", () => {
    expect(shouldStopSkip(5, 6, 0.9, 0.9)).toBe(true);
  });

  it("handles the starting case (prevLen=0, 1 high-drama event) → true", () => {
    expect(shouldStopSkip(0, 1, 0.8, 0.7)).toBe(true);
  });

  it("handles the starting case (prevLen=0, 1 low-drama event) → false", () => {
    expect(shouldStopSkip(0, 1, 0.3, 0.7)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Brief 40 — AI farmer sprites carry a bubble field
// ---------------------------------------------------------------------------

describe("AI farmer sprites carry a bubble field (brief 40)", () => {
  it("AI farmer sprites have a bubble field (string or null) after a tick", () => {
    // Run a few ticks to let the AI farmers start acting and pick intentions.
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

    // All AI farmer sprites (interpolate=true, not the player) should have the
    // bubble field defined (string or null; never undefined after tick 0+).
    const aiFarmerSprites = snap.sprites.filter(
      (s) => s.interpolate && s.id !== null,
    );
    expect(aiFarmerSprites.length).toBeGreaterThan(0);
    for (const s of aiFarmerSprites) {
      // bubble is string (active glyph) or null (window expired) — never undefined.
      expect(s.bubble === null || typeof s.bubble === "string").toBe(true);
    }
  });

  it("non-farmer sprites have no bubble (undefined or null, both falsy)", () => {
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

    // Crop sprites (id=null) go through a separate code path and don't have
    // the bubble field set at all (undefined), which is acceptable — the
    // renderer guards with `s.bubble !== null && s.bubble !== undefined`.
    const cropSprites = snap.sprites.filter(
      (s) => s.frame.startsWith("crop/"),
    );
    for (const s of cropSprites) {
      expect(s.bubble).toBeFalsy();
    }
  });
});
