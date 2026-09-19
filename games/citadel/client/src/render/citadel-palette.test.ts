import { describe, it, expect } from "vitest";
import { EDG } from "@engine/core";
import { APOLLO as ENGINE_APOLLO } from "@engine/core/render";
import { APOLLO, APOLLO_SET, CITADEL_PAL, nearestApollo } from "./citadel-palette";

// sweep-02: this file used to pin the module's own hand-copied APOLLO to a
// CANONICAL_APOLLO literal (the same 46 hexes copied a third time), to catch
// this module drifting from the engine-side scan list. That copy is gone —
// citadel-palette.ts now imports APOLLO from @engine/core/render, so there is
// nothing left for this module to drift FROM. What still needs a colocated
// test (the engine cannot import a game) is that CITADEL_PAL's own role
// values stay valid Apollo members — see below.

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
  it("re-exports the engine's Apollo-46 list unchanged", () => {
    expect(APOLLO).toHaveLength(46);
    expect(new Set(APOLLO).size).toBe(46);
    expect(APOLLO).toBe(ENGINE_APOLLO);
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
