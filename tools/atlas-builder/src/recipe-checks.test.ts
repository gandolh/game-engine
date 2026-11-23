import { describe, expect, it } from "vitest";
import type { AtlasRecipe } from "./config";
import { ATLAS_GAMES } from "./games";
import { checkFrame, checkRecipes, checkSets, formatFinding, isAllowed, type RecipeFinding } from "./recipe-checks";

const opaque = (ch: string): boolean => ch !== ".";
const recipe = (name: string, pixels: string[]): AtlasRecipe => ({ name, size: pixels.length, pixels });
const rules = (findings: RecipeFinding[]) => findings.map((f) => `${f.frame} ${f.rule} ${f.x},${f.y}`);

describe("lone-pixel", () => {
  it("fails an opaque pixel with no opaque neighbour among its eight, and names its position", () => {
    expect(rules(checkFrame(recipe("prop/x", ["....", ".a..", "....", "...."]), opaque))).toEqual([
      "prop/x lone-pixel 1,1",
    ]);
  });

  it("passes a pixel touching another, diagonals included, and exempts tiles", () => {
    expect(checkFrame(recipe("prop/x", ["....", ".a..", "..a.", "...."]), opaque)).toEqual([]);
    expect(checkFrame(recipe("tile/sparkle", ["....", ".a..", "....", "...."]), opaque)).toEqual([]);
  });
});

describe("corners", () => {
  it("fails each opaque corner and passes clear ones; tiles are exempt", () => {
    expect(rules(checkFrame(recipe("prop/x", ["a..a", ".aa.", ".aa.", "...."]), opaque))).toEqual([
      "prop/x corners 0,0",
      "prop/x corners 3,0",
    ]);
    expect(checkFrame(recipe("prop/x", ["....", ".aa.", ".aa.", "...."]), opaque)).toEqual([]);
    expect(checkFrame(recipe("tile/x", ["aaaa", "aaaa", "aaaa", "aaaa"]), opaque)).toEqual([]);
  });
});

describe("floor-row and height", () => {
  const stand = (name: string, rows: number, floor: number): AtlasRecipe => {
    const pixels = Array.from({ length: 8 }, (_, y) =>
      y >= 8 - floor - rows && y < 8 - floor ? ".aa....." : "........",
    );
    return recipe(name, pixels);
  };

  it("passes a set on one floor whose heights stay within a pixel", () => {
    expect(checkSets([stand("npc/a", 5, 1), stand("npc/b", 6, 1), stand("npc/c", 5, 1)], opaque)).toEqual([]);
  });

  it("fails a frame off the set's floor, and one more than a pixel off its height", () => {
    const findings = checkSets(
      [stand("npc/a", 5, 1), stand("npc/b", 5, 1), stand("npc/hop", 5, 2), stand("npc/tall", 7, 1)],
      opaque,
    );
    expect(findings.map((f) => `${f.frame} ${f.rule}`)).toEqual(["npc/hop floor-row", "npc/tall height"]);
    expect(formatFinding(findings[0] as RecipeFinding)).toMatch(/npc\/hop: floor-row at \(0, 5\)/);
  });

  it("compares only frames of the same set and size", () => {
    const small = recipe("npc/small", [".a..", ".a..", "....", "...."]);
    expect(checkSets([stand("npc/a", 5, 1), small, stand("other/b", 2, 3)], opaque)).toEqual([]);
  });
});

describe("the allowlist", () => {
  const finding: RecipeFinding = { rule: "height", frame: "crop/radish/ripe", x: 0, y: 0, detail: "" };
  it("covers a finding by its frame or its set, for the same rule only", () => {
    expect(isAllowed(finding, [{ frame: "crop/radish/ripe", rule: "height", reason: "r" }])).toBe(true);
    expect(isAllowed(finding, [{ frame: "crop/radish/*", rule: "height", reason: "r" }])).toBe(true);
    expect(isAllowed(finding, [{ frame: "crop/radish/*", rule: "floor-row", reason: "r" }])).toBe(false);
    expect(isAllowed(finding, [{ frame: "crop/*", rule: "height", reason: "r" }])).toBe(false);
  });
});

describe("every recipe of every game the cook knows", () => {
  for (const game of ATLAS_GAMES) {
    const allow = game.recipeCheckAllowlist ?? [];
    const findings = checkRecipes(game.recipes, game.swatches);

    it(`${game.id}: passes the recipe checks, with its allowlist`, () => {
      const failures = findings.filter((f) => !isAllowed(f, allow)).map(formatFinding);
      expect(failures, `recipe check failures:\n  ${failures.join("\n  ")}`).toEqual([]);
    });

    it(`${game.id}: every allowlist entry still covers a finding, and gives a reason`, () => {
      const stale = allow.filter((a) => !findings.some((f) => isAllowed(f, [a]))).map((a) => `${a.frame} ${a.rule}`);
      expect(stale, `allowlist entries that no longer match anything:\n  ${stale.join("\n  ")}`).toEqual([]);
      expect(allow.filter((a) => a.reason.trim() === "")).toEqual([]);
    });
  }
});
