import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { PNG } from "pngjs";
import { findRecipe, gameConfig, recipeFile, recipeToPng } from "@tool/recipe-export";
import { importRecipe, importRecipeText } from "./index";

function must<T>(v: T | null | undefined): T {
  if (v === undefined || v === null) throw new Error("missing");
  return v;
}

const scratch = mkdtempSync(join(tmpdir(), "recipe-import-"));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

describe("round trip: export, import, byte-identical", () => {
  for (const id of ["farm", "mathquest"]) {
    it(`every ${id} recipe file comes back as the same bytes`, () => {
      const config = gameConfig(id);
      let files = 0;
      const different: string[] = [];
      for (const recipe of config.recipes) {
        const file = recipeFile(config, recipe.name);
        if (!file) continue; // generated in code: no file to come back to
        files++;
        const png = join(scratch, `${id}-${files}.png`); // through a real file, as the CLIs do
        writeFileSync(png, recipeToPng(config, recipe));
        const back = importRecipe(config, recipe.name, readFileSync(png));
        if (back !== readFileSync(file, "utf8")) different.push(recipe.name);
      }
      expect(files).toBeGreaterThan(0);
      expect(different).toEqual([]);
    });
  }
});

describe("import", () => {
  const config = gameConfig("farm");
  const frame = "tile/bridge-h";
  const recipe = findRecipe(config, frame);
  const template = readFileSync(must(recipeFile(config, frame)), "utf8");

  function edit(change: (png: PNG) => void): Buffer {
    const png = PNG.sync.read(recipeToPng(config, recipe));
    change(png);
    return PNG.sync.write(png);
  }
  function setPixel(png: PNG, x: number, y: number, rgba: readonly number[]): void {
    for (let i = 0; i < 4; i++) png.data[(y * png.width + x) * 4 + i] = must(rgba[i]);
  }

  it("refuses an off-palette pixel, naming it and its colour", () => {
    const bad = edit((p) => setPixel(p, 3, 5, [1, 2, 3, 255]));
    expect(() => importRecipeText(config, frame, bad, template)).toThrow("pixel (3, 5) is #010203");
  });

  it("refuses a partly transparent pixel", () => {
    const bad = edit((p) => setPixel(p, 0, 0, [62, 137, 72, 128]));
    expect(() => importRecipeText(config, frame, bad, template)).toThrow(/pixel \(0, 0\).*alpha 128/);
  });

  it("refuses a PNG of the wrong size", () => {
    const png = new PNG({ width: 4, height: 4 });
    expect(() => importRecipeText(config, frame, PNG.sync.write(png), template)).toThrow(/4x4/);
  });

  it("writes an edited pixel as the first swatch with that colour, and leaves the rest of the file alone", () => {
    // Swatch "L" and "g" share a colour; "g" comes first in the table.
    const sw = config.swatches;
    expect(sw["L"]).toEqual(sw["g"]);
    const edited = importRecipeText(
      config,
      frame,
      edit((p) => setPixel(p, 0, 0, must(sw["L"]))),
      template,
    );
    const oldLines = template.split("\n");
    const newLines = edited.split("\n");
    expect(newLines).toHaveLength(oldLines.length);
    const changed = newLines.map((l, i) => (l === oldLines[i] ? -1 : i)).filter((i) => i >= 0);
    expect(changed).toHaveLength(1);
    expect(newLines[must(changed[0])]).toBe(must(oldLines[must(changed[0])]).replace(/"./, '"g'));
  });

  it("makes a transparent pixel from any colour at alpha 0", () => {
    const edited = importRecipeText(
      config,
      frame,
      edit((p) => setPixel(p, 1, 0, [9, 9, 9, 0])),
      template,
    );
    expect(edited.split("\n").find((l) => l.includes('"v.vvv'))).toBeDefined();
  });

  it("refuses a generated frame, which has no recipe file", () => {
    const generated = config.recipes.find((r) => recipeFile(config, r.name) === null);
    expect(generated).toBeDefined();
    expect(() => importRecipe(config, must(generated).name, recipeToPng(config, must(generated)))).toThrow(
      /generated in code/,
    );
  });
});
