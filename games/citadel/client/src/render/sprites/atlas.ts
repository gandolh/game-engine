/**
 * Runtime-generated Citadel sprite atlas.
 *
 * Rasterizes every recipe + a retained 1×1 white `px` frame, shelf-packs them
 * into one power-of-two sheet, paints them onto a canvas, and returns a
 * `LoadedAtlasImage` with the exact shape the engine's renderer + GpuAtlasStore
 * expect (same contract `createQuadAtlas` produced — just many frames). Built
 * once at client boot; deterministic (the layout + pixels are pure functions),
 * so it is byte-identical every run and needs no committed PNG.
 *
 * The pure pieces (rasterize + pack) live in rasterize.ts and are unit-tested;
 * the canvas / `createImageBitmap` step here is browser-only (untested, like
 * the old `createQuadAtlas`).
 */
import type { LoadedAtlasImage, PixelRect } from "@engine/core";
import { QUAD_ATLAS_ID, QUAD_FRAME } from "../quads";
import { ALL_RECIPES } from "./recipes";
import { rasterizeRecipe, packShelf, type PackItem } from "./rasterize";
import { MESH_OVERRIDES } from "./mesh";

/**
 * Build the multi-frame Citadel atlas in-process. Async because
 * `createImageBitmap` is async. Throws if a 2D context can't be acquired.
 */
export async function createCitadelSpriteAtlas(): Promise<LoadedAtlasImage> {
  // Phase-1 mesh pipeline: three frames (bld/house, bld/bakery, bld/watchpost)
  // are rendered from in-code 3D triangle meshes (z-buffered) instead of their
  // char recipe; every other frame keeps its char recipe. Names + the
  // RasterizedRecipe contract are identical, so packing/renderer/showcase are
  // unchanged (the other 18 stay on the recipes for A/B comparison).
  const rasters = ALL_RECIPES.map((r) => MESH_OVERRIDES.get(r.name) ?? rasterizeRecipe(r));

  // Pack the recipes + the load-bearing 1×1 white `px` frame (used by every
  // tinted-quad path: ghost, light-pool, wear, autotile, cluster border, crowd).
  const items: PackItem[] = [
    { name: QUAD_FRAME, width: 1, height: 1 },
    ...rasters.map((r) => ({ name: r.name, width: r.width, height: r.height })),
  ];
  const packed = packShelf(items);

  const canvas = document.createElement("canvas");
  canvas.width = packed.width;
  canvas.height = packed.height;
  const ctx = canvas.getContext("2d");
  if (ctx === null) throw new Error("createCitadelSpriteAtlas: failed to acquire 2d context");

  // Paint via ctx.createImageData (rather than `new ImageData(buffer, …)`) — its
  // data array is a plain ArrayBuffer-backed Uint8ClampedArray, sidestepping the
  // SharedArrayBuffer typing on the ImageData constructor.
  const blit = (rgba: Uint8ClampedArray, w: number, h: number, x: number, y: number): void => {
    const img = ctx.createImageData(w, h);
    img.data.set(rgba);
    ctx.putImageData(img, x, y);
  };

  // The `px` frame: one opaque white texel (the tint does the coloring).
  const pxRect = packed.frames[QUAD_FRAME]!;
  blit(new Uint8ClampedArray([255, 255, 255, 255]), 1, 1, pxRect.x, pxRect.y);

  // Each recipe, painted at its packed rect (transparent gutter stays clear).
  for (const r of rasters) {
    const rect = packed.frames[r.name]!;
    blit(r.rgba, r.width, r.height, rect.x, rect.y);
  }

  const bitmap = await createImageBitmap(canvas);

  return {
    manifest: {
      id: QUAD_ATLAS_ID,
      imageUrl: "",
      width: packed.width,
      height: packed.height,
      frames: packed.frames,
    },
    bitmap,
    frameRect(frame: string): Readonly<PixelRect> {
      const rect = packed.frames[frame];
      if (rect === undefined) throw new Error(`citadel sprite atlas: unknown frame ${frame}`);
      return rect;
    },
  };
}
