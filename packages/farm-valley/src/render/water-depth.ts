/**
 * Shallow-water speckle grain, baked once into the static layer over near-shore ocean tiles.
 * Render-only.
 *
 * Why this composites correctly: the renderer fills the animated water pattern FIRST, then blits the
 * static layer on top (transparent at ocean tiles, so water shows through). A translucent fill baked
 * into the static layer at an ocean tile therefore tints the water beneath it. Static (doesn't scroll
 * with the waves) — depth is a property of place, not the surface. Distance comes from the seeded
 * `oceanDepthAt` BFS (organic, follows the coast — avoids circular "bathtub ring" banding).
 *
 * Brief 83 item 4 introduced this as a flat per-tile cyan band wash + chunky seeded speckles
 * (EDG palette neighbours only). The FLAT WASH was removed in the brief-13 follow-up: the WebGPU
 * water shader now draws a smooth 14-tile shore→deep gradient (see water.wgsl `shoreField`), and
 * the tile-quantized wash sat on top of it as hard-edged cyan rectangles that broke the water's
 * continuity. Only the speckle grain remains baked — denser + lighter near shore, sparser + darker
 * out deep, giving the gradient its pixel-art texture. (Canvas2dRenderer — tests only — loses the
 * flat band too; the speckles still mark the shallows there.)
 */

import { EDG } from "@engine/core";
import { oceanDepthAt, COAST_DEPTH_MAX } from "@farm/sim-core/render-systems";

type AnyCtx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/**
 * Per-depth speckle grain (index = distance-from-land). `density` = chance a sub-cell gets a speckle,
 * `alpha` = its opacity, `colors` = the EDG neighbours it's drawn from (a value is picked by a second
 * hash, so repeats bias the mix). Shallow → dense/light (white→cyan); deep → sparse/dark (blue→teal).
 */
const SPECKLE: ReadonlyArray<{ density: number; alpha: number; colors: readonly string[] } | null> = [
  null, // d=0 — not ocean-adjacent
  { density: 0.42, alpha: 0.42, colors: [EDG.white, EDG.cyan, EDG.cyan] },
  { density: 0.32, alpha: 0.32, colors: [EDG.cyan, EDG.skyBlue] },
  { density: 0.22, alpha: 0.26, colors: [EDG.skyBlue, EDG.blue] },
  { density: 0.14, alpha: 0.22, colors: [EDG.blue, EDG.blue, EDG.teal] },
];

/** Chunky speckle size in px (matches the ground-noise/water-pattern grain so it survives downscale). */
const SPECKLE_PX = 2;

/** Deterministic per-cell hash → [0,1). Mirrors ground-noise's hash2 (Math.imul for true 32-bit mul). */
function hash2(x: number, y: number, seed: number): number {
  let h = (seed ^ Math.imul(x, 374761393) ^ Math.imul(y, 668265263)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 4294967296;
}

/** Distinct seed fork so the colour-pick hash never correlates with the presence hash. */
const SPECKLE_COLOR_SEED = 0x85ebca6b;

export function makeWaterDepthDecorator(
  tilePx: number,
  seed: number,
): (ctx: AnyCtx2D, widthPx: number, heightPx: number) => void {
  const sub = Math.max(1, Math.floor(tilePx / SPECKLE_PX)); // speckle cells per tile axis (8 at TILE=16)
  return (ctx, widthPx, heightPx) => {
    const cols = Math.ceil(widthPx / tilePx);
    const rows = Math.ceil(heightPx / tilePx);
    const prevOp = ctx.globalCompositeOperation;
    const prevAlpha = ctx.globalAlpha;
    ctx.globalCompositeOperation = "source-over";
    for (let ty = 0; ty < rows; ty++) {
      for (let tx = 0; tx < cols; tx++) {
        const d = oceanDepthAt(tx, ty);
        if (d <= 0 || d > COAST_DEPTH_MAX) continue;
        // Seeded speckle grain — depth-graded density/lightness. (The flat cyan band wash that
        // used to be drawn under it moved into the water shader's smooth shore gradient.)
        const spec = SPECKLE[d];
        if (!spec) continue;
        const ox = tx * tilePx;
        const oy = ty * tilePx;
        for (let sy = 0; sy < sub; sy++) {
          for (let sx = 0; sx < sub; sx++) {
            const gx = tx * sub + sx;
            const gy = ty * sub + sy;
            if (hash2(gx, gy, seed) >= spec.density) continue;
            const pick = hash2(gx, gy, (seed ^ SPECKLE_COLOR_SEED) >>> 0);
            const color = spec.colors[Math.floor(pick * spec.colors.length)] ?? EDG.cyan;
            ctx.globalAlpha = spec.alpha;
            ctx.fillStyle = color;
            ctx.fillRect(ox + sx * SPECKLE_PX, oy + sy * SPECKLE_PX, SPECKLE_PX, SPECKLE_PX);
          }
        }
      }
    }
    ctx.globalAlpha = prevAlpha;
    ctx.globalCompositeOperation = prevOp;
  };
}
