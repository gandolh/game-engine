import { LIGHT_EMITTERS, emitterPx, type LightEmitter } from "@farm/sim-core/render-systems";
import { rgbOf } from "@engine/core/render";
import type { Ctx2D } from "@engine/core/render";

/**
 * Local warm-light overlay. Drawn LAST (after the global day/night wash) in world space via the
 * renderer's `overlay` hook, with an ADDITIVE ("lighter") composite so each glow punches warm
 * light back through the wash around its static emitter (forge, campfire, casino neon, ring, lit
 * farmhouse windows). Render-only and deterministic: emitter positions are fixed tiles and the
 * per-frame brightness is scaled solely by `nightness` (the in-game-clock 0=day→1=deep-night
 * value from day-night.ts) — never wall-clock. At full day (nightness 0) nothing draws.
 *
 * Anchor colors are EDG32; the radial-gradient falloff (anchor→transparent) is not per-pixel
 * palette-locked, same rule as the existing wash.
 */

const TILE = 16;

interface Glow {
  cx: number;
  cy: number;
  radiusPx: number;
  /** Precomputed "r,g,b" string for rgba() stops. */
  rgb: string;
}

// Resolve the emitter table to draw-ready glows once (positions + colors are static).
const GLOWS: readonly Glow[] = LIGHT_EMITTERS.map((e: LightEmitter): Glow => {
  const p = emitterPx(e);
  const [r, g, b] = rgbOf(e.color);
  return { cx: p.x, cy: p.y, radiusPx: p.radiusPx, rgb: `${r},${g},${b}` };
});

// Parallel intensity array (kept separate so GLOWS stays a pure geometry/color cache).
const INTENSITY: readonly number[] = LIGHT_EMITTERS.map((e) => e.intensity);

/** Only worth drawing once the wash has meaningfully dimmed the scene. */
const NIGHT_GATE = 0.12;

/**
 * The overlay callback to pass as the 4th arg of `renderer.endFrame(...)`. Captures the current
 * `nightness` and an optional cull rect (world px) so off-screen glows are skipped.
 */
export function makeLightOverlay(
  nightness: number,
  view?: { left: number; right: number; top: number; bottom: number },
): (ctx: Ctx2D) => void {
  return (ctx: Ctx2D) => {
    if (nightness <= NIGHT_GATE) return;
    // Ramp from the gate to full so lights fade in at dusk rather than popping.
    const night = (nightness - NIGHT_GATE) / (1 - NIGHT_GATE);

    const prevOp = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = "lighter";

    for (let i = 0; i < GLOWS.length; i += 1) {
      const glow = GLOWS[i]!;
      const r = glow.radiusPx;
      if (
        view &&
        (glow.cx + r < view.left ||
          glow.cx - r > view.right ||
          glow.cy + r < view.top ||
          glow.cy - r > view.bottom)
      ) {
        continue;
      }
      const peak = INTENSITY[i]! * night;
      if (peak <= 0.001) continue;

      const grad = ctx.createRadialGradient(glow.cx, glow.cy, 0, glow.cx, glow.cy, r);
      grad.addColorStop(0, `rgba(${glow.rgb},${peak.toFixed(3)})`);
      grad.addColorStop(0.45, `rgba(${glow.rgb},${(peak * 0.4).toFixed(3)})`);
      grad.addColorStop(1, `rgba(${glow.rgb},0)`);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(glow.cx, glow.cy, r, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.globalCompositeOperation = prevOp;
    ctx.globalAlpha = 1;
  };
}

/** Exposed for tests: emitter count + the gate. */
export const _LIGHT_COUNT = GLOWS.length;
export const _NIGHT_GATE = NIGHT_GATE;
export { TILE as _TILE };
