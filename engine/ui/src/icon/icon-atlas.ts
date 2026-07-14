import type { LoadedAtlasImage, PixelRect } from "@engine/core/assets";
import { bakeIconAtlas, type BakedIconAtlas } from "./bake";

/**
 * Turn a {@link BakedIconAtlas} (RGBA raster + manifest) into a `LoadedAtlasImage` the
 * renderer can blit, by uploading the raster to an `ImageBitmap`. Register the result with
 * `renderer.addAtlas(...)` once at startup (games/citadel and games/farm each own their own
 * call site); thereafter `icon(...)` widgets emit `pushUI` quads referencing `ICON_ATLAS_ID`
 * + the per-shade frame names (see `./bake`).
 *
 * Async because `createImageBitmap` is the only portable RGBA→bitmap path; the bake itself
 * (the deterministic part) is synchronous and lives in {@link bakeIconAtlas}. Mirrors
 * `../text/font-atlas.ts`'s `makeBakedFontAtlas` exactly.
 */
export async function makeBakedIconAtlas(
  baked: BakedIconAtlas = bakeIconAtlas(),
): Promise<LoadedAtlasImage> {
  const image = new ImageData(baked.width, baked.height);
  image.data.set(baked.rgba);
  const bitmap = await createImageBitmap(image);
  return {
    manifest: baked.manifest,
    bitmap,
    frameRect(name: string): Readonly<PixelRect> {
      const frame = baked.manifest.frames[name];
      if (!frame) throw new Error(`Icon atlas frame not found: ${name} (atlas ${baked.manifest.id})`);
      return frame;
    },
  };
}

/** Convenience: bake the full built-in icon set and upload in one call. */
export async function loadIconAtlas(): Promise<LoadedAtlasImage> {
  return makeBakedIconAtlas(bakeIconAtlas());
}
