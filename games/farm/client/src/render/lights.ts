import { LIGHT_EMITTERS, emitterPx, type LightEmitter } from "@farm/sim-core/render-systems";
import { rgbOf, TILE } from "@engine/core/render";
import type { LightOverlay, LightPool } from "@engine/core/render";

/** One emitter's fixed light: position, radius and the palette-role colour (0..1). */
interface Glow {
  cx: number;
  cy: number;
  radiusPx: number;
  r: number;
  g: number;
  b: number;
}

const GLOWS: readonly Glow[] = LIGHT_EMITTERS.map((e: LightEmitter): Glow => {
  const p = emitterPx(e);
  const [r, g, b] = rgbOf(e.color);
  return { cx: p.x, cy: p.y, radiusPx: p.radiusPx, r: r / 255, g: g / 255, b: b / 255 };
});

const INTENSITY: readonly number[] = LIGHT_EMITTERS.map((e) => e.intensity);

const NIGHT_GATE = 0.12;

// Reused every frame: one pool object per emitter, and the list the renderer reads.
const POOLS: LightPool[] = GLOWS.map((g) => ({
  cx: g.cx,
  cy: g.cy,
  radius: g.radiusPx,
  r: g.r,
  g: g.g,
  b: g.b,
  peak: 0,
}));
const OVERLAY = { pools: POOLS, count: 0 };

/**
 * The night light pools for this frame, or `undefined` by day (at or below the night gate). Pools
 * outside `view` are left out. The peak alpha is the emitter's intensity scaled by how deep the night
 * is. The returned object is reused across frames, so a caller must use it before the next call.
 */
export function makeLightOverlay(
  nightness: number,
  view?: { left: number; right: number; top: number; bottom: number },
): LightOverlay | undefined {
  if (nightness <= NIGHT_GATE) return undefined;

  const night = (nightness - NIGHT_GATE) / (1 - NIGHT_GATE);

  let count = 0;
  for (let i = 0; i < GLOWS.length; i += 1) {
    const glow = GLOWS[i];
    const pool = POOLS[count];
    const intensity = INTENSITY[i];
    if (glow === undefined || pool === undefined || intensity === undefined) continue;
    const r = glow.radiusPx;
    if (
      view &&
      (glow.cx + r < view.left || glow.cx - r > view.right || glow.cy + r < view.top || glow.cy - r > view.bottom)
    ) {
      continue;
    }
    const peak = intensity * night;
    if (peak <= 0.001) continue;

    // Slots [0, count) are rewritten in order; a pool object is never shared between two slots.
    pool.cx = glow.cx;
    pool.cy = glow.cy;
    pool.radius = r;
    pool.r = glow.r;
    pool.g = glow.g;
    pool.b = glow.b;
    pool.peak = peak;
    count += 1;
  }
  OVERLAY.count = count;
  return OVERLAY;
}

export const _LIGHT_COUNT = GLOWS.length;
export const _NIGHT_GATE = NIGHT_GATE;
export { TILE as _TILE };
