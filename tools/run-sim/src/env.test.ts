import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

/**
 * `./env` reads `process.env` at MODULE-LOAD time (plain top-level consts,
 * not functions) — see src/env.ts. So every test that wants a non-default
 * value must set `process.env` first and then `vi.resetModules()` + a fresh
 * dynamic `import("./env")`, or it will just observe whatever an earlier
 * test's import already froze into the module cache.
 */

const ENV_KEYS = [
  "SEED",
  "WORLD_SEED",
  "TICKS_PER_DAY",
  "MAX_DAYS",
  "PROGRESS_EVERY",
  "CHECK_DETERMINISM",
  "EXPORT",
  "EXPORT_FILE",
  "REPORT",
  "REPORT_FILE",
  "SEEDS",
] as const;

const savedEnv: Record<string, string | undefined> = {};
const savedArgv: string[] = [];

beforeEach(() => {
  for (const key of ENV_KEYS) savedEnv[key] = process.env[key];
  savedArgv.length = 0;
  savedArgv.push(...process.argv);
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
  process.argv = savedArgv.slice();
});

async function freshEnv() {
  vi.resetModules();
  return import("./env");
}

describe("env defaults (nothing set)", () => {
  it("SEED defaults to 0xc0ffee", async () => {
    for (const key of ENV_KEYS) delete process.env[key];
    const env = await freshEnv();
    expect(env.SEED).toBe(0xc0ffee);
  });

  it("WORLD_SEED is undefined by default", async () => {
    for (const key of ENV_KEYS) delete process.env[key];
    const env = await freshEnv();
    expect(env.WORLD_SEED).toBeUndefined();
  });

  it("TICKS_PER_DAY defaults to 1200 and MAX_DAYS to 100", async () => {
    for (const key of ENV_KEYS) delete process.env[key];
    const env = await freshEnv();
    expect(env.TICKS_PER_DAY).toBe(1200);
    expect(env.MAX_DAYS).toBe(100);
  });

  it("PROGRESS_EVERY defaults to 10", async () => {
    for (const key of ENV_KEYS) delete process.env[key];
    const env = await freshEnv();
    expect(env.PROGRESS_EVERY).toBe(10);
  });

  it("CHECK_DETERMINISM defaults to false", async () => {
    for (const key of ENV_KEYS) delete process.env[key];
    const env = await freshEnv();
    expect(env.CHECK_DETERMINISM).toBe(false);
  });

  it("EXPORT defaults to empty string and EXPORT_FILE to undefined", async () => {
    for (const key of ENV_KEYS) delete process.env[key];
    const env = await freshEnv();
    expect(env.EXPORT).toBe("");
    expect(env.EXPORT_FILE).toBeUndefined();
  });

  it("REPORT defaults to false and REPORT_FILE to undefined", async () => {
    for (const key of ENV_KEYS) delete process.env[key];
    const env = await freshEnv();
    expect(env.REPORT).toBe(false);
    expect(env.REPORT_FILE).toBeUndefined();
  });

  it("determinismSeeds() falls back to [SEED] when SEEDS is unset", async () => {
    for (const key of ENV_KEYS) delete process.env[key];
    process.env["SEED"] = "42";
    const env = await freshEnv();
    expect(env.determinismSeeds()).toEqual([42]);
  });
});

describe("env overrides", () => {
  it("parses SEED as a decimal Number, not a hex string", async () => {
    for (const key of ENV_KEYS) delete process.env[key];
    process.env["SEED"] = "255";
    const env = await freshEnv();
    expect(env.SEED).toBe(255);
  });

  it("WORLD_SEED is set (and numeric) when the env var is a non-empty string", async () => {
    for (const key of ENV_KEYS) delete process.env[key];
    process.env["WORLD_SEED"] = "777";
    const env = await freshEnv();
    expect(env.WORLD_SEED).toBe(777);
  });

  it("WORLD_SEED stays undefined when the env var is set to an empty string", async () => {
    for (const key of ENV_KEYS) delete process.env[key];
    process.env["WORLD_SEED"] = "";
    const env = await freshEnv();
    expect(env.WORLD_SEED).toBeUndefined();
  });

  it("TICKS_PER_DAY and MAX_DAYS take the env override", async () => {
    for (const key of ENV_KEYS) delete process.env[key];
    process.env["TICKS_PER_DAY"] = "20";
    process.env["MAX_DAYS"] = "3";
    const env = await freshEnv();
    expect(env.TICKS_PER_DAY).toBe(20);
    expect(env.MAX_DAYS).toBe(3);
  });

  it("CHECK_DETERMINISM is true when CHECK_DETERMINISM=1", async () => {
    for (const key of ENV_KEYS) delete process.env[key];
    process.env["CHECK_DETERMINISM"] = "1";
    const env = await freshEnv();
    expect(env.CHECK_DETERMINISM).toBe(true);
  });

  it("CHECK_DETERMINISM is true when --check-determinism is on argv, even with no env var", async () => {
    for (const key of ENV_KEYS) delete process.env[key];
    process.argv = [...process.argv, "--check-determinism"];
    const env = await freshEnv();
    expect(env.CHECK_DETERMINISM).toBe(true);
  });

  it("EXPORT is lower-cased", async () => {
    for (const key of ENV_KEYS) delete process.env[key];
    process.env["EXPORT"] = "JSON";
    const env = await freshEnv();
    expect(env.EXPORT).toBe("json");
  });

  it("EXPORT_FILE passes through verbatim", async () => {
    for (const key of ENV_KEYS) delete process.env[key];
    process.env["EXPORT_FILE"] = "/tmp/out.csv";
    const env = await freshEnv();
    expect(env.EXPORT_FILE).toBe("/tmp/out.csv");
  });

  it("REPORT is true when REPORT_FILE is set, even without REPORT=1", async () => {
    for (const key of ENV_KEYS) delete process.env[key];
    process.env["REPORT_FILE"] = "/tmp/report.json";
    const env = await freshEnv();
    expect(env.REPORT).toBe(true);
    expect(env.REPORT_FILE).toBe("/tmp/report.json");
  });

  it("determinismSeeds() splits SEEDS on commas and trims whitespace", async () => {
    for (const key of ENV_KEYS) delete process.env[key];
    process.env["SEEDS"] = "1, 2,3 ,  4";
    const env = await freshEnv();
    expect(env.determinismSeeds()).toEqual([1, 2, 3, 4]);
  });
});
