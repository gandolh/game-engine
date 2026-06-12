/**
 * Shallow-water depth band, baked once into the static layer over ocean tiles. A translucent cyan
 * glow hugs every coastline and fades outward (strongest right at the shore), so islands read as
 * sitting in shallows that deepen to open ocean — the "margins under water" look. Render-only.
 *
 * Why this composites correctly: the renderer fills the animated water pattern FIRST, then blits the
 * static layer on top (transparent at ocean tiles, so water shows through). A translucent fill baked
 * into the static layer at an ocean tile therefore tints the water beneath it. Static (doesn't scroll
 * with the waves) — depth is a property of place, not the surface. Distance comes from the seeded
 * `oceanDepthAt` BFS (organic, follows the coast — avoids circular "bathtub ring" banding).
 *
 * Brief 83 item 4 — granular depth: on top of the flat band wash we scatter chunky seeded speckles
 * (EDG palette neighbours only). Speckle is denser + lighter near shore and sparser + darker out
 * deep, so each depth band reads as a textured *depth* rather than a flat tint ring. Both renderer
 * backends pick this up for free — the bake is a Canvas2D pass that Canvas2D draws directly and
 * WebGPU uploads as a static texture.
 */

import { EDG } from "@engine/core";
import { oceanDepthAt, COAST_DEPTH_MAX } from "@farm/sim-core/render-systems";

type AnyCtx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

// Per-distance alpha for the shallows tint (index = distance-from-land; 0/≥len = untinted deep water).
// Brightest right at the shore, fading out over COAST_DEPTH_MAX tiles.
const SHALLOW_ALPHA = [0, 0.24, 0.16, 0.09, 0.04];

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
        // 1) Flat band wash for cohesion (the original "shallows" tint).
        const a = SHALLOW_ALPHA[d] ?? 0;
        if (a > 0) {
          ctx.globalAlpha = a;
          ctx.fillStyle = EDG.cyan;
          ctx.fillRect(tx * tilePx, ty * tilePx, tilePx, tilePx);
        }
        // 2) Seeded speckle grain on top — depth-graded density/lightness.
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
