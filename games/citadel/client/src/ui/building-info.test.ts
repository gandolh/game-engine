/**
 * Tests for building-info.ts — the pure data module for the "inspect a building" panel.
 *
 * Arithmetic is derived from the real PRODUCTION_DEFS so these tests stay correct
 * even if the defs change (they'll catch the drift).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";
import { PRODUCTION_DEFS, SERVICE_RADII, SERVICE_RECTS } from "@citadel/sim-core";
import {
  BUILDING_DESCRIPTIONS,
  TICKS_PER_DAY,
  getProductionDetails,
  productionRatePerDay,
  isServiceBuilding,
  getServiceRadius,
  getServiceRect,
  getGoodsFlow,
} from "./building-info";

// ---------------------------------------------------------------------------
// TICKS_PER_DAY must stay in lock-step with main/constants.ts (FIX 5b)
// ---------------------------------------------------------------------------

describe("TICKS_PER_DAY — desync guard against main/constants.ts", () => {
  it("equals the `const TICKS_PER_DAY` literal in main/constants.ts", () => {
    // building-info.ts hand-copies TICKS_PER_DAY (it can't import the main/ entry chain — that's
    // the browser entry point with side effects). Read main/constants.ts as text and assert the
    // literal matches, so a future change to one can't silently desync the rate math. Vitest runs
    // with cwd at the @citadel/client workspace root.
    //
    // Brief 114: TICKS_PER_DAY moved out of the (now-thin) src/main.ts into src/main/constants.ts
    // as part of the main.ts module-directory split — this guard follows it there.
    const constantsPath = resolve(process.cwd(), "src/main/constants.ts");
    const src = readFileSync(constantsPath, "utf8");
    const m = src.match(/const\s+TICKS_PER_DAY\s*=\s*(\d+)\s*;/);
    expect(m, "could not find `const TICKS_PER_DAY = N;` in main/constants.ts").not.toBeNull();
    expect(Number(m![1])).toBe(TICKS_PER_DAY);
  });
});

// ---------------------------------------------------------------------------
// Coverage: every building type in PRODUCTION_DEFS must have a description
// ---------------------------------------------------------------------------

describe("BUILDING_DESCRIPTIONS — coverage", () => {
  it("has a description for every building type in PRODUCTION_DEFS", () => {
    const missing: string[] = [];
    for (const type of Object.keys(PRODUCTION_DEFS)) {
      if (!(type in BUILDING_DESCRIPTIONS)) missing.push(type);
    }
    expect(missing).toEqual([]);
  });

  it("has no extra types that don't exist in PRODUCTION_DEFS (guard against typos)", () => {
    const extra: string[] = [];
    for (const type of Object.keys(BUILDING_DESCRIPTIONS)) {
      if (!(type in PRODUCTION_DEFS)) extra.push(type);
    }
    expect(extra).toEqual([]);
  });

  it("every description is a non-empty string", () => {
    for (const [type, desc] of Object.entries(BUILDING_DESCRIPTIONS)) {
      expect(typeof desc, `description for ${type}`).toBe("string");
      expect(desc.length, `description for ${type}`).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// Disease counterplay legibility (brief 102): the well and healer copy must
// name the sickness effect the parallel sim chunk lands (well coverage
// fraction multiplies disease onset down to ×0.5; healer: onset ×0.25, spread
// slowed, faster recovery), phrased diegetic-cozy rather than as raw numbers.
// ---------------------------------------------------------------------------

describe("BUILDING_DESCRIPTIONS — disease counterplay copy", () => {
  it("well's description mentions covered homes getting sick less often", () => {
    expect(BUILDING_DESCRIPTIONS["well"]).toContain("Covered homes also fall sick less often");
  });

  it("well's description keeps its existing fire-ignition copy", () => {
    expect(BUILDING_DESCRIPTIONS["well"]).toContain("Reduces fire ignition in a nearby rectangle");
  });

  it("healer's description mentions fewer outbreaks and faster recovery", () => {
    expect(BUILDING_DESCRIPTIONS["healer"]).toContain("fewer outbreaks");
    expect(BUILDING_DESCRIPTIONS["healer"]).toContain("recover sooner");
  });
});

// ---------------------------------------------------------------------------
// productionRatePerDay — arithmetic derived from PRODUCTION_DEFS
// ---------------------------------------------------------------------------

describe("productionRatePerDay — bakery", () => {
  // bakery: outputPerCycle=3, ticksPerCycle=10 → cyclesPerDay=2, outputPerDay=6
  // inputPerCycle=1, inputPerDay=2; level=1 (no multiplier)
  it("returns correct rate at level 1", () => {
    const def = PRODUCTION_DEFS["bakery"]!;
    const cyclesPerDay = TICKS_PER_DAY / def.ticksPerCycle;
    const expectedOut = def.outputPerCycle * cyclesPerDay;
    const expectedIn = def.inputPerCycle * cyclesPerDay;
    const result = productionRatePerDay("bakery", 1);
    expect(result).toBe(`${expectedIn} ${def.inputGood} → ${expectedOut} ${def.outputGood}/day`);
  });

  it("scales output correctly at level 2 (×1.5, floored per cycle); input unchanged", () => {
    const def = PRODUCTION_DEFS["bakery"]!;
    const cyclesPerDay = TICKS_PER_DAY / def.ticksPerCycle;
    // L2 multiplier = 1.5; floor(3 * 1.5) = 4 per cycle
    const outputPerCycle = Math.floor(def.outputPerCycle * 1.5);
    const expectedOut = outputPerCycle * cyclesPerDay;
    // Input does NOT scale with level (FIX 3): raw inputPerCycle × cyclesPerDay.
    const expectedIn = def.inputPerCycle * cyclesPerDay;
    const result = productionRatePerDay("bakery", 2);
    expect(result).toBe(`${expectedIn} ${def.inputGood} → ${expectedOut} ${def.outputGood}/day`);
  });

  it("scales output correctly at level 3 (×2); input unchanged", () => {
    const def = PRODUCTION_DEFS["bakery"]!;
    const cyclesPerDay = TICKS_PER_DAY / def.ticksPerCycle;
    const outputPerCycle = Math.floor(def.outputPerCycle * 2);
    const expectedOut = outputPerCycle * cyclesPerDay;
    // Input does NOT scale with level (FIX 3): raw inputPerCycle × cyclesPerDay.
    const expectedIn = def.inputPerCycle * cyclesPerDay;
    const result = productionRatePerDay("bakery", 3);
    expect(result).toBe(`${expectedIn} ${def.inputGood} → ${expectedOut} ${def.outputGood}/day`);
  });
});

describe("productionRatePerDay — input/day is constant across levels (FIX 3)", () => {
  // The sim (production.ts) draws raw def.inputPerCycle from the stockpile each cycle with NO
  // level multiplier — only OUTPUT scales. So a converter's input/day must stay constant across
  // levels while output/day grows. Earlier the panel multiplied the input by the level too,
  // overstating it (e.g. a L3 bakery claiming it eats 4 flour/day when the sim eats 2).
  for (const type of ["mill", "bakery", "sawmill", "smith"] as const) {
    it(`${type}: input/day is the same at L1/L2/L3 while output/day scales`, () => {
      const def = PRODUCTION_DEFS[type]!;
      const cyclesPerDay = TICKS_PER_DAY / def.ticksPerCycle;
      const expectedInputPerDay = def.inputPerCycle * cyclesPerDay; // NO level multiplier

      const d1 = getProductionDetails(type, 1)!;
      const d2 = getProductionDetails(type, 2)!;
      const d3 = getProductionDetails(type, 3)!;

      // Input is flat across levels and matches the raw per-cycle draw.
      expect(d1.inputPerDay).toBe(expectedInputPerDay);
      expect(d2.inputPerDay).toBe(expectedInputPerDay);
      expect(d3.inputPerDay).toBe(expectedInputPerDay);

      // Output still scales up with level (L3 > L1).
      expect(d3.outputPerDay).toBeGreaterThan(d1.outputPerDay);
    });
  }
});

describe("productionRatePerDay — mill", () => {
  it("returns correct rate at level 1", () => {
    const def = PRODUCTION_DEFS["mill"]!;
    const cyclesPerDay = TICKS_PER_DAY / def.ticksPerCycle;
    const expectedOut = def.outputPerCycle * cyclesPerDay;
    const expectedIn = def.inputPerCycle * cyclesPerDay;
    const result = productionRatePerDay("mill", 1);
    expect(result).toBe(`${expectedIn} ${def.inputGood} → ${expectedOut} ${def.outputGood}/day`);
  });
});

describe("productionRatePerDay — sawmill", () => {
  it("returns correct rate at level 1", () => {
    const def = PRODUCTION_DEFS["sawmill"]!;
    const cyclesPerDay = TICKS_PER_DAY / def.ticksPerCycle;
    const expectedOut = def.outputPerCycle * cyclesPerDay;
    const expectedIn = def.inputPerCycle * cyclesPerDay;
    const result = productionRatePerDay("sawmill", 1);
    expect(result).toBe(`${expectedIn} ${def.inputGood} → ${expectedOut} ${def.outputGood}/day`);
  });
});

describe("productionRatePerDay — farm (seasonal grain multiplier)", () => {
  // farm: outputPerCycle=3, ticksPerCycle=10 → cyclesPerDay=2
  // summer: grainMult=1.0 → floor(3×1.0)=3 × 2 = 6 grain/day
  // spring: grainMult=0.5 → floor(3×0.5)=1 × 2 = 2 grain/day
  // autumn: grainMult=1.2 → floor(3×1.2)=3 × 2 = 6 grain/day
  // winter: grainMult=0.5 → floor(3×0.5)=1 × 2 = 2 grain/day (cozy pivot: winter floors food, never zero)
  it("produces 6 grain/day in summer at level 1", () => {
    const def = PRODUCTION_DEFS["farm"]!;
    const cyclesPerDay = TICKS_PER_DAY / def.ticksPerCycle;
    const expected = Math.floor(def.outputPerCycle * 1.0) * cyclesPerDay;
    const result = productionRatePerDay("farm", 1, "summer");
    expect(result).toBe(`${expected} grain/day`);
  });

  it("produces correct grain/day in spring at level 1 (floor of ×0.5)", () => {
    const def = PRODUCTION_DEFS["farm"]!;
    const cyclesPerDay = TICKS_PER_DAY / def.ticksPerCycle;
    const expected = Math.floor(def.outputPerCycle * 0.5) * cyclesPerDay;
    const result = productionRatePerDay("farm", 1, "spring");
    expect(result).toBe(`${expected} grain/day`);
  });

  it("produces correct grain/day in autumn at level 1 (floor of ×1.2)", () => {
    const def = PRODUCTION_DEFS["farm"]!;
    const cyclesPerDay = TICKS_PER_DAY / def.ticksPerCycle;
    const expected = Math.floor(def.outputPerCycle * 1.2) * cyclesPerDay;
    const result = productionRatePerDay("farm", 1, "autumn");
    expect(result).toBe(`${expected} grain/day`);
  });

  it("produces reduced grain/day in winter (floored ×0.5) and appends '(winter)' suffix", () => {
    const def = PRODUCTION_DEFS["farm"]!;
    const cyclesPerDay = TICKS_PER_DAY / def.ticksPerCycle;
    const expected = Math.floor(def.outputPerCycle * 0.5) * cyclesPerDay;
    const result = productionRatePerDay("farm", 1, "winter");
    expect(result).toBe(`${expected} grain/day (winter)`);
  });

  it("scales with level in summer: level 3 doubles output", () => {
    const def = PRODUCTION_DEFS["farm"]!;
    const cyclesPerDay = TICKS_PER_DAY / def.ticksPerCycle;
    // L3 multiplier = 2 → effectiveOutputPerCycle = floor(3*2)=6; then seasonal: floor(6*1.0)=6
    const effectiveCycleOutput = Math.floor(def.outputPerCycle * 2);
    const expected = Math.floor(effectiveCycleOutput * 1.0) * cyclesPerDay;
    const result = productionRatePerDay("farm", 3, "summer");
    expect(result).toBe(`${expected} grain/day`);
  });
});

describe("productionRatePerDay — services return undefined", () => {
  it("returns undefined for chapel", () => {
    expect(productionRatePerDay("chapel", 1)).toBeUndefined();
  });

  it("returns undefined for market", () => {
    expect(productionRatePerDay("market", 1)).toBeUndefined();
  });

  it("returns undefined for watchpost", () => {
    expect(productionRatePerDay("watchpost", 1)).toBeUndefined();
  });

  it("returns undefined for well", () => {
    expect(productionRatePerDay("well", 1)).toBeUndefined();
  });

  it("returns undefined for healer", () => {
    expect(productionRatePerDay("healer", 1)).toBeUndefined();
  });

  it("returns undefined for house (housing, no goods)", () => {
    expect(productionRatePerDay("house", 1)).toBeUndefined();
  });

  it("returns undefined for storehouse (storage, no goods)", () => {
    expect(productionRatePerDay("storehouse", 1)).toBeUndefined();
  });

  it("returns undefined for road", () => {
    expect(productionRatePerDay("road", 1)).toBeUndefined();
  });

  it("returns undefined for wall", () => {
    expect(productionRatePerDay("wall", 1)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// getProductionDetails — structured output
// ---------------------------------------------------------------------------

describe("getProductionDetails", () => {
  it("returns correct structure for bakery at level 1", () => {
    const def = PRODUCTION_DEFS["bakery"]!;
    const cyclesPerDay = TICKS_PER_DAY / def.ticksPerCycle;
    const details = getProductionDetails("bakery", 1);
    expect(details).toBeDefined();
    expect(details!.inputGood).toBe(def.inputGood);
    expect(details!.outputGood).toBe(def.outputGood);
    expect(details!.cyclesPerDay).toBe(cyclesPerDay);
    expect(details!.outputPerDay).toBe(def.outputPerCycle * cyclesPerDay);
    expect(details!.inputPerDay).toBe(def.inputPerCycle * cyclesPerDay);
    expect(details!.level).toBe(1);
  });

  it("returns undefined for a service building (no output good)", () => {
    expect(getProductionDetails("chapel", 1)).toBeUndefined();
  });

  it("returns undefined for an unknown type", () => {
    expect(getProductionDetails("nonexistent", 1)).toBeUndefined();
  });

  it("passes season through for farm", () => {
    const details = getProductionDetails("farm", 1, "summer");
    expect(details!.season).toBe("summer");
  });
});

// ---------------------------------------------------------------------------
// isServiceBuilding / getServiceRadius / getServiceRect
// ---------------------------------------------------------------------------

describe("isServiceBuilding", () => {
  it("returns true for all types in SERVICE_RADII", () => {
    for (const type of Object.keys(SERVICE_RADII)) {
      expect(isServiceBuilding(type), `${type} should be a service`).toBe(true);
    }
  });

  it("returns true for all types in SERVICE_RECTS", () => {
    for (const type of Object.keys(SERVICE_RECTS)) {
      expect(isServiceBuilding(type), `${type} should be a service (rect)`).toBe(true);
    }
  });

  it("returns false for production buildings", () => {
    expect(isServiceBuilding("bakery")).toBe(false);
    expect(isServiceBuilding("farm")).toBe(false);
    expect(isServiceBuilding("mill")).toBe(false);
  });

  it("returns false for infrastructure", () => {
    expect(isServiceBuilding("road")).toBe(false);
    expect(isServiceBuilding("wall")).toBe(false);
    expect(isServiceBuilding("house")).toBe(false);
  });
});

describe("getServiceRadius", () => {
  it("returns the radius from SERVICE_RADII for a radius-based service", () => {
    for (const [type, radius] of Object.entries(SERVICE_RADII)) {
      expect(getServiceRadius(type)).toBe(radius);
    }
  });

  it("returns undefined for a rect-based service (well)", () => {
    // well uses SERVICE_RECTS, not SERVICE_RADII
    expect(getServiceRadius("well")).toBeUndefined();
  });

  it("returns undefined for a non-service", () => {
    expect(getServiceRadius("bakery")).toBeUndefined();
  });
});

describe("getServiceRect", () => {
  it("returns { w: 8, h: 6 } for well (matches SERVICE_RECTS)", () => {
    const rect = getServiceRect("well");
    expect(rect).toBeDefined();
    expect(rect!.w).toBe(SERVICE_RECTS["well"]!.w);
    expect(rect!.h).toBe(SERVICE_RECTS["well"]!.h);
  });

  it("returns undefined for a radius-based service", () => {
    expect(getServiceRect("chapel")).toBeUndefined();
  });

  it("returns undefined for a non-service", () => {
    expect(getServiceRect("farm")).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// getGoodsFlow
// ---------------------------------------------------------------------------

describe("getGoodsFlow", () => {
  it("returns correct flow for bakery (flour → bread)", () => {
    const flow = getGoodsFlow("bakery");
    expect(flow).toBeDefined();
    expect(flow!.inputGood).toBe("flour");
    expect(flow!.outputGood).toBe("bread");
  });

  it("returns undefined outputGood for farm (grain source, no input)", () => {
    const flow = getGoodsFlow("farm");
    expect(flow!.inputGood).toBeUndefined();
    expect(flow!.outputGood).toBe("grain");
  });

  it("returns both undefined for house (no goods flow)", () => {
    const flow = getGoodsFlow("house");
    expect(flow!.inputGood).toBeUndefined();
    expect(flow!.outputGood).toBeUndefined();
  });

  it("returns undefined for an unknown type", () => {
    expect(getGoodsFlow("nonexistent")).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// woodcutter, quarry, mine — no-input production
// ---------------------------------------------------------------------------

describe("productionRatePerDay — no-input production buildings", () => {
  it("woodcutter: no input prefix in string", () => {
    const def = PRODUCTION_DEFS["woodcutter"]!;
    const cyclesPerDay = TICKS_PER_DAY / def.ticksPerCycle;
    const expected = def.outputPerCycle * cyclesPerDay;
    const result = productionRatePerDay("woodcutter", 1);
    expect(result).toBe(`${expected} wood/day`);
  });

  it("quarry: no input prefix in string", () => {
    const def = PRODUCTION_DEFS["quarry"]!;
    const cyclesPerDay = TICKS_PER_DAY / def.ticksPerCycle;
    const expected = def.outputPerCycle * cyclesPerDay;
    const result = productionRatePerDay("quarry", 1);
    expect(result).toBe(`${expected} stone/day`);
  });

  it("mine: no input prefix in string", () => {
    const def = PRODUCTION_DEFS["mine"]!;
    const cyclesPerDay = TICKS_PER_DAY / def.ticksPerCycle;
    const expected = def.outputPerCycle * cyclesPerDay;
    const result = productionRatePerDay("mine", 1);
    expect(result).toBe(`${expected} stone/day`);
  });
});
