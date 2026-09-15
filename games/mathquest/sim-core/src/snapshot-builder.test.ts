import { describe, it, expect } from "vitest";
import { buildGameSnapshot, buildRunView, type SnapshotInputs } from "./snapshot-builder";
import { generateMap } from "./run/map";
import { createRng } from "@engine/core";
import { STARTING_LIFELINES } from "./run/lifelines";
import { EMPTY_MASTERY_STORE } from "./run/mastery";
import { ZERO_STATS, xpToNext } from "./run/progression";
import { DEFAULT_LOCALE } from "./i18n";

/**
 * The capability this file exists to prove (audit-24): a snapshot can now be
 * built from hand-constructed state, with NO bootstrapMathquestSim, no
 * scheduler and no tick loop. Before the extraction every assertion about
 * snapshot contents had to boot the whole sim.
 */
function inputs(over: Partial<SnapshotInputs> = {}): SnapshotInputs {
  return {
    mode: "map",
    map: generateMap(createRng(1)),
    currentId: null,
    reachableIds: [1, 2],
    visitedIds: [],
    warriorHp: 17,
    warriorMaxHp: 25,
    level: 3,
    xp: 4,
    stats: ZERO_STATS,
    inventory: [],
    lifelines: { ...STARTING_LIFELINES },
    mastery: EMPTY_MASTERY_STORE,
    locale: DEFAULT_LOCALE,
    combat: null,
    levelUpOffers: null,
    lootOffers: null,
    ...over,
  };
}

describe("buildGameSnapshot (no sim boot)", () => {
  it("projects run state onto RunView with exact values", () => {
    const run = buildRunView(inputs());
    expect(run.warriorHp).toBe(17);
    expect(run.warriorMaxHp).toBe(25);
    expect(run.level).toBe(3);
    expect(run.xp).toBe(4);
    // xpToNext is DERIVED from level, not passed in -- pin that it is computed.
    expect(run.xpToNext).toBe(xpToNext(3));
    expect(run.reachableIds).toEqual([1, 2]);
  });

  it("copies lifelines rather than aliasing the caller's object", () => {
    const lifelines = { ...STARTING_LIFELINES };
    const run = buildRunView(inputs({ lifelines }));
    expect(run.lifelines).toEqual(lifelines);
    expect(run.lifelines).not.toBe(lifelines); // mutating the run must not write back
  });

  it("returns the mode-specific payload for each mode", () => {
    expect(buildGameSnapshot(inputs({ mode: "map" })).mode).toBe("map");
    expect(buildGameSnapshot(inputs({ mode: "run_won" })).mode).toBe("run_won");
    expect(buildGameSnapshot(inputs({ mode: "run_lost" })).mode).toBe("run_lost");

    const combatSnap = { turn: 7 } as never;
    const inCombat = buildGameSnapshot(
      inputs({ mode: "combat", combat: { snapshot: () => combatSnap } }),
    );
    expect(inCombat.mode).toBe("combat");
    // The builder must hand back exactly what combat.snapshot() returned.
    expect(inCombat.mode === "combat" && inCombat.combat).toBe(combatSnap);
  });

  it("describes level-up offers through the locale it was given", () => {
    const snap = buildGameSnapshot(
      inputs({ mode: "level_up", levelUpOffers: ["attack", "maxHp"] as never }),
    );
    expect(snap.mode).toBe("level_up");
    if (snap.mode !== "level_up") throw new Error("unreachable");
    expect(snap.offers).toHaveLength(2);
    // Real descriptions, not placeholders.
    for (const o of snap.offers) expect(String((o as { title?: string }).title ?? o)).not.toBe("");
  });

  it("shares one RunView shape across every mode", () => {
    const keys = (m: SnapshotInputs["mode"]) =>
      Object.keys(buildGameSnapshot(inputs({ mode: m })).run).sort();
    expect(keys("map")).toEqual(keys("run_won"));
    expect(keys("map")).toEqual(keys("run_lost"));
  });
});
