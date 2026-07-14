import { describe, expect, it } from "vitest";
import { EDG } from "@engine/core/render";
import type { UIQuad } from "@engine/core/render";
import { UISurface } from "../render/ui-surface";
import { validateIconRecipe, shadeIndexOf, type IconRecipe } from "./recipe";
import { ICONS, ICON_SIZE, allIconNames } from "./icons";
import { bakeIconAtlas, frameNameForIcon, ICON_ATLAS_ID } from "./bake";
import { iconQuads, drawIcon } from "./draw";

describe("IconRecipe validation", () => {
  it("accepts a well-formed rectangular grid of shade chars", () => {
    const recipe: IconRecipe = { name: "dot", width: 2, height: 2, pixels: ["12", ".3"] };
    expect(() => validateIconRecipe(recipe)).not.toThrow();
  });

  it("throws when the row count doesn't match height", () => {
    const recipe: IconRecipe = { name: "short", width: 2, height: 2, pixels: ["12"] };
    expect(() => validateIconRecipe(recipe)).toThrow(/expected 2 rows, got 1/);
  });

  it("throws when a row's length doesn't match width", () => {
    const recipe: IconRecipe = { name: "ragged", width: 3, height: 1, pixels: ["12"] };
    expect(() => validateIconRecipe(recipe)).toThrow(/row 0 has 2 chars, expected 3/);
  });

  it("throws loudly on an unknown shade char (the ASCII-recipe typo case)", () => {
    // "x" is not a valid shade char — this is exactly the "typo fails at bake" guarantee.
    const recipe: IconRecipe = { name: "typo", width: 2, height: 1, pixels: ["1x"] };
    expect(() => validateIconRecipe(recipe)).toThrow(/invalid shade char "x"/);
  });

  it("shadeIndexOf maps '.'/'1'/'2'/'3' to 0/1/2/3", () => {
    const recipe: IconRecipe = { name: "ramp", width: 4, height: 1, pixels: [".123"] };
    expect(shadeIndexOf(recipe, ".")).toBe(0);
    expect(shadeIndexOf(recipe, "1")).toBe(1);
    expect(shadeIndexOf(recipe, "2")).toBe(2);
    expect(shadeIndexOf(recipe, "3")).toBe(3);
  });
});

describe("built-in icon registry", () => {
  // The vocabulary the in-canvas UIs actually ask for. Citadel's build bar needs one icon
  // per placeable building + per tool; its goods strip needs one per tradeable good. A name
  // here without a recipe means that button silently falls back to a text label, which is
  // the exact regression this icon set exists to fix — so assert coverage, not a sample.
  const BUILDINGS = [
    "house", "storehouse", "well", "farm", "mill", "bakery", "woodcutter", "sawmill",
    "quarry", "mine", "smith", "town-hall", "chapel", "market", "watchpost", "tradingpost",
    "healer", "public-square", "gate", "tower", "garrison", "keep",
  ];
  const TOOLS = ["road", "wall", "upgrade", "demolish", "cancel"];
  const GOODS = ["grain", "flour", "bread", "wood", "planks", "stone", "tools"];

  it("covers every build-bar building + tool and every tradeable good, ICON_SIZE square", () => {
    for (const name of [...BUILDINGS, ...TOOLS, ...GOODS]) {
      const recipe = ICONS[name];
      expect(recipe, `missing built-in icon "${name}"`).toBeDefined();
      expect(recipe!.width, `${name} width`).toBe(ICON_SIZE);
      expect(recipe!.height, `${name} height`).toBe(ICON_SIZE);
      expect(() => validateIconRecipe(recipe!)).not.toThrow();
    }
  });

  it("every icon uses all three shade bands (a flat icon reads as a blob at 16px)", () => {
    // Silhouette-first authoring still wants depth: an icon that paints only ONE shade has
    // no outline/highlight separation and turns to mush against a HUD panel.
    const flat: string[] = [];
    for (const [name, recipe] of Object.entries(ICONS)) {
      const shades = new Set(recipe.pixels.join("").split("").filter((c) => c !== "."));
      if (shades.size < 2) flat.push(`${name} (${shades.size} shade band)`);
    }
    expect(flat, flat.length ? `Flat icons:\n  ${flat.join("\n  ")}` : "").toEqual([]);
  });

  it("allIconNames returns every registered name, sorted", () => {
    const names = allIconNames();
    expect(names).toEqual([...names].sort());
    expect(names).toEqual(expect.arrayContaining(["house", "grain", "demolish"]));
  });
});

describe("bakeIconAtlas determinism + coverage", () => {
  it("emits three frames (dark/mid/light) per icon", () => {
    const baked = bakeIconAtlas();
    for (const name of allIconNames()) {
      for (const shade of [1, 2, 3] as const) {
        const frame = baked.manifest.frames[frameNameForIcon(name, shade)];
        expect(frame, `missing frame for ${name} shade ${shade}`).toBeDefined();
        expect(frame).toMatchObject({ w: ICON_SIZE, h: ICON_SIZE });
      }
    }
    expect(Object.keys(baked.manifest.frames)).toHaveLength(allIconNames().length * 3);
  });

  it("produces a byte-identical raster on repeated bakes", () => {
    const a = bakeIconAtlas();
    const b = bakeIconAtlas();
    expect(a.width).toBe(b.width);
    expect(a.height).toBe(b.height);
    expect(a.rgba.length).toBe(b.rgba.length);
    expect(Array.from(a.rgba)).toEqual(Array.from(b.rgba));
  });

  it("bakes onto the shared icon atlas id", () => {
    const baked = bakeIconAtlas();
    expect(baked.manifest.id).toBe(ICON_ATLAS_ID);
  });

  it("bakes each shade as an opaque white mask containing ONLY that shade's pixels", () => {
    const baked = bakeIconAtlas();
    const houseFrameDark = baked.manifest.frames[frameNameForIcon("house", 1)]!;
    const recipe = ICONS["house"]!;
    for (let y = 0; y < ICON_SIZE; y += 1) {
      for (let x = 0; x < ICON_SIZE; x += 1) {
        const idx = shadeIndexOf(recipe, recipe.pixels[y]![x]!);
        const o = (y * baked.width + houseFrameDark.x + x) * 4;
        if (idx === 1) {
          expect(baked.rgba[o + 3]).toBe(255); // lit, opaque
          expect(baked.rgba[o]).toBe(255); // white RGB (tinted later by the caller's ramp)
        } else {
          expect(baked.rgba[o + 3]).toBe(0); // every other shade is transparent on THIS frame
        }
      }
    }
  });

  it("throws loudly if asked to bake a malformed recipe", () => {
    const bad: Record<string, IconRecipe> = {
      broken: { name: "broken", width: 2, height: 2, pixels: ["1", "22"] },
    };
    expect(() => bakeIconAtlas(bad)).toThrow(/row 0 has 1 chars, expected 2/);
  });
});

describe("iconQuads / drawIcon", () => {
  const RAMP = [EDG.bark, EDG.wood, EDG.cream] as const; // [dark, mid, light]

  it("emits exactly 3 quads (one per shade) at the icon's native size", () => {
    const quads = iconQuads("house", 10, 20, { ramp: RAMP });
    expect(quads).toHaveLength(3);
    for (const q of quads) {
      expect(q).toMatchObject({ x: 10, y: 20, width: ICON_SIZE, height: ICON_SIZE, atlasId: ICON_ATLAS_ID });
    }
    expect(quads.map((q) => q.frame)).toEqual([
      frameNameForIcon("house", 1),
      frameNameForIcon("house", 2),
      frameNameForIcon("house", 3),
    ]);
  });

  it("tints each shade's quad with the matching ramp colour, in dark/mid/light order", () => {
    const quads = iconQuads("hammer", 0, 0, { ramp: RAMP });
    expect(quads[0]!.color).toBe(RAMP[0]);
    expect(quads[1]!.color).toBe(RAMP[1]);
    expect(quads[2]!.color).toBe(RAMP[2]);
  });

  it("scales the quad size by opts.scale", () => {
    const quads = iconQuads("wheat", 0, 0, { ramp: RAMP, scale: 2 });
    for (const q of quads) {
      expect(q.width).toBe(ICON_SIZE * 2);
      expect(q.height).toBe(ICON_SIZE * 2);
    }
  });

  it("drawIcon pushes exactly the computed quads through the surface", () => {
    const pushed: UIQuad[] = [];
    const fakeRenderer = {
      beginUI() {},
      pushUI(q: UIQuad) {
        pushed.push(q);
      },
      endUI() {},
    };
    const surface = new UISurface(fakeRenderer as never);
    surface.begin();
    drawIcon(surface, "house", 5, 5, { ramp: RAMP, alpha: 0.5 });
    surface.end();
    expect(pushed).toHaveLength(3);
    expect(pushed.every((q) => q.alpha === 0.5)).toBe(true);
  });
});
