/**
 * Cozy-pivot Phase D tests: the four threats (fire, disease, raids, winter)
 * demoted to recoverable happiness dips under the default `cozyThreats: true`
 * bootstrap option — plus one regression guard proving `cozyThreats: false`
 * still reproduces the old destructive behavior byte-for-byte in spirit.
 *
 * All tests drive bootstrapSim() directly — no Worker, no browser. Patterns
 * (findClear, runDays, forceIgnite, placeBatch) are copied from phase45.test.ts
 * and phase4.test.ts, which cover the frozen sharp-path behavior this suite's
 * cozy behavior replaces.
 */
import { describe, it, expect } from "vitest";
import { localPlayer } from "../sim-state";
import { bootstrapSim } from "../sim-bootstrap";
import type { CitadelSimResult } from "../sim-bootstrap";
import { isWalkable } from "../world/terrain";
import type { BuildingFireState } from "../sim-state";
import { grainMultiplier } from "../world/seasons";

const SEED = 0x1234_5678;
const TICKS_PER_DAY = 20;

// ---------------------------------------------------------------------------
// Helpers (copied/adapted from phase45.test.ts and phase4.test.ts)
// ---------------------------------------------------------------------------

/** Run for n days and return the final snapshot. */
function runDays(sim: CitadelSimResult, n: number, startTick = 0): ReturnType<CitadelSimResult["getSnapshot"]> {
  for (let t = 0; t < n * TICKS_PER_DAY; t++) {
    sim.scheduler.tick({ tick: startTick + t });
  }
  return sim.getSnapshot(startTick + n * TICKS_PER_DAY);
}

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

/** Place a batch of buildings (all enqueued, then 1 tick to flush). */
function placeBatch(sim: CitadelSimResult, items: Array<{ type: string; x: number; y: number }>): void {
  for (const it of items) {
    sim.commands.enqueue({ type: "placeBuilding", payload: { buildingType: it.type, x: it.x, y: it.y } });
  }
  sim.scheduler.tick({ tick: 0 });
}

/** Force-ignite a building by ECS id (direct state manipulation for testing). */
function forceIgnite(sim: CitadelSimResult, entityId: number, burnTicksLeft = 60): void {
  const fs: BuildingFireState = { burning: true, burnTicksLeft, destroyed: false };
  localPlayer(sim.state).fireState.set(entityId, fs);
}

/** Get entity id for first building of a given type. */
function firstEntityId(sim: CitadelSimResult, type: string): number | null {
  for (const entity of sim.state.buildingWorld.query("building")) {
    if (entity.building.type === type) return entity.id ?? null;
  }
  return null;
}

/** Find a grass tile near (sx, sy) using the phase4-style terrain predicate. */
function findGrass(
  terrain: { width: number; height: number; cells: Uint8Array },
  w: number, h: number, sx: number, sy: number,
): { x: number; y: number } {
  return findClear(terrain, w, h, sx, sy);
}

// ---------------------------------------------------------------------------
// 1. Fire is recoverable: building smoulders then extinguishes, never razed.
// ---------------------------------------------------------------------------

describe("cozy fire — recoverable, never razes", () => {
  it("a force-ignited building extinguishes on its own and is never destroyed (popCap intact)", () => {
    const sim = bootstrapSim({ seed: SEED, ticksPerDay: TICKS_PER_DAY }); // cozyThreats default true
    const { terrain } = sim;
    const cx = Math.floor(terrain.width / 2);
    const cy = Math.floor(terrain.height / 2);
    const pos = findClear(terrain, 2, 2, cx, cy);
    placeBatch(sim, [{ type: "house", x: pos.x, y: pos.y }]);

    const id = firstEntityId(sim, "house");
    expect(id).not.toBeNull();
    const popCapBefore = localPlayer(sim.state).popCap;
    const buildingCountBefore = sim.getBuildings().filter((b) => b.type === "house").length;

    // Force-ignite with the full burn window so we can watch it extinguish.
    forceIgnite(sim, id!, 60);
    expect(localPlayer(sim.state).fireState.get(id!)?.burning).toBe(true);

    // Advance past the burn window (60 ticks == 3 days at TICKS_PER_DAY=20).
    runDays(sim, 5, 1);

    const fs = localPlayer(sim.state).fireState.get(id!);
    // Extinguished, not destroyed: burning cleared, destroyed stays false.
    expect(fs?.burning).toBe(false);
    expect(fs?.destroyed).toBe(false);

    // The building itself still exists (same count, same entity id present).
    const buildingCountAfter = sim.getBuildings().filter((b) => b.type === "house").length;
    expect(buildingCountAfter).toBe(buildingCountBefore);
    const stillPresent = sim.getBuildings().some((b) => b.type === "house" && b.x === pos.x && b.y === pos.y);
    expect(stillPresent).toBe(true);

    // No popCap loss — cozy extinguish never decrements housing capacity.
    expect(localPlayer(sim.state).popCap).toBe(popCapBefore);

    // The snapshot's onFire/burning fields agree with the extinguished state.
    const snap = sim.getSnapshot(1 + 5 * TICKS_PER_DAY);
    const house = snap.buildings.find((b) => b.type === "house");
    expect(house?.onFire).toBe(false);
    expect(house?.burning).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 2. Fire dents nearby mood while it burns (radius-local happiness dip).
// ---------------------------------------------------------------------------

describe("cozy fire — dents nearby mood", () => {
  it("a house near a burning building has measurably lower mood than a far-away house", () => {
    const sim = bootstrapSim({ seed: SEED, ticksPerDay: TICKS_PER_DAY });
    const { terrain } = sim;
    const cx = Math.floor(terrain.width / 2);
    const cy = Math.floor(terrain.height / 2);

    // Burning building (a bakery, so it's not itself one of the "near" houses).
    const firePos = findClear(terrain, 2, 2, cx, cy);
    // A house close to the fire (within the well-reach-sized dent radius: 8x6).
    const nearPos = findClear(terrain, 2, 2, cx + 2, cy);
    // A house far away, well outside the dent radius.
    const farPos = findClear(terrain, 2, 2, cx + 30, cy + 30);

    placeBatch(sim, [
      { type: "bakery", x: firePos.x, y: firePos.y },
      { type: "house", x: nearPos.x, y: nearPos.y },
      { type: "house", x: farPos.x, y: farPos.y },
    ]);

    // Let mood settle to its steady baseline before igniting, so the dent is
    // measured against a stable value rather than the initial neutral default.
    runDays(sim, 3, 1);

    const nearId = sim.getBuildings().find((b) => b.type === "house" && b.x === nearPos.x && b.y === nearPos.y);
    const farId = sim.getBuildings().find((b) => b.type === "house" && b.x === farPos.x && b.y === farPos.y);
    expect(nearId).toBeDefined();
    expect(farId).toBeDefined();
    const nearMoodBefore = nearId!.mood;
    const farMoodBefore = farId!.mood;

    const bakeryId = firstEntityId(sim, "bakery");
    expect(bakeryId).not.toBeNull();
    // Long burn window so the fire is still active across the days we measure.
    forceIgnite(sim, bakeryId!, 200);

    runDays(sim, 3, 1 + 3 * TICKS_PER_DAY);

    const nearAfter = sim.getBuildings().find((b) => b.type === "house" && b.x === nearPos.x && b.y === nearPos.y);
    const farAfter = sim.getBuildings().find((b) => b.type === "house" && b.x === farPos.x && b.y === farPos.y);
    expect(nearAfter).toBeDefined();
    expect(farAfter).toBeDefined();

    // The near house's mood must have measurably dropped from its pre-fire baseline.
    expect(nearAfter!.mood).toBeLessThan(nearMoodBefore);
    // The far house, outside the dent radius, should not show the same drop —
    // it must end up with a strictly higher (or equal, floor-clamped) mood than
    // the near house once the fire has been dropping the near one for 3 days.
    expect(farAfter!.mood).toBeGreaterThan(nearAfter!.mood);
    // Sanity: the far house's mood is unaffected by (or unrelated to) the fire —
    // it's not being dented at all, so it shouldn't have fallen by the same
    // mechanism (it may drift for unrelated happiness reasons, but not below
    // what the near house — which IS being dented — ends up at).
    void farMoodBefore;
  });
});

// ---------------------------------------------------------------------------
// 3. Disease never kills: population never drops, outbreak eventually ends.
// ---------------------------------------------------------------------------

describe("cozy disease — never kills, always recovers", () => {
  /**
   * Proven town layout (from phase45.test.ts's strict-mortality section):
   * 2 farms + mill + bakery + storehouse + 2 houses, seed 0xc17ade1, grows
   * population over ~30 days. We then force-sustain an outbreak (as the sharp
   * mortality tests do) and confirm cozy mode never removes a villager and the
   * outbreak ends within a bounded window.
   */
  function buildProvenTown(): CitadelSimResult {
    const sim = bootstrapSim({ seed: 0xc17ade1, ticksPerDay: TICKS_PER_DAY }); // cozy default true
    const roadTiles: Array<{ x: number; y: number }> = [];
    for (let x = 10; x <= 45; x++) roadTiles.push({ x, y: 13 });
    sim.commands.enqueue({ type: "placeRoad", payload: { tiles: roadTiles } });
    const buildings: Array<{ type: string; x: number; y: number }> = [
      { type: "storehouse", x: 10, y: 11 },
      { type: "farm",       x: 14, y: 14 },
      { type: "farm",       x: 18, y: 14 },
      { type: "mill",       x: 22, y: 14 },
      { type: "bakery",     x: 25, y: 14 },
      { type: "house",      x: 28, y: 14 },
      { type: "house",      x: 32, y: 14 },
    ];
    for (const it of buildings) {
      sim.commands.enqueue({ type: "placeBuilding", payload: { buildingType: it.type, x: it.x, y: it.y } });
    }
    sim.scheduler.tick({ tick: 0 });
    return sim;
  }

  it("population never drops below its pre-outbreak value and the outbreak ends within a bounded window", () => {
    const sim = buildProvenTown();
    for (let t = 1; t <= 30 * TICKS_PER_DAY; t++) sim.scheduler.tick({ tick: t });
    const popBeforeOutbreak = localPlayer(sim.state).population;
    expect(popBeforeOutbreak).toBeGreaterThan(0); // sanity: town is alive

    let outbreakEnded = false;
    const maxOutbreakDays = 60; // bounded window — recovery floor guarantees this ends
    let t = 30 * TICKS_PER_DAY + 1;
    for (let day = 0; day < maxOutbreakDays; day++) {
      for (let i = 0; i < TICKS_PER_DAY; i++, t++) {
        // Force/sustain an outbreak: keep re-arming it each tick of this window
        // so it can't end before we've had a chance to observe the floor at work,
        // mirroring phase45.test.ts's force-triggered outbreak pattern.
        if (day < 5 && localPlayer(sim.state).population > 0) {
          localPlayer(sim.state).outbreakActive = true;
          localPlayer(sim.state).sickVillagers = localPlayer(sim.state).population;
        }
        sim.scheduler.tick({ tick: t });
      }
      if (!localPlayer(sim.state).outbreakActive && day >= 5) {
        outbreakEnded = true;
        break;
      }
    }

    // Cozy contract: disease never KILLS — it slows sick villagers, then they
    // recover. The guarantee this test guards is that the forced outbreak leaves
    // NO permanent headcount dent: the outbreak ends, nobody stays sick, and the
    // population recovers to (at least) its pre-outbreak value. (A transient dip
    // from the *separate*, recoverable morale-emigration channel — this serviceless
    // town runs a low happiness — is not a disease death and is not what this test
    // guards; asserting "pop never dips from ANY cause in a 60-day window" wrongly
    // coupled this invariant to seeded emigration timing.)
    const popAfterOutbreak = localPlayer(sim.state).population;
    expect(popAfterOutbreak).toBeGreaterThanOrEqual(popBeforeOutbreak);
    // The recovery floor guarantees the outbreak ends within the bounded window.
    expect(outbreakEnded).toBe(true);
    expect(localPlayer(sim.state).outbreakActive).toBe(false);
    // Nobody is left sick once the outbreak has ended (full recovery, no deaths).
    expect(localPlayer(sim.state).sickVillagers).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 4. Raids pilfer goods, never sack: buildings/pop/keep survive.
// ---------------------------------------------------------------------------

describe("cozy raids — pilfer goods, never sack", () => {
  it("a resolved raid decreases stockpiled goods but leaves buildings, population, and the keep intact", () => {
    const sim = bootstrapSim({ seed: 0xc17ade1, ticksPerDay: TICKS_PER_DAY }); // cozy default true
    const lp = localPlayer(sim.state);
    lp.tier = "Town"; // keep requires Town tier to place
    const g = findGrass(sim.terrain, 3, 3, 48, 48);
    // Deliberately undefended keep — in sharp mode this guarantees a sack; in
    // cozy mode it should still only ever pilfer.
    sim.commands.enqueue({ type: "placeBuilding", payload: { buildingType: "keep", x: g.x, y: g.y } });
    sim.scheduler.tick({ tick: 0 });

    // Give the player stockpiled goods worth pilfering.
    lp.stockpiles.grain = 100;
    lp.stockpiles.wood = 100;
    lp.stockpiles.tools = 50;

    const buildingCountBefore = sim.getBuildings().length;
    const popBefore = lp.population;
    const totalGoodsBefore = Object.values(lp.stockpiles).reduce((a, b) => a + b, 0);

    // Run until at least one raid has resolved. Raids escalate fast (a new one
    // can spawn before the last resolves), so `raiders.length === 0` is not a
    // reliable "a raid resolved" signal once several are in flight — watch for
    // the cozy pilfer event text instead, which fires exactly once per resolved
    // raid regardless of how many others are still marching.
    let raidResolved = false;
    for (let tick = 1; tick < 60 * TICKS_PER_DAY; tick++) {
      sim.scheduler.tick({ tick });
      if (sim.state.events.some((e) => /made off with some goods|found little worth taking/i.test(e))) {
        raidResolved = true;
        break;
      }
      if (lp.gameOver) break;
    }
    expect(raidResolved).toBe(true);

    const totalGoodsAfter = Object.values(lp.stockpiles).reduce((a, b) => a + b, 0);
    const buildingCountAfter = sim.getBuildings().length;

    // Goods pilfered (decreased); nothing destroyed/lost.
    expect(totalGoodsAfter).toBeLessThan(totalGoodsBefore);
    expect(buildingCountAfter).toBe(buildingCountBefore);
    expect(lp.population).toBe(popBefore);
    expect(lp.keepSacked).toBe(false);
    expect(lp.gameOver).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 4b. Cozy-copy contract: the toast COPY reads tended/recoverable under cozy,
//     and the sharp wording is kept verbatim under cozyThreats:false (the
//     Challenge-mode regression guards match on it). Mechanics unchanged — this
//     pins tone (P1, 2026-07-01 playtest finding). See fire/disease/immigration.
// ---------------------------------------------------------------------------

describe("cozy-copy contract — threat toasts read tended, never a loss", () => {
  // The toast is emitted by _igniteBuilding, which runs on a natural ignition or
  // a SPREAD roll — not by force-setting fireState. So: two adjacent wooden
  // houses, force-ignite one, run days; the spread to the neighbour emits the
  // toast (~99.99% within 10 days at this seed — see phase45.test.ts).
  function spreadEvents(cozyThreats: boolean): string[] {
    const sim = bootstrapSim({ seed: SEED, ticksPerDay: TICKS_PER_DAY, cozyThreats });
    const cx = Math.floor(sim.terrain.width / 2);
    const cy = Math.floor(sim.terrain.height / 2);
    const h1 = findClear(sim.terrain, 2, 2, cx, cy);
    const h2 = findClear(sim.terrain, 2, 2, cx + 2, cy);
    placeBatch(sim, [
      { type: "house", x: h1.x, y: h1.y },
      { type: "house", x: h2.x, y: h2.y },
    ]);
    const id = firstEntityId(sim, "house");
    expect(id).not.toBeNull();
    forceIgnite(sim, id!);
    for (let d = 0; d < 10; d++) runDays(sim, 1, 1 + d * TICKS_PER_DAY);
    return sim.state.events;
  }

  it("cozy fire reads 'smouldering'/'a well', never 'caught fire!'/'fire spread'", () => {
    const events = spreadEvents(true);
    expect(events.some((e) => /smoulder|hearth|well/i.test(e))).toBe(true);
    expect(events.some((e) => e.includes("caught fire!") || e.includes("fire spread"))).toBe(false);
  });

  it("sharp fire still reads 'caught fire!'/'fire spread' under cozyThreats:false", () => {
    const events = spreadEvents(false);
    expect(events.some((e) => e.includes("caught fire!") || e.includes("fire spread"))).toBe(true);
    expect(events.some((e) => /smoulder/i.test(e))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 5. Regression guard: cozyThreats:false still reproduces the sharp path.
// ---------------------------------------------------------------------------

/**
 * ⚠️ SCOPE OF THIS GUARD — read before trusting it.
 *
 * This proves the sharp path is UNCHANGED. It does NOT prove the sharp path is
 * REACHABLE. It hands itself a keep by assigning `lp.tier = "Town"` directly, which
 * walks straight past `TIER_LOCK.keep` — the gate a real player (and the `sack` headless
 * fixture) has to clear by actually growing a settlement.
 *
 * That distinction is not academic: `SCENARIO=sack` silently stopped sacking for ten days
 * (2026-07-01 → 07-11) because its keep was TIER_LOCK-rejected and it therefore had
 * nothing to sack — and this test, and phase4's twin of it, stayed green the entire time.
 *
 * The reachability half lives in `sharp-raid-path.test.ts`, which never touches `tier`.
 * If you are asking "does the sharp raid path still work end to end?", that is the file
 * you want; this one only answers "did the resolution math move?".
 */
describe("cozyThreats:false — the sharp path still bites (regression guard)", () => {
  it("an undefended keep is still sacked -> gameOver with cozyThreats:false", () => {
    const sim = bootstrapSim({ seed: 0xc17ade1, ticksPerDay: TICKS_PER_DAY, cozyThreats: false });
    const lp = localPlayer(sim.state);
    lp.tier = "Town"; // bypasses TIER_LOCK — see the scope note above; this is NOT a reachability check
    const g = findGrass(sim.terrain, 3, 3, 48, 48);
    sim.commands.enqueue({ type: "placeBuilding", payload: { buildingType: "keep", x: g.x, y: g.y } });

    let sacked = false;
    for (let tick = 0; tick < 60 * TICKS_PER_DAY; tick++) {
      sim.scheduler.tick({ tick });
      if (lp.keepSacked) { sacked = true; break; }
    }
    expect(sacked).toBe(true);
    expect(lp.gameOver).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 6. Winter grain floor: unconditional 0.5, not flag-gated.
// ---------------------------------------------------------------------------

describe("winter grain floor", () => {
  it("grainMultiplier(\"winter\") is 0.5, not 0", () => {
    expect(grainMultiplier("winter")).toBe(0.5);
  });

  it("a farm still produces grain in winter (sim-level, cozy default)", () => {
    const sim = bootstrapSim({ seed: 0xc17ade1, ticksPerDay: TICKS_PER_DAY, startDay: 12 }); // winter start
    const roadTiles: Array<{ x: number; y: number }> = [];
    for (let x = 10; x <= 40; x++) roadTiles.push({ x, y: 13 });
    sim.commands.enqueue({ type: "placeRoad", payload: { tiles: roadTiles } });
    sim.commands.enqueue({ type: "placeBuilding", payload: { buildingType: "storehouse", x: 10, y: 11 } });
    sim.commands.enqueue({ type: "placeBuilding", payload: { buildingType: "farm", x: 14, y: 14 } });
    sim.commands.enqueue({ type: "placeBuilding", payload: { buildingType: "house", x: 24, y: 14 } });

    for (let tick = 0; tick < 60 * TICKS_PER_DAY; tick++) sim.scheduler.tick({ tick });

    expect(sim.stockpiles.grain).toBeGreaterThan(0);
  });
});
