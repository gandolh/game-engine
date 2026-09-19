import { describe, it, expect } from "vitest";
import { EDG } from "@engine/core";
import { APOLLO as ENGINE_APOLLO } from "@engine/core/render";
import { APOLLO, APOLLO_SET, HOLLOW_PAL, nearestApollo } from "./hollow-palette";

// sweep-02: this file used to pin the module's own hand-copied APOLLO to a
// CANONICAL_APOLLO literal (the same 46 hexes copied a fourth time), to catch
// this module drifting from the engine-side scan list and from Citadel's own
// copy. That copy is gone — hollow-palette.ts now imports APOLLO from
// @engine/core/render (the SAME list Citadel imports), so there is nothing
// left for this module to drift FROM. What still needs a colocated test (the
// engine cannot import a game) is that HOLLOW_PAL's own role values stay
// valid Apollo members — see below.

// Perceived luminance (Rec. 601) — used to assert shading ramps never invert.
function lum(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 0xff;
  const g = (n >> 8) & 0xff;
  const b = n & 0xff;
  return 0.299 * r + 0.587 * g + 0.114 * b;
}
function assertAscending(names: readonly (keyof typeof HOLLOW_PAL)[]): void {
  for (let i = 1; i < names.length; i++) {
    const prev = names[i - 1]!;
    const cur = names[i]!;
    expect(
      lum(HOLLOW_PAL[cur]) > lum(HOLLOW_PAL[prev]),
      `${cur} (${HOLLOW_PAL[cur]}, lum ${lum(HOLLOW_PAL[cur]).toFixed(1)}) must be lighter than ` +
        `${prev} (${HOLLOW_PAL[prev]}, lum ${lum(HOLLOW_PAL[prev]).toFixed(1)})`,
    ).toBe(true);
  }
}

describe("Hollow Apollo palette", () => {
  it("re-exports the engine's Apollo-46 list unchanged", () => {
    expect(APOLLO).toHaveLength(46);
    expect(new Set(APOLLO).size).toBe(46);
    expect(APOLLO).toBe(ENGINE_APOLLO);
  });

  it("every HOLLOW_PAL role value is one of the 46 Apollo swatches", () => {
    for (const [name, hex] of Object.entries(HOLLOW_PAL)) {
      expect(APOLLO_SET.has(hex), `HOLLOW_PAL.${name} (${hex}) not in APOLLO`).toBe(true);
    }
  });

  it("HOLLOW_PAL includes the SAME 32 shared role names as the engine EDG", () => {
    const sharedNames = new Set(Object.keys(EDG));
    for (const name of sharedNames) {
      expect(Object.prototype.hasOwnProperty.call(HOLLOW_PAL, name), `HOLLOW_PAL missing shared role "${name}"`).toBe(
        true,
      );
    }
  });

  it("adds the new Hollow-only skin/hair tone roles", () => {
    const newRoles = [
      "skinLight",
      "skinDark",
      "skinDeep",
      "hairBlack",
      "hairBrown",
      "hairBlonde",
      "hairRed",
      "hairGrey",
    ] as const;
    for (const name of newRoles) {
      expect(Object.prototype.hasOwnProperty.call(HOLLOW_PAL, name), `HOLLOW_PAL missing new role "${name}"`).toBe(
        true,
      );
      expect(APOLLO_SET.has(HOLLOW_PAL[name])).toBe(true);
    }
  });

  it("nearestApollo behaves", () => {
    expect(nearestApollo("#75a743")).toBe("#75a743");
    expect(nearestApollo("#75A743")).toBe("#75a743");
    expect(nearestApollo("#74a642")).toBe("#75a743");
  });

  it("preserves luminance ordering within every shading ramp, including the new skin/hair tones", () => {
    assertAscending(["black", "ink", "navy", "slate", "steel", "silver", "white"]);
    assertAscending(["bark", "woodDark", "wood"]);
    assertAscending(["teal", "greenDark", "greenMid", "green"]);
    assertAscending(["blue", "skyBlue", "cyan"]);
    assertAscending(["crimson", "red"]);
    assertAscending(["gold", "yellow"]);
    assertAscending(["skinDeep", "skinDark", "skinMid", "skin", "skinLight"]);
  });
});
