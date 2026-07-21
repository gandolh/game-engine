import { describe, it, expect } from "vitest";
import { EDG } from "@engine/core";
import { RESURRECT64, RESURRECT64_SET, MATE_PAL, nearestResurrect64 } from "./mate-palette";

// Canonical Resurrect-64 (64) list — mirrored by the inline copy in the
// engine-side palette guard (engine/core/src/render/palette.test.ts). Pinning
// the module to this literal here keeps both in sync: the engine cannot
// import a game, so this colocated test is the single source of truth for
// THIS module's contents.
const CANONICAL_RESURRECT64 = [
  "#2e222f", "#3e3546", "#625565", "#966c6c", "#ab947a", "#694f62", "#7f708a", "#9babb2", "#c7dcd0", "#ffffff",
  "#6e2727", "#b33831", "#ea4f36", "#f57d4a", "#ae2334", "#e83b3b", "#fb6b1d", "#f79617", "#f9c22b", "#7a3045",
  "#9e4539", "#cd683d", "#e6904e", "#fbb954", "#4c3e24", "#676633", "#a2a947", "#d5e04b", "#fbff86", "#165a4c",
  "#239063", "#1ebc73", "#91db69", "#cddf6c", "#313638", "#374e4a", "#547e64", "#92a984", "#b2ba90", "#0b5e65",
  "#0b8a8f", "#0eaf9b", "#30e1b9", "#8ff8e2", "#323353", "#484a77", "#4d65b4", "#4d9be6", "#8fd3ff", "#45293f",
  "#6b3e75", "#905ea9", "#a884f3", "#eaaded", "#753c54", "#a24b6f", "#cf657f", "#ed8099", "#831c5d", "#c32454",
  "#f04f78", "#f68181", "#fca790", "#fdcbb0",
];

describe("MateQuest Resurrect-64 palette", () => {
  it("RESURRECT64 has exactly 64 unique colors matching the canonical list", () => {
    expect(RESURRECT64).toHaveLength(64);
    expect(new Set(RESURRECT64).size).toBe(64);
    expect([...RESURRECT64]).toEqual(CANONICAL_RESURRECT64);
  });

  it("every MATE_PAL role value is one of the 64 Resurrect-64 swatches", () => {
    for (const [name, hex] of Object.entries(MATE_PAL)) {
      expect(RESURRECT64_SET.has(hex), `MATE_PAL.${name} (${hex}) not in RESURRECT64`).toBe(true);
    }
  });

  it("MATE_PAL keys deep-equal the engine EDG keys (no role drift)", () => {
    expect(Object.keys(MATE_PAL).sort()).toEqual(Object.keys(EDG).sort());
  });

  it("nearestResurrect64 behaves", () => {
    expect(nearestResurrect64("#91db69")).toBe("#91db69");
    expect(nearestResurrect64("#91DB69")).toBe("#91db69");
    expect(nearestResurrect64("#90da68")).toBe("#91db69");
  });
});
