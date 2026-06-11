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
 */

import { EDG } from "@engine/core";
import { oceanDepthAt, COAST_DEPTH_MAX } from "@farm/sim-core/render-systems";

type AnyCtx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

// Per-distance alpha for the shallows tint (index = distance-from-land; 0/≥len = untinted deep water).
// Brightest right at the shore, fading out over COAST_DEPTH_MAX tiles.
const SHALLOW_ALPHA = [0, 0.24, 0.16, 0.09, 0.04];

export function makeWaterDepthDecorator(
  tilePx: number,
): (ctx: AnyCtx2D, widthPx: number, heightPx: number) => void {
  return (ctx, widthPx, heightPx) => {
    const cols = Math.ceil(widthPx / tilePx);
    const rows = Math.ceil(heightPx / tilePx);
    const prevOp = ctx.globalCompositeOperation;
    const prevAlpha = ctx.globalAlpha;
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = EDG.cyan;
    for (let ty = 0; ty < rows; ty++) {
      for (let tx = 0; tx < cols; tx++) {
        const d = oceanDepthAt(tx, ty);
        if (d <= 0 || d > COAST_DEPTH_MAX) continue;
        const a = SHALLOW_ALPHA[d] ?? 0;
        if (a <= 0) continue;
        ctx.globalAlpha = a;
        ctx.fillRect(tx * tilePx, ty * tilePx, tilePx, tilePx);
      }
    }
    ctx.globalAlpha = prevAlpha;
    ctx.globalCompositeOperation = prevOp;
  };
}
