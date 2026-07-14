import type { AtlasManifest } from "@engine/core/assets";
import { EDG, rgbOf } from "@engine/core/render";
import { ICONS, ICON_SIZE, allIconNames } from "./icons";
import { PAINTED_SHADES, shadeIndexOf, validateIconRecipe, type IconRecipe, type PaintedShade } from "./recipe";

/**
 * Deterministic icon baking for `@engine/ui` — the icon-pipeline analogue of the font bake
 * (`../text/font.ts`): a code-literal recipe table → a pure bake → an `AtlasManifest` + RGBA
 * buffer, uploaded once via `./icon-atlas` into a `LoadedAtlasImage` the renderer's
 * textured-quad path can blit + tint.
 *
 * ## Ramp/tinting mechanism: THREE 1-bit mask sub-frames per icon (not a packed-channel frame)
 *
 * `RendererLike.pushUI`'s `UIQuad.color` is a single **multiplicative tint** applied to a whole
 * textured quad (see `engine/core/src/render/ui-draw.ts`'s `drawUIQuad`: `multiply` composited
 * against the quad's own colour, exactly how `drawText` tints a white/alpha glyph mask). There is
 * no per-pixel/per-channel tint path in either backend — a quad gets exactly one colour. A 3-tone
 * icon therefore cannot be "one frame, one draw call" without a renderer change (option (a) in the
 * brief, e.g. stashing the shade index in a colour channel) — that would need new shader/Canvas2D
 * compositing code in `@engine/core`, which this wave does not touch.
 *
 * So each icon bakes to **three independent white/alpha masks**, one per shade
 * (`frameNameForIcon(name, 1|2|3)`), each containing only the pixels at that shade. The widget
 * (`../widget/render.ts`) draws an icon as three stacked `UIQuad`s at the same rect, one per ramp
 * colour — since the three masks are pixel-disjoint (every source pixel is exactly one shade or
 * transparent), the three draws never blend into each other; they just union into the final
 * three-tone icon. This needs zero renderer changes, reuses the exact tint path text already
 * proves out, and keeps the bake byte-identical/deterministic like the font bake. The cost is 3x
 * the draw calls and 3x the atlas frames per icon versus option (a) — for a ~25-30 icon HUD set at
 * 12x12 that's negligible (a few dozen tiny quads a frame, same order as a button's glyph run).
 */

/** Frame name for one shade of one icon in the baked atlas. */
export function frameNameForIcon(name: string, shade: PaintedShade): string {
  return `icon-${name}-${shade}`;
}

/** Shared atlas id every baked icon frame lives on (one atlas for the whole icon set). */
export const ICON_ATLAS_ID = "ui-icons";

/** A baked icon set: the raw RGBA raster + the atlas manifest describing its shade frames. */
export interface BakedIconAtlas {
  readonly manifest: AtlasManifest;
  /** Tightly-packed RGBA8 (width*height*4) pixel buffer. White where a shade's mask is lit. */
  readonly rgba: Uint8ClampedArray;
  readonly width: number;
  readonly height: number;
}

/**
 * Deterministically bake `icons` (default the full built-in {@link ICONS} registry) into an
 * RGBA raster + manifest: three `ICON_SIZE x ICON_SIZE` mask frames per icon (dark/mid/light,
 * see the module doc), packed left-to-right in icon-name order (sorted, so the layout never
 * depends on object key insertion order) into a single row. Pure — same input always yields a
 * byte-identical buffer; there is no runtime asset file and no platform rasterizer involved.
 */
export function bakeIconAtlas(icons: Readonly<Record<string, IconRecipe>> = ICONS): BakedIconAtlas {
  const names = icons === ICONS ? allIconNames() : Object.keys(icons).sort();
  const cols = names.length * PAINTED_SHADES.length;
  const width = cols * ICON_SIZE;
  const height = ICON_SIZE;
  const rgba = new Uint8ClampedArray(width * height * 4);

  // White RGB from the palette (avoids a raw colour literal → palette guard stays clean).
  const [wr, wg, wb] = rgbOf(EDG.white);

  const frames: AtlasManifest["frames"] = {};
  let col = 0;
  for (const name of names) {
    const recipe = icons[name]!;
    validateIconRecipe(recipe); // a malformed recipe fails the bake loudly, never bakes garbage
    for (const shade of PAINTED_SHADES) {
      const cellX = col * ICON_SIZE;
      for (let y = 0; y < recipe.height; y += 1) {
        const row = recipe.pixels[y]!;
        for (let x = 0; x < recipe.width; x += 1) {
          if (shadeIndexOf(recipe, row[x]!) !== shade) continue;
          const px = cellX + x;
          const o = (y * width + px) * 4;
          rgba[o] = wr;
          rgba[o + 1] = wg;
          rgba[o + 2] = wb;
          rgba[o + 3] = 255;
        }
      }
      frames[frameNameForIcon(name, shade)] = { x: cellX, y: 0, w: ICON_SIZE, h: ICON_SIZE };
      col += 1;
    }
  }

  const manifest: AtlasManifest = {
    id: ICON_ATLAS_ID,
    imageUrl: "",
    width,
    height,
    frames,
  };

  return { manifest, rgba, width, height };
}
