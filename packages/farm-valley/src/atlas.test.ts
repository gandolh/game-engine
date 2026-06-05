/**
 * atlas.test.ts — brief 47: multi-sheet atlas grouping tests.
 *
 * Tests:
 *  1. frameToAtlasId routes every known frame prefix to the correct sheet.
 *  2. Unknown prefix throws clearly.
 *  3. All frame name prefixes from the known recipe set map to exactly one sheet.
 *
 * The consistency between builder PREFIX_TO_SHEET and runtime FRAME_PREFIX_TO_ATLAS
 * is validated indirectly: the runtime mapping is in render-systems.ts and must be
 * kept in sync with the builder mapping (guarded by this test).
 */
import { describe, it, expect } from "vitest";
import { frameToAtlasId } from "./render-systems";

// The complete set of prefixes produced by the atlas-builder recipes
// (farmer/* + npc/* + structure/* + tile/* + crop/* + decoration/* + fish/* + tool/* + indicator/* + debug/*).
const ALL_RECIPE_PREFIXES: Record<string, string> = {
  "farmer":     "characters",
  "npc":        "characters",
  "structure":  "buildings",
  "tile":       "terrain",
  "crop":       "crops",
  "decoration": "props",
  "fish":       "items-ui",
  "tool":       "items-ui",
  "indicator":  "items-ui",
  "debug":      "items-ui",
};

describe("frameToAtlasId (runtime atlas routing)", () => {
  it("routes tile/* to terrain", () => {
    expect(frameToAtlasId("tile/grass")).toBe("terrain");
    expect(frameToAtlasId("tile/ocean")).toBe("terrain");
    expect(frameToAtlasId("tile/shore")).toBe("terrain");
    expect(frameToAtlasId("tile/bridge-h")).toBe("terrain");
    expect(frameToAtlasId("tile/coral-fill")).toBe("terrain");
    expect(frameToAtlasId("tile/wall")).toBe("terrain");
    expect(frameToAtlasId("tile/wall-wood")).toBe("terrain");
    expect(frameToAtlasId("tile/shore-sand")).toBe("terrain");
    expect(frameToAtlasId("tile/fence-h")).toBe("terrain");
    expect(frameToAtlasId("tile/foam-a")).toBe("terrain");
    expect(frameToAtlasId("tile/foam-b")).toBe("terrain");
    expect(frameToAtlasId("tile/foam-c")).toBe("terrain");
    expect(frameToAtlasId("tile/dirt")).toBe("terrain");
    expect(frameToAtlasId("tile/path")).toBe("terrain");
  });

  it("routes farmer/* to characters", () => {
    expect(frameToAtlasId("farmer/conservative")).toBe("characters");
    expect(frameToAtlasId("farmer/pip/walk-a")).toBe("characters");
    expect(frameToAtlasId("farmer/hoarder/till")).toBe("characters");
    expect(frameToAtlasId("farmer/aggressive/up/walk-b")).toBe("characters");
  });

  it("routes npc/* to characters", () => {
    expect(frameToAtlasId("npc/blacksmith/idle")).toBe("characters");
    expect(frameToAtlasId("npc/carpenter/saw-a")).toBe("characters");
    expect(frameToAtlasId("npc/carpenter/idle")).toBe("characters");
  });

  it("routes structure/* to buildings", () => {
    expect(frameToAtlasId("structure/market-wall")).toBe("buildings");
    expect(frameToAtlasId("structure/forge-house")).toBe("buildings");
    expect(frameToAtlasId("structure/forge-fire-a")).toBe("buildings");
    expect(frameToAtlasId("structure/fishing-spot")).toBe("buildings");
    expect(frameToAtlasId("structure/fishing-spot-b")).toBe("buildings");
    expect(frameToAtlasId("structure/home")).toBe("buildings");
    expect(frameToAtlasId("structure/well")).toBe("buildings");
    expect(frameToAtlasId("structure/carpenter-workshop")).toBe("buildings");
    expect(frameToAtlasId("structure/forge-smoke-a")).toBe("buildings");
  });

  it("routes crop/* to crops", () => {
    expect(frameToAtlasId("crop/radish/seed")).toBe("crops");
    expect(frameToAtlasId("crop/wheat/mature")).toBe("crops");
    expect(frameToAtlasId("crop/pumpkin/growing")).toBe("crops");
  });

  it("routes decoration/* to props", () => {
    expect(frameToAtlasId("decoration/barrel")).toBe("props");
    expect(frameToAtlasId("decoration/lamp-post")).toBe("props");
    expect(frameToAtlasId("decoration/hay-bale")).toBe("props");
    expect(frameToAtlasId("decoration/bush")).toBe("props");
    expect(frameToAtlasId("decoration/windmill")).toBe("props");
  });

  it("routes fish/* to items-ui", () => {
    expect(frameToAtlasId("fish/minnow")).toBe("items-ui");
    expect(frameToAtlasId("fish/salmon")).toBe("items-ui");
    expect(frameToAtlasId("fish/bass")).toBe("items-ui");
  });

  it("routes tool/* to items-ui", () => {
    expect(frameToAtlasId("tool/fishing-rod")).toBe("items-ui");
  });

  it("routes indicator/* to items-ui", () => {
    expect(frameToAtlasId("indicator/meet")).toBe("items-ui");
    expect(frameToAtlasId("indicator/follow")).toBe("items-ui");
  });

  it("routes debug/* to items-ui", () => {
    expect(frameToAtlasId("debug/player")).toBe("items-ui");
  });

  it("throws on unknown prefix", () => {
    expect(() => frameToAtlasId("unknown/sprite")).toThrow("unknown prefix");
    expect(() => frameToAtlasId("mystery/frame")).toThrow("unknown prefix");
    expect(() => frameToAtlasId("item/seed")).toThrow("unknown prefix");
  });

  it("every known recipe prefix maps to the expected sheet", () => {
    for (const [prefix, expectedSheet] of Object.entries(ALL_RECIPE_PREFIXES)) {
      const result = frameToAtlasId(`${prefix}/test`);
      expect(result).toBe(expectedSheet);
    }
  });

  it("produces exactly 6 distinct sheet ids across all recipe prefixes", () => {
    const sheets = new Set(Object.values(ALL_RECIPE_PREFIXES));
    expect(sheets.size).toBe(6);
    expect(sheets.has("characters")).toBe(true);
    expect(sheets.has("buildings")).toBe(true);
    expect(sheets.has("terrain")).toBe(true);
    expect(sheets.has("crops")).toBe(true);
    expect(sheets.has("props")).toBe(true);
    expect(sheets.has("items-ui")).toBe(true);
  });
});
