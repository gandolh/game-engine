import { describe, it, expect } from "vitest";
import { encodeRunDescriptor, decodeRunDescriptor, type RunDescriptor } from "./run-descriptor";

const SAMPLE: RunDescriptor = {
  seed: 0x1a1100,
  persona: {
    seed: 0x1a1100,
    archetypes: [
      { preset: "cooperator", count: 8 },
      {
        preset: "hoarder",
        count: 4,
        overrides: {
          behavior: { greed: 0.95, loyalty: 0.1 },
          aptitude: { food: 0.4 },
          appearance: { height: 1.1, hairTone: "hairRed" },
          lock: ["greed"],
        },
      },
    ],
    foodNodeCount: 12,
  },
  interventionLog: [
    { seq: 0, tick: 100, shock: { kind: "famine", resourceKind: "food", factor: 0.3, durationTicks: 120 } },
    { seq: 1, tick: 250, shock: { kind: "disaster", resourceKind: "material" } },
  ],
};

describe("encodeRunDescriptor / decodeRunDescriptor", () => {
  it("round-trips exactly", () => {
    const encoded = encodeRunDescriptor(SAMPLE);
    const decoded = decodeRunDescriptor(encoded);
    expect(decoded).toEqual(SAMPLE);
  });

  it("produces a URL-hash-safe string (no +, /, =)", () => {
    const encoded = encodeRunDescriptor(SAMPLE);
    expect(encoded).not.toMatch(/[+/=]/);
  });

  it("round-trips an empty intervention log and a minimal persona", () => {
    const minimal: RunDescriptor = { seed: 1, persona: {}, interventionLog: [] };
    expect(decodeRunDescriptor(encodeRunDescriptor(minimal))).toEqual(minimal);
  });

  it("round-trips through a real URL hash", () => {
    const encoded = encodeRunDescriptor(SAMPLE);
    const url = new URL("https://example.test/#" + encoded);
    const fromHash = decodeRunDescriptor(url.hash.slice(1));
    expect(fromHash).toEqual(SAMPLE);
  });
});
