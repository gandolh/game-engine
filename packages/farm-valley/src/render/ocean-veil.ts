/**
 * Ocean-surface veil — baked into the static layer (LAST in the decorate chain, so it sits over the
 * baked seabed life: coral, set-pieces, starfish/crab/anemone). A flat translucent deep-ocean fill
 * over every water tile makes those creatures read as seen THROUGH water, while land/buildings/
 * farmers/objectives (drawn after, on walkable land) stay crisp above it.
 *
 * Why baked, not per-frame sprites: a per-tile sprite quad pass leaves faint seams between quads at
 * fractional zoom → horizontal/vertical banding over open water. One canvas fill has no seams.
 *
 * Covers `regionAt === null` tiles — that's ocean AND bridge spans (bridges sit over open water, so
 * the water under/around a bridge deck must veil identically). Land regions (regionAt non-null) are
 * skipped so islands never get tinted.
 */
import { EDG, rgbOf } from "@engine/core/render";
import { regionAt } from "@farm/sim-core/world/regions";

type AnyCtx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** Translucent surface strength. Deep-ocean EDG anchor; alpha tuned so creatures read through it. */
const VEIL_ALPHA = 0.4;

export function makeOceanVeilDecorator(
  tilePx: number,
): (ctx: AnyCtx2D, widthPx: number, heightPx: number) => void {
  const [r, g, b] = rgbOf(EDG.navy);
  const fill = `rgba(${r},${g},${b},${VEIL_ALPHA})`;
  return (ctx, widthPx, heightPx) => {
    const cols = Math.ceil(widthPx / tilePx);
    const rows = Math.ceil(heightPx / tilePx);
    const prevOp = ctx.globalCompositeOperation;
    const prevAlpha = ctx.globalAlpha;
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    ctx.fillStyle = fill;
    for (let ty = 0; ty < rows; ty++) {
      for (let tx = 0; tx < cols; tx++) {
        if (regionAt(tx, ty) !== null) continue; // skip land; veil ocean + bridge spans
        ctx.fillRect(tx * tilePx, ty * tilePx, tilePx, tilePx);
      }
    }
    ctx.globalCompositeOperation = prevOp;
    ctx.globalAlpha = prevAlpha;
  };
}
