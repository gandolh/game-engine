

import { EDG } from "@engine/core";
import { SAND_SHORES, type ShoreTile } from "@farm/sim-core/render-systems";

type AnyCtx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

const BAND_ALPHA = [0.42, 0.30, 0.20, 0.11] as const;

function oceanDir(rotation: number): { dx: number; dy: number } {
  const r = ((rotation % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  const q = Math.round(r / (Math.PI / 2)) % 4; 
  if (q === 0) return { dx: 0, dy: -1 };
  if (q === 1) return { dx: 1, dy: 0 };
  if (q === 2) return { dx: 0, dy: 1 };
  return { dx: -1, dy: 0 };
}

export function makeShoreDescentDecorator(
  tilePx: number,
  shores: readonly ShoreTile[] = SAND_SHORES,
): (ctx: AnyCtx2D, widthPx: number, heightPx: number) => void {
  const bt = Math.max(1, Math.round(tilePx / 8)); 
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
        const off = b * bt; 
        if (dy === -1) ctx.fillRect(ox, oy + off, tilePx, bt); 
        else if (dy === 1) ctx.fillRect(ox, oy + tilePx - off - bt, tilePx, bt); 
        else if (dx === 1) ctx.fillRect(ox + tilePx - off - bt, oy, bt, tilePx); 
        else ctx.fillRect(ox + off, oy, bt, tilePx); 
      }
    }
    ctx.globalAlpha = prevAlpha;
    ctx.globalCompositeOperation = prevOp;
  };
}
