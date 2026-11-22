import { describe, expect, it } from "vitest";
import { COMBAT_SPRITES, RECIPES, SWATCH } from "./index";

describe("MateQuest's combat recipes", () => {
  it("has the hero and the six enemies, each a rectangle of known characters", () => {
    expect(RECIPES.map((r) => r.name)).toEqual([
      "hero",
      "enemy/dragon",
      "enemy/balaur",
      "enemy/strigoi",
      "enemy/varcolac",
      "enemy/capcaun",
      "enemy/muma",
    ]);
    for (const r of RECIPES) {
      expect(r.pixels).toHaveLength(r.height ?? r.size);
      for (const row of r.pixels) {
        expect(row).toHaveLength(r.width ?? r.size);
        for (const ch of row) expect(SWATCH[ch], `${r.name}: "${ch}"`).toBeDefined();
      }
    }
  });

  it("stands each creature on its bottom row, with its anchor inside the frame", () => {
    for (const r of RECIPES) {
      const sprite = COMBAT_SPRITES[r.name];
      expect(sprite).toBeDefined();
      if (sprite === undefined) continue;
      expect(sprite.anchorX).toBeGreaterThan(0);
      expect(sprite.anchorX).toBeLessThan(sprite.width);
      expect(r.pixels.at(-1)?.replace(/\./g, "").length, `${r.name} touches the ground`).toBeGreaterThan(0);
    }
  });
});
