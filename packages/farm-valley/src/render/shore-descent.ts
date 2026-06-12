/**
 * Sandy-shore descent, baked once into the static layer (brief 83 item 2). Where a sand island edge
 * meets the ocean, the beach previously ended in a flat hard line. We darken the ocean-facing strip
 * of each sand shore tile in stepped bands (strongest right at the waterline, fading inland) so the
 * sand reads as sloping *down* into the water — the island rises out of the sea instead of floating
 * on it. The water-side shallows (water-depth.ts) own everything past the waterline; this only
 * touches the land tile, so the two compose without fighting.
 *
 * Render-only and backend-agnostic: it's a Canvas2D post-bake pass, so Canvas2D draws it directly and
 * WebGPU uploads the same baked texture. Darkening is a `multiply` of EDG.skinMid (wet tan-brown) over
 * whatever sand/foam is already baked there — no new atlas art, EDG palette preserved.
 */

import { EDG } from "@engine/core";
import { SAND_SHORES, type ShoreTile } from "@farm/sim-core/render-systems";

type AnyCtx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

// Multiply alpha per band, outermost (waterline) first → fading inland. 4 bands cover the outer
// half of a 16px tile (2px each). Strongest at the water's edge = wettest sand.
const BAND_ALPHA = [0.42, 0.30, 0.20, 0.11] as const;

/** rotation (from computeShores) → unit vector pointing at the ocean: 0=up, π/2=right, π=down, 3π/2=left. */
function oceanDir(rotation: number): { dx: number; dy: number } {
  const r = ((rotation % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  const q = Math.round(r / (Math.PI / 2)) % 4; // 0,1,2,3
  if (q === 0) return { dx: 0, dy: -1 };
  if (q === 1) return { dx: 1, dy: 0 };
  if (q === 2) return { dx: 0, dy: 1 };
  return { dx: -1, dy: 0 };
}

export function makeShoreDescentDecorator(
  tilePx: number,
  shores: readonly ShoreTile[] = SAND_SHORES,
): (ctx: AnyCtx2D, widthPx: number, heightPx: number) => void {
  const bt = Math.max(1, Math.round(tilePx / 8)); // band thickness (2px at TILE=16)
  return (ctx) => {
    const prevOp = ctx.globalCompositeOperation;
    const prevAlpha = ctx.globalAlpha;
    ctx.globalCompositeOperation = "multiply";
    ctx.fillStyle = EDG.skinMid;
    for (const s of shores) {
      const ox = s.tx * tilePx;
      const oy = s.ty * tilePx;
      const { dx, dy } = oceanDir(s.rotation);
      for (let b = 0; b < BAND_ALPHA.length; b++) {
        ctx.globalAlpha = BAND_ALPHA[b]!;
        const off = b * bt; // distance inward from the ocean edge
        if (dy === -1) ctx.fillRect(ox, oy + off, tilePx, bt); // ocean up → bands from top
        else if (dy === 1) ctx.fillRect(ox, oy + tilePx - off - bt, tilePx, bt); // ocean down → from bottom
        else if (dx === 1) ctx.fillRect(ox + tilePx - off - bt, oy, bt, tilePx); // ocean right → from right
        else ctx.fillRect(ox + off, oy, bt, tilePx); // ocean left → from left
      }
    }
    ctx.globalAlpha = prevAlpha;
    ctx.globalCompositeOperation = prevOp;
  };
}
