import { describe, expect, it } from "vitest";
import { PNG } from "pngjs";

import { findRecipe, gameConfig, recipeFile, recipeToPng, swatchOrder } from "./index";

function must<T>(v: T | undefined): T {
  if (v === undefined) throw new Error("missing");
  return v;
}

describe("recipe export", () => {
  it("writes an indexed PNG whose palette is the swatch table, index 0 transparent", () => {
    const config = gameConfig("farm");
    const buf = recipeToPng(config, findRecipe(config, "tile/bridge-h"));
    expect(buf.readUInt8(24)).toBe(8); // bit depth
    expect(buf.readUInt8(25)).toBe(3); // indexed
    const png = PNG.sync.read(buf);
    const recipe = findRecipe(config, "tile/bridge-h");
    expect(png.width).toBe(16);
    expect(png.height).toBe(16);
    // Decoded pixel (0, 0) is the first row's first character, in the swatch table's colour.
    const first = must(config.swatches[must(must(recipe.pixels[0])[0])]);
    expect([...png.data.subarray(0, 4)]).toEqual([...first]);
    expect(swatchOrder(config)[0]).toBe(".");
    // The PLTE chunk follows IHDR: one RGB triple per swatch, in table order.
    const order = swatchOrder(config);
    const plteAt = 8 + 25; // signature + IHDR chunk
    expect(buf.subarray(plteAt + 4, plteAt + 8).toString("latin1")).toBe("PLTE");
    expect(buf.readUInt32BE(plteAt)).toBe(order.length * 3);
    expect([...buf.subarray(plteAt + 8 + 3, plteAt + 8 + 6)]).toEqual(
      must(config.swatches[must(order[1])]).slice(0, 3),
    );
  });

  it("refuses a frame the game lacks, and finds a recipe file only for file recipes", () => {
    const config = gameConfig("mathquest");
    expect(() => findRecipe(config, "nope")).toThrow(/no frame/);
    expect(recipeFile(config, "hero")).toMatch(/assets\/hero\.ts$/);
    expect(() => gameConfig("nope")).toThrow(/registered: farm, mathquest/);
  });
});
