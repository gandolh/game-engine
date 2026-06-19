/**
 * Pure rasterization + shelf packing for the runtime-generated Citadel atlas.
 *
 * No canvas, no GPU, no RNG, no Date — everything here is a deterministic pure
 * function of its inputs, so it is unit-testable headlessly (jsdom) and the
 * produced atlas is byte-identical every boot. `atlas.ts` adds the
 * browser-only `createImageBitmap` step on top.
 */
import type { PixelRecipe } from "./types";
import { colorOf } from "./palette";
import type { PixelRect } from "@engine/core";

/** A rasterized recipe: its RGBA pixels (row-major, 4 bytes/px) + dimensions. */
export interface RasterizedRecipe {
  readonly name: string;
  readonly width: number;
  readonly height: number;
  readonly rgba: Uint8ClampedArray;
}

/**
 * Rasterize one recipe to an RGBA buffer. Validates that the grid is
 * rectangular (every row is exactly `width` chars, and there are `height`
 * rows) so a typo in the ASCII art fails loudly at boot/test rather than
 * smearing pixels.
 */
export function rasterizeRecipe(recipe: PixelRecipe): RasterizedRecipe {
  const { name, width, height, pixels } = recipe;
  if (pixels.length !== height) {
    throw new Error(`recipe "${name}": expected ${height} rows, got ${pixels.length}`);
  }
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    const row = pixels[y]!;
    if (row.length !== width) {
      throw new Error(`recipe "${name}": row ${y} has ${row.length} chars, expected ${width}`);
    }
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = colorOf(row[x]!);
      const i = (y * width + x) * 4;
      rgba[i] = r;
      rgba[i + 1] = g;
      rgba[i + 2] = b;
      rgba[i + 3] = a;
    }
  }
  return { name, width, height, rgba };
}

/** Smallest power of two >= n (n >= 1). */
export function nextPow2(n: number): number {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

/** A packed atlas layout: power-of-two dimensions + per-frame rects. */
export interface PackedAtlas {
  readonly width: number;
  readonly height: number;
  readonly frames: Readonly<Record<string, PixelRect>>;
}

/** An item to pack: just the name + dimensions (rasterized pixels not needed). */
export interface PackItem {
  readonly name: string;
  readonly width: number;
  readonly height: number;
}

const PADDING = 1; // 1px transparent gutter — enough for nearest-neighbour sampling.

/**
 * Deterministic shelf packer. Sorts items by descending height (stable on name
 * for ties so the layout never depends on input order), lays them left→right
 * into shelves of `targetWidth`, wrapping to a new shelf when a row fills. The
 * atlas is sized to a power of two on both axes. Pure — same inputs → same
 * layout, always.
 */
export function packShelf(items: readonly PackItem[], targetWidth = 256): PackedAtlas {
  const widest = items.reduce((m, it) => Math.max(m, it.width), 0);
  const width = nextPow2(Math.max(targetWidth, widest + PADDING * 2));

  // Stable sort: tallest first, name as tiebreak (so order-independent).
  const sorted = [...items].sort((a, b) => b.height - a.height || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

  const frames: Record<string, PixelRect> = {};
  let shelfX = PADDING;
  let shelfY = PADDING;
  let shelfH = 0;
  for (const it of sorted) {
    if (shelfX + it.width + PADDING > width) {
      // Wrap to the next shelf.
      shelfY += shelfH + PADDING;
      shelfX = PADDING;
      shelfH = 0;
    }
    frames[it.name] = { x: shelfX, y: shelfY, w: it.width, h: it.height };
    shelfX += it.width + PADDING;
    shelfH = Math.max(shelfH, it.height);
  }
  const usedHeight = shelfY + shelfH + PADDING;
  return { width, height: nextPow2(usedHeight), frames };
}
