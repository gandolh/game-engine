import { describe, it, expect } from "vitest";
import { glyphForAction, glyphForOccupation } from "./glyphs";

const SOCIAL_VERBS = ["gift", "share", "help", "teach", "trade", "steal", "sabotage", "rumor", "attack"] as const;
const JOB_ROLES = ["food-gatherer", "material-gatherer", "crafter", "teacher", "caretaker"] as const;

describe("glyphForAction", () => {
  it("draws nothing for idle/walk (the uncluttered default)", () => {
    expect(glyphForAction("idle")).toBeNull();
    expect(glyphForAction("walk")).toBeNull();
  });

  it("has a distinct glyph for work/eat and every social verb", () => {
    const notable = ["work", "eat", ...SOCIAL_VERBS];
    const glyphs = notable.map((a) => glyphForAction(a));
    for (const g of glyphs) {
      expect(g).not.toBeNull();
      expect(typeof g).toBe("string");
      expect(g!.length).toBeGreaterThan(0);
    }
    // Every notable action gets its OWN symbol (no accidental collisions
    // that would make two very different verbs read identically).
    expect(new Set(glyphs).size).toBe(glyphs.length);
  });

  it("falls back to null for an unrecognized action label", () => {
    expect(glyphForAction("not-a-real-action")).toBeNull();
    expect(glyphForAction("")).toBeNull();
  });

  it("is pure — repeated calls return the same result", () => {
    expect(glyphForAction("gift")).toBe(glyphForAction("gift"));
  });
});

describe("glyphForOccupation", () => {
  it("draws nothing for unassigned (no job yet)", () => {
    expect(glyphForOccupation("unassigned")).toBeNull();
  });

  it("has a distinct single-letter cue for every real job role", () => {
    const glyphs = JOB_ROLES.map((r) => glyphForOccupation(r));
    for (const g of glyphs) {
      expect(g).not.toBeNull();
      expect(g!.length).toBe(1);
    }
    // Every role gets its OWN letter — no accidental collisions.
    expect(new Set(glyphs).size).toBe(glyphs.length);
  });

  it("falls back to null for an unrecognized occupation label", () => {
    expect(glyphForOccupation("not-a-real-role")).toBeNull();
    expect(glyphForOccupation("")).toBeNull();
  });

  it("is pure — repeated calls return the same result", () => {
    expect(glyphForOccupation("crafter")).toBe(glyphForOccupation("crafter"));
  });
});
