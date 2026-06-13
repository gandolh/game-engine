

import { EDG } from "@engine/core";
import { oceanDepthAt, COAST_DEPTH_MAX } from "@farm/sim-core/render-systems";

type AnyCtx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

const SPECKLE: ReadonlyArray<{ density: number; alpha: number; colors: readonly string[] } | null> = [
  null, 
  { density: 0.30, alpha: 0.26, colors: [EDG.cyan, EDG.skyBlue] },
  { density: 0.16, alpha: 0.18, colors: [EDG.skyBlue, EDG.blue] },
  null, 
  null, 
];

const SPECKLE_PX = 2;

function hash2(x: number, y: number, seed: number): number {
  let h = (seed ^ Math.imul(x, 374761393) ^ Math.imul(y, 668265263)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 4294967296;
}

const SPECKLE_COLOR_SEED = 0x85ebca6b;

export function makeWaterDepthDecorator(
  tilePx: number,
  seed: number,
): (ctx: AnyCtx2D, widthPx: number, heightPx: number) => void {
  const sub = Math.max(1, Math.floor(tilePx / SPECKLE_PX)); 
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
