import type { LoadedAtlasImage, PixelRect } from "@engine/core/assets";
import { bakeFontAtlas, type BakedFont, type FontMetrics } from "./font";

/**
 * Turn a {@link BakedFont} (RGBA raster + manifest) into a `LoadedAtlasImage` the renderer
 * can blit, by uploading the raster to an `ImageBitmap`. Register the result with
 * `renderer.addAtlas(...)` once at startup; thereafter `drawText` emits `pushUI` quads that
 * reference `FONT_ATLAS_ID` + the per-glyph frame names.
 *
 * Async because `createImageBitmap` is the only portable RGBA→bitmap path; the bake itself
 * (the deterministic part) is synchronous and lives in {@link bakeFontAtlas}.
 */
export async function makeBakedFontAtlas(
  baked: BakedFont = bakeFontAtlas(),
): Promise<LoadedAtlasImage> {
  // Copy into an ImageData-backed buffer. The bake's array may be typed as
  // Uint8ClampedArray<ArrayBufferLike>; ImageData wants a plain ArrayBuffer-backed one.
  const image = new ImageData(baked.width, baked.height);
  image.data.set(baked.rgba);
  const bitmap = await createImageBitmap(image);
  return {
    manifest: baked.manifest,
    bitmap,
    frameRect(name: string): Readonly<PixelRect> {
      const frame = baked.manifest.frames[name];
      if (!frame) throw new Error(`Font atlas frame not found: ${name} (atlas ${baked.manifest.id})`);
      return frame;
    },
  };
}

/** Convenience: bake (optionally with custom metrics) and upload in one call. */
export async function loadFontAtlas(metrics?: FontMetrics): Promise<LoadedAtlasImage> {
  return makeBakedFontAtlas(bakeFontAtlas(metrics));
}
