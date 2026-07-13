import { describe, it, expect } from "vitest";
import { EDG } from "@engine/core";
import { APOLLO, APOLLO_SET, CITADEL_PAL, nearestApollo } from "./citadel-palette";

// Canonical Apollo (46) list — mirrored by the inline copy in the engine-side
// palette guard (engine/core/src/render/palette.test.ts). Pinning the module to
// this literal here keeps the two in sync: the engine cannot import a game, so
// this colocated test is the single source of truth for the module's contents.
const CANONICAL_APOLLO = [
  "#172038", "#253a5e", "#3c5e8b", "#4f8fba", "#73bed3", "#a4dddb",
  "#19332d", "#25562e", "#468232", "#75a743", "#a8ca58", "#d0da91",
  "#4d2b32", "#7a4841", "#ad7757", "#c09473", "#d7b594", "#e7d5b3",
  "#341c27", "#602c2c", "#884b2b", "#be772b", "#de9e41", "#e8c170",
  "#241527", "#411d31", "#752438", "#a53030", "#cf573c", "#da863e",
  "#1e1d39", "#402751", "#7a367b", "#a23e8c", "#c65197", "#df84a5",
  "#090a14", "#10141f", "#151d28", "#202e37", "#394a50", "#577277",
  "#819796", "#a8b5b2", "#c7cfcc", "#ebede9",
];

// Perceived luminance (Rec. 601) — used to assert shading ramps never invert.
function lum(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 0xff;
  const g = (n >> 8) & 0xff;
  const b = n & 0xff;
  return 0.299 * r + 0.587 * g + 0.114 * b;
}
function assertAscending(names: readonly (keyof typeof CITADEL_PAL)[]): void {
  for (let i = 1; i < names.length; i++) {
    const prev = names[i - 1]!;
    const cur = names[i]!;
    expect(
      lum(CITADEL_PAL[cur]) > lum(CITADEL_PAL[prev]),
      `${cur} (${CITADEL_PAL[cur]}, lum ${lum(CITADEL_PAL[cur]).toFixed(1)}) must be lighter than ` +
        `${prev} (${CITADEL_PAL[prev]}, lum ${lum(CITADEL_PAL[prev]).toFixed(1)})`,
    ).toBe(true);
  }
}

describe("Citadel Apollo palette", () => {
  it("APOLLO has exactly 46 unique colors matching the canonical list", () => {
    expect(APOLLO).toHaveLength(46);
    expect(new Set(APOLLO).size).toBe(46);
    expect([...APOLLO]).toEqual(CANONICAL_APOLLO);
  });

  it("every CITADEL_PAL role value is one of the 46 Apollo swatches", () => {
    for (const [name, hex] of Object.entries(CITADEL_PAL)) {
      expect(APOLLO_SET.has(hex), `CITADEL_PAL.${name} (${hex}) not in APOLLO`).toBe(true);
    }
  });

  it("CITADEL_PAL exposes the SAME 32 role names as the engine EDG", () => {
    expect(Object.keys(CITADEL_PAL).sort()).toEqual(Object.keys(EDG).sort());
  });

  it("nearestApollo behaves", () => {
    expect(nearestApollo("#75a743")).toBe("#75a743");
    expect(nearestApollo("#75A743")).toBe("#75a743");
    expect(nearestApollo("#74a642")).toBe("#75a743");
  });

  it("preserves luminance ordering within every shading ramp", () => {
    assertAscending(["black", "ink", "navy", "slate", "steel", "silver", "white"]);
    assertAscending(["bark", "woodDark", "wood"]);
    assertAscending(["bark", "woodDark", "wood", "skinMid", "skin", "cream"]);
    assertAscending(["teal", "greenDark", "greenMid", "green"]);
    assertAscending(["blue", "skyBlue", "cyan"]);
    assertAscending(["crimson", "red"]);
    assertAscending(["gold", "yellow"]);
    assertAscending(["skinMid", "skin"]);
  });
});
