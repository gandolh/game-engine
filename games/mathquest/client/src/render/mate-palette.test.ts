import { describe, it, expect } from "vitest";
import { EDG } from "@engine/core";
import { RESURRECT64 as ENGINE_RESURRECT64 } from "@engine/core/render";
import { RESURRECT64, RESURRECT64_SET, MATE_PAL, nearestResurrect64 } from "./mate-palette";

// sweep-02: this file used to pin the module's own hand-copied RESURRECT64 to
// a CANONICAL_RESURRECT64 literal (the same 64 hexes copied a second time),
// to catch this module drifting from the engine-side scan list. That copy is
// gone — mate-palette.ts now imports RESURRECT64 from @engine/core/render, so
// there is nothing left for this module to drift FROM. What still needs a
// colocated test (the engine cannot import a game) is that MATE_PAL's own
// role values stay valid Resurrect-64 members — see below.

describe("MateQuest Resurrect-64 palette", () => {
  it("re-exports the engine's Resurrect-64 list unchanged", () => {
    expect(RESURRECT64).toHaveLength(64);
    expect(new Set(RESURRECT64).size).toBe(64);
    expect(RESURRECT64).toBe(ENGINE_RESURRECT64);
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
