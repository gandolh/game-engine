import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

/**
 * `./env` reads `process.env` at MODULE-LOAD time (top-level consts, not
 * functions), so every test that wants a non-default value must set
 * `process.env` first, then `vi.resetModules()` + a fresh dynamic import --
 * otherwise it just observes whatever an earlier import froze into the cache.
 *
 * These are pure env-parsing assertions. Nothing here boots a sim (constrained
 * hardware -- see corpus/todos/2026-09-13-audit-20-tool-workspaces-test-scripts.md).
 */

const ENV_KEYS = ["SEED", "TICKS_PER_DAY", "SCENARIO", "MAX_DAYS", "REPORT", "REPORT_FILE"] as const;

let saved: Record<string, string | undefined>;

async function loadEnv(over: Partial<Record<(typeof ENV_KEYS)[number], string>>) {
  for (const k of ENV_KEYS) delete process.env[k];
  for (const [k, v] of Object.entries(over)) process.env[k] = v;
  vi.resetModules();
  return import("./env");
}

beforeEach(() => {
  saved = {};
  for (const k of ENV_KEYS) saved[k] = process.env[k];
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  vi.resetModules();
});

describe("citadel-sim env parsing", () => {
  it("defaults SEED to 0x1a2b3c4d and parses SEED as HEX (not decimal)", async () => {
    expect((await loadEnv({})).SEED).toBe(0x1a2b3c4d);
    // "10" must read as hex 16, which is what catches a base-10 regression.
    expect((await loadEnv({ SEED: "10" })).SEED).toBe(16);
    expect((await loadEnv({ SEED: "ffffffff" })).SEED).toBe(0xffffffff);
  });

  it("keeps SEED unsigned (>>> 0) for the full 32-bit range", async () => {
    const { SEED } = await loadEnv({ SEED: "ffffffff" });
    expect(SEED).toBeGreaterThan(0);
    expect(Number.isInteger(SEED)).toBe(true);
  });

  it("parses TICKS_PER_DAY as DECIMAL, defaulting to 20", async () => {
    expect((await loadEnv({})).TICKS_PER_DAY).toBe(20);
    // "20" as decimal is 20; a hex regression would make it 32.
    expect((await loadEnv({ TICKS_PER_DAY: "20" })).TICKS_PER_DAY).toBe(20);
    expect((await loadEnv({ TICKS_PER_DAY: "1200" })).TICKS_PER_DAY).toBe(1200);
  });

  it("defaults SCENARIO to grow", async () => {
    expect((await loadEnv({})).SCENARIO).toBe("grow");
    expect((await loadEnv({ SCENARIO: "siege" })).SCENARIO).toBe("siege");
  });

  it("gives the sack scenario a longer default horizon than the others", async () => {
    // The coupling that matters: sack is map-geometry-bound (raiders spawn on an
    // edge of the 192x192 world), so it needs SACK_MAX_DAYS, not the usual 40.
    const grow = await loadEnv({ SCENARIO: "grow" });
    expect(grow.MAX_DAYS).toBe(40);

    const sack = await loadEnv({ SCENARIO: "sack" });
    expect(sack.MAX_DAYS).toBe(sack.SACK_MAX_DAYS);
    expect(sack.MAX_DAYS).toBe(90);
    expect(sack.MAX_DAYS).toBeGreaterThan(grow.MAX_DAYS);
  });

  it("lets an explicit MAX_DAYS override both defaults", async () => {
    expect((await loadEnv({ MAX_DAYS: "7" })).MAX_DAYS).toBe(7);
    expect((await loadEnv({ SCENARIO: "sack", MAX_DAYS: "7" })).MAX_DAYS).toBe(7);
  });

  it("implies REPORT from REPORT_FILE, not just REPORT=1", async () => {
    const off = await loadEnv({});
    expect(off.REPORT).toBe(false);
    expect(off.REPORT_FILE).toBeUndefined();

    expect((await loadEnv({ REPORT: "1" })).REPORT).toBe(true);

    const viaFile = await loadEnv({ REPORT_FILE: "/tmp/report.json" });
    expect(viaFile.REPORT).toBe(true);
    expect(viaFile.REPORT_FILE).toBe("/tmp/report.json");

    // Only "1" enables it; any other value must not.
    expect((await loadEnv({ REPORT: "true" })).REPORT).toBe(false);
    expect((await loadEnv({ REPORT: "0" })).REPORT).toBe(false);
  });

  it("treats only siege and sack as siege scenarios", async () => {
    for (const s of ["siege", "sack"]) {
      expect((await loadEnv({ SCENARIO: s })).isSiegeScenario()).toBe(true);
    }
    for (const s of ["grow", "starve", "trade", ""]) {
      expect((await loadEnv({ SCENARIO: s })).isSiegeScenario()).toBe(false);
    }
  });
});
