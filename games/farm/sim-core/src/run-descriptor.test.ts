import { describe, it, expect } from "vitest";
import {
  serializeRun,
  parseRun,
  type RunDescriptor,
} from "./run-descriptor";

const FIRST: RunDescriptor = { seed: 0xc0ffee, maxDays: 100, ticksPerDay: 20 };
const SAMPLES: RunDescriptor[] = [
  FIRST,
  { seed: 0, maxDays: 1, ticksPerDay: 1 },
  { seed: 0xffffffff, maxDays: 365, ticksPerDay: 48 },
  { seed: 42, maxDays: 7, ticksPerDay: 24 },
];

describe("serializeRun / parseRun round-trip", () => {
  for (const desc of SAMPLES) {
    it(`round-trips ${JSON.stringify(desc)}`, () => {
      const s = serializeRun(desc);
      expect(parseRun(s)).toEqual(desc);
    });

    it(`round-trips ${JSON.stringify(desc)} with #run= prefix`, () => {
      const s = "#run=" + serializeRun(desc);
      expect(parseRun(s)).toEqual(desc);
    });
  }

  it("tolerates a leading # without run=", () => {
    const s = "#" + serializeRun(FIRST);
    expect(parseRun(s)).toEqual(FIRST);
  });

  it("tolerates a run= prefix without #", () => {
    const s = "run=" + serializeRun(FIRST);
    expect(parseRun(s)).toEqual(FIRST);
  });

  it("produces a URL-hash-safe string (no reserved chars)", () => {
    const s = serializeRun(FIRST);
    expect(s).toBe(encodeURIComponent(s));
    expect(s).toMatch(/^[0-9a-f-]+$/);
  });
});

describe("parseRun rejects bad input", () => {
  it("returns null on empty string", () => {
    expect(parseRun("")).toBeNull();
    expect(parseRun("#")).toBeNull();
    expect(parseRun("run=")).toBeNull();
    expect(parseRun("#run=")).toBeNull();
  });

  it("returns null on malformed hash", () => {
    expect(parseRun("garbage")).toBeNull();
    expect(parseRun("xyz-123-456")).toBeNull();
    expect(parseRun("c0ffee--20")).toBeNull();
    expect(parseRun("c0ffee-64-20-extra")).toBeNull();
  });

  it("returns null on partial descriptors", () => {
    expect(parseRun("c0ffee")).toBeNull();
    expect(parseRun("c0ffee-64")).toBeNull();
    expect(parseRun("#run=c0ffee-64")).toBeNull();
  });

  it("returns null on zero/negative-equivalent maxDays or ticksPerDay", () => {
    expect(parseRun("c0ffee-0-20")).toBeNull();
    expect(parseRun("c0ffee-64-0")).toBeNull();
  });

  it("accepts seed 0 (only days/ticks must be positive)", () => {
    expect(parseRun("0-64-14")).toEqual({
      seed: 0,
      maxDays: 100,
      ticksPerDay: 20,
    });
  });
});
