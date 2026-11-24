import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, sep } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { checkSwatches, type AtlasRecipe } from "@tool/atlas-builder";
import { gameConfig, recipeSrcDir } from "@tool/recipe-export";
import { cropGrid, parseGridText, readGridText, recipeSource } from "./index";

const farm = gameConfig("farm");
const mathquest = gameConfig("mathquest");

/** A fixture in sprite-gen's shape: an 8 px drawing whose keys are not the game's characters. */
const FIXTURE = [
  "PALETTE",
  ". transparent",
  "o #181425",
  "g #3E8948",
  "h #63c74d",
  "r #E43B44",
  "FRAME icon",
  "........",
  "...oo...",
  "..ohgo..",
  "..oggo..",
  ".orrrro.",
  ".orrrro.",
  "..oooo..",
  "........",
  "END",
  "",
].join("\n");

const scratch = mkdtempSync(join(tmpdir(), "recipe-import-grid-"));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

describe("parseGridText", () => {
  it("reads the palette, lowercased, and each frame's rows", () => {
    const file = parseGridText(FIXTURE);
    expect(file.palette.get(".")).toBeNull();
    expect(file.palette.get("g")).toBe("#3e8948");
    expect(file.frames.map((f) => [f.name, f.rows.length, f.rows[2]])).toEqual([["icon", 8, "..ohgo.."]]);
  });

  it("refuses a key the palette lacks, and rows of different widths", () => {
    expect(() => parseGridText(FIXTURE.replace("..ohgo..", "..ohzo.."))).toThrow(
      /line 10: key "z" is not in the palette/,
    );
    expect(() => parseGridText(FIXTURE.replace("..ohgo..", "..ohgo."))).toThrow(/row 2 is 7 wide, not 8/);
  });

  it("refuses a palette value that is not a colour", () => {
    expect(() => parseGridText(FIXTURE.replace("r #E43B44", "r red"))).toThrow(/"red" is neither/);
  });
});

describe("readGridText", () => {
  it("maps each colour to the game's first swatch character with it", () => {
    // Farm's G and C share a colour, as do g and L: the first in the table wins.
    expect(farm.swatches["C"]).toEqual(farm.swatches["G"]);
    expect(farm.swatches["L"]).toEqual(farm.swatches["g"]);
    const grid = readGridText(farm, FIXTURE);
    expect(grid).toMatchObject({ width: 8, height: 8 });
    expect(grid.rows).toEqual([
      "........",
      "...kk...",
      "..kgGk..",
      "..kGGk..",
      ".kRRRRk.",
      ".kRRRRk.",
      "..kkkk..",
      "........",
    ]);
  });

  it("refuses a colour outside the game's swatch table, naming its key, colour and pixels", () => {
    expect(() => readGridText(farm, FIXTURE.replace("r #E43B44", "r #010203"))).toThrow(
      /1 colour\(s\) not in the "farm" swatch table: key "r" is #010203 \(8 px\)/,
    );
    // Farm's colours are not MateQuest's.
    expect(() => readGridText(mathquest, FIXTURE)).toThrow(/not in the "mathquest" swatch table/);
  });

  it("ignores palette entries the frame doesn't use", () => {
    const extra = FIXTURE.replace("r #E43B44", "r #E43B44\nz #010203");
    expect(readGridText(farm, extra).rows[4]).toBe(".kRRRRk.");
  });

  it("picks a frame by name when the file holds several, and asks for one otherwise", () => {
    const two = FIXTURE.replace("END", "END\nFRAME b\n.o\no.\nEND");
    expect(readGridText(farm, two, { frame: "b" }).rows).toEqual([".k", "k."]);
    expect(() => readGridText(farm, two)).toThrow(/holds 2 frames \(icon, b\); name one/);
    expect(() => readGridText(farm, two, { frame: "c" })).toThrow(/no frame "c"/);
  });
});

describe("cropGrid", () => {
  const grid = readGridText(farm, FIXTURE);

  it("crops a square drawing to a width and height, keeping the bottom rows and centring on the drawing", () => {
    const cropped = cropGrid(grid, 6, 7);
    expect(cropped).toEqual({
      width: 6,
      height: 7,
      rows: ["..kk..", ".kgGk.", ".kGGk.", "kRRRRk", "kRRRRk", ".kkkk.", "......"],
    });
    expect(readGridText(farm, FIXTURE, { width: 6, height: 7 })).toEqual(cropped);
  });

  it("refuses a window that would cut the drawing, or one larger than it", () => {
    expect(() => cropGrid(grid, 5, 8)).toThrow(/would cut the drawing: it spans columns 1-6/);
    expect(() => cropGrid(grid, 8, 6)).toThrow(/starts on row 1/);
    expect(() => cropGrid(grid, 9, 8)).toThrow(/cannot crop a 8x8 drawing to 9x8/);
  });
});

describe("recipeSource", () => {
  it("writes a recipe file that loads and passes the palette guard", async () => {
    const file = join(scratch, "fruit-test.ts");
    const types = relative(scratch, join(recipeSrcDir(farm), "types"))
      .split(sep)
      .join("/");
    const grid = readGridText(farm, FIXTURE, { width: 6, height: 7 });
    const text = recipeSource({ name: "fruit/test", grid, typesImport: types, comment: "A fixture." });
    expect(text.split("\n").slice(0, 8)).toEqual([
      "// A fixture.",
      `import type { PixelRecipe } from "${types}";`,
      "",
      "const recipe: PixelRecipe = {",
      '  name: "fruit/test",',
      "  size: 7,",
      "  width: 6,",
      "  height: 7,",
    ]);
    writeFileSync(file, text);
    const recipe = ((await import(file)) as { default: AtlasRecipe }).default;
    expect(recipe).toEqual({ name: "fruit/test", size: 7, width: 6, height: 7, pixels: grid.rows });
    expect(() => checkSwatches({ ...farm, recipes: [recipe] })).not.toThrow();
  });

  it("leaves out width and height for a square drawing", () => {
    const text = recipeSource({ name: "x", grid: readGridText(farm, FIXTURE), typesImport: "../types" });
    expect(text).toContain("  size: 8,\n  pixels: [\n");
    expect(text).not.toContain("width");
  });
});
