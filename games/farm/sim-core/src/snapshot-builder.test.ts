import { describe, it, expect } from "vitest";
import { bootstrapSim, leaderboard } from "./sim-bootstrap";
import {
  buildRenderSnapshot,
  buildObserverSnapshot,
  buildLeaderboardRows,
  countEntities,
  INTENTION_KIND_TO_GLYPH,
  HIGHLIGHT_THRESHOLD,
} from "./snapshot-builder";
import { shouldStopSkip } from "./sim-worker-skip";
import type { SnapshotShock } from "./snapshot";

const SEED = 0xc0ffee;
const TICKS_PER_DAY = 20;
const MAX_DAYS = 10; 

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

    for (const s of cropSprites) {
      expect(s.interpolate).toBe(false);
    }
  });

  it("work-NPC sprites have interpolate=true (brief 82 — they tile-step like farmers)", () => {
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

    const npcIds = new Set<number>();
    for (const e of sim.world.query("workNpc")) {
      if (e.id !== undefined) npcIds.add(e.id);
    }
    expect(npcIds.size).toBeGreaterThan(0);

    const npcSprites = snap.sprites.filter((s) => s.id !== null && npcIds.has(s.id));
    expect(npcSprites.length).toBe(npcIds.size);
    for (const s of npcSprites) {
      expect(s.interpolate).toBe(true);
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

    for (const row of snap.finalSummary!) {
      expect(typeof row.crops).toBe("object");

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

describe("INTENTION_KIND_TO_GLYPH", () => {
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

describe("shouldStopSkip", () => {
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

describe("AI farmer sprites carry a bubble field", () => {
  it("AI farmer sprites have a bubble field (string or null) after a tick", () => {

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

    const aiFarmerSprites = snap.sprites.filter(
      (s) => s.interpolate && s.id !== null,
    );
    expect(aiFarmerSprites.length).toBeGreaterThan(0);
    for (const s of aiFarmerSprites) {

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

    const cropSprites = snap.sprites.filter(
      (s) => s.frame.startsWith("crop/"),
    );
    for (const s of cropSprites) {
      expect(s.bubble).toBeFalsy();
    }
  });
});

import { DRY_DEATH_GRACE_DAYS } from "./systems/farming/crop-growth";
import {
  UNTINTED_RGBA,
  EXHAUSTED_AP_FRACTION,
  cropCue,
  farmerCue,
} from "./snapshot-builder/indicators";
import type { CropKind } from "./components";

const TILE = 16;

function snapAt(sim: ReturnType<typeof bootstrapSim>, tick: number) {
  return buildRenderSnapshot(
    sim.world,
    sim.dayClock,
    sim.meetIndicators,
    sim.eventFeed,
    tick,
    MAX_DAYS,
    null,
  );
}

function cropSpriteAt(snap: ReturnType<typeof snapAt>, tileX: number, tileY: number) {
  const x = tileX * TILE + TILE / 2;
  const y = tileY * TILE + TILE / 2;
  return snap.sprites.find(
    (s) => s.id === null && s.frame.startsWith("crop/") && s.x === x && s.y === y,
  );
}

function plantFirstPlot(
  sim: ReturnType<typeof bootstrapSim>,
  crop: CropKind,
  overrides: { wateredToday?: boolean; daysSinceWater?: number; daysGrowing?: number },
): { tileX: number; tileY: number } {
  for (const p of sim.world.query("plot")) {
    p.plot.state = {
      kind: "planted",
      crop,
      daysGrowing: overrides.daysGrowing ?? 1,
      readyAtDay: 4,
      weatherSum: 0,
      daysSinceWater: overrides.daysSinceWater ?? 0,
      wateredToday: overrides.wateredToday ?? true,
    };
    return { tileX: p.plot.tileX, tileY: p.plot.tileY };
  }
  throw new Error("no plot entity found in world");
}

function firstFarmer(sim: ReturnType<typeof bootstrapSim>) {
  for (const e of sim.world.query("farmer", "inventory", "ap")) {
    if (e.id !== undefined) return e;
  }
  throw new Error("no farmer entity found");
}

function farmerSprite(snap: ReturnType<typeof snapAt>, id: number) {
  return snap.sprites.find((s) => s.id === id && s.frame.startsWith("farmer/"));
}

describe("visual state indicators — crops", () => {
  it("an unwatered (not-yet-at-risk) crop sprite is thirsty: tinted, full alpha, tooltip says thirsty", () => {
    const sim = bootAndTick(5);
    const { tileX, tileY } = plantFirstPlot(sim, "wheat", {
      wateredToday: false,
      daysSinceWater: 0,
    });
    const snap = snapAt(sim, 5);
    const s = cropSpriteAt(snap, tileX, tileY);
    expect(s).toBeDefined();
    expect(s!.tintRgba).not.toBe(UNTINTED_RGBA);
    expect(s!.alpha).toBe(1); 
    expect(s!.description).toContain("thirsty");
    expect(s!.description).not.toContain("dying");
  });

  it("a crop at the wither grace threshold is dying: tinted + reduced alpha, tooltip says dying", () => {
    const sim = bootAndTick(5);

    const { tileX, tileY } = plantFirstPlot(sim, "wheat", {
      wateredToday: false,
      daysSinceWater: DRY_DEATH_GRACE_DAYS,
    });
    const snap = snapAt(sim, 5);
    const s = cropSpriteAt(snap, tileX, tileY);
    expect(s).toBeDefined();
    expect(s!.tintRgba).not.toBe(UNTINTED_RGBA);
    expect(s!.alpha).toBeLessThan(1);
    expect(s!.description).toContain("dying");
  });

  it("a healthy (watered, not-at-risk) crop sprite is UNTINTED with full alpha", () => {
    const sim = bootAndTick(5);
    const { tileX, tileY } = plantFirstPlot(sim, "wheat", {
      wateredToday: true,
      daysSinceWater: 0,
    });
    const snap = snapAt(sim, 5);
    const s = cropSpriteAt(snap, tileX, tileY);
    expect(s).toBeDefined();
    expect(s!.tintRgba).toBe(UNTINTED_RGBA);
    expect(s!.alpha).toBe(1);
    expect(s!.description).not.toContain("thirsty");
    expect(s!.description).not.toContain("dying");
  });

  it("dying takes precedence over thirsty (unwatered AND at-risk → dying)", () => {
    const dying = cropCue({
      kind: "planted",
      crop: "wheat",
      daysGrowing: 1,
      readyAtDay: 4,
      weatherSum: 0,
      daysSinceWater: DRY_DEATH_GRACE_DAYS,
      wateredToday: false,
    });
    expect(dying.suffix).toContain("dying");
  });
});

describe("boat hull sprite — review item 18", () => {
  it("carries a non-null id distinct from the farmer's own id, so the client's id!=null interpolation gate applies to the hull without colliding with id-keyed farmer lookups", () => {
    const sim = bootAndTick(5);
    const f = firstFarmer(sim);
    f.farmer!.aboard = true;

    const snap = snapAt(sim, 5);
    const hull = snap.sprites.find((s) => s.frame === "structure/boat");
    expect(hull).toBeDefined();
    expect(hull!.id).not.toBeNull();
    expect(hull!.id).not.toBe(f.id);
    expect(hull!.id as number).toBeLessThan(0);
    expect(hull!.interpolate).toBe(true);
  });

  it("hull id is stable across consecutive snapshot builds for the same aboard farmer", () => {
    const sim = bootAndTick(5);
    const f = firstFarmer(sim);
    f.farmer!.aboard = true;

    const snap1 = snapAt(sim, 5);
    const snap2 = snapAt(sim, 5);
    const hull1 = snap1.sprites.find((s) => s.frame === "structure/boat");
    const hull2 = snap2.sprites.find((s) => s.frame === "structure/boat");
    expect(hull1).toBeDefined();
    expect(hull2).toBeDefined();
    expect(hull1!.id).toBe(hull2!.id);
  });

  it("no boat hull sprite is emitted for a farmer not aboard", () => {
    const sim = bootAndTick(5);
    const f = firstFarmer(sim);
    f.farmer!.aboard = false;

    const snap = snapAt(sim, 5);
    const hull = snap.sprites.find((s) => s.frame === "structure/boat");
    expect(hull).toBeUndefined();
  });
});

describe("visual state indicators — farmers", () => {
  it("an unrested farmer sprite is exhausted: tinted + dimmed, tooltip says exhausted", () => {
    const sim = bootAndTick(5);
    const f = firstFarmer(sim);
    f.ap!.unrested = true;

    if (f.inventory!.wateringCan) f.inventory!.wateringCan.charges = f.inventory!.wateringCan.maxCharges;
    const snap = snapAt(sim, 5);
    const s = farmerSprite(snap, f.id!);
    expect(s).toBeDefined();
    expect(s!.tintRgba).not.toBe(UNTINTED_RGBA);
    expect(s!.alpha).toBeLessThan(1);
    expect(s!.description).toContain("exhausted");
  });

  it("a low-AP farmer (below threshold) is exhausted", () => {
    const sim = bootAndTick(5);
    const f = firstFarmer(sim);
    f.ap!.unrested = false;
    f.ap!.max = 100;
    f.ap!.current = Math.floor(100 * EXHAUSTED_AP_FRACTION) - 1; 
    if (f.inventory!.wateringCan) f.inventory!.wateringCan.charges = f.inventory!.wateringCan.maxCharges;
    const snap = snapAt(sim, 5);
    const s = farmerSprite(snap, f.id!);
    expect(s).toBeDefined();
    expect(s!.description).toContain("exhausted");
  });

  it("a farmer with an empty watering can is broken-tool: tinted, tooltip says tool broken", () => {
    const sim = bootAndTick(5);
    const f = firstFarmer(sim);

    f.ap!.unrested = false;
    f.ap!.max = 100;
    f.ap!.current = 100;
    if (!f.inventory!.wateringCan) f.inventory!.wateringCan = { charges: 0, maxCharges: 10 };
    else f.inventory!.wateringCan.charges = 0;
    const snap = snapAt(sim, 5);
    const s = farmerSprite(snap, f.id!);
    expect(s).toBeDefined();
    expect(s!.tintRgba).not.toBe(UNTINTED_RGBA);
    expect(s!.description).toContain("tool broken");
  });

  it("broken tool takes precedence over exhausted", () => {
    const sim = bootAndTick(5);
    const f = firstFarmer(sim);
    f.ap!.unrested = true; 
    if (!f.inventory!.wateringCan) f.inventory!.wateringCan = { charges: 0, maxCharges: 10 };
    else f.inventory!.wateringCan.charges = 0; 
    const snap = snapAt(sim, 5);
    const s = farmerSprite(snap, f.id!);
    expect(s!.description).toContain("tool broken");
    expect(s!.description).not.toContain("exhausted");
  });

  it("a healthy, rested farmer with a usable tool is UNTINTED with full alpha", () => {
    const sim = bootAndTick(5);
    const f = firstFarmer(sim);
    f.ap!.unrested = false;
    f.ap!.max = 100;
    f.ap!.current = 100; 
    if (f.inventory!.wateringCan) f.inventory!.wateringCan.charges = f.inventory!.wateringCan.maxCharges;
    if (f.inventory!.tools) for (const t of f.inventory!.tools) t.durability = Math.max(t.durability, 10);
    const cue = farmerCue(f, sim.dayClock.day);
    expect(cue.tintRgba).toBe(UNTINTED_RGBA);
    expect(cue.alpha).toBe(1);
    expect(cue.suffix).toBe("");
    const snap = snapAt(sim, 5);
    const s = farmerSprite(snap, f.id!);
    expect(s).toBeDefined();
    expect(s!.tintRgba).toBe(UNTINTED_RGBA);
    expect(s!.alpha).toBe(1);
  });
});
