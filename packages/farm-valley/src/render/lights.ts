import { LIGHT_EMITTERS, emitterPx, type LightEmitter } from "@farm/sim-core/render-systems";
import { rgbOf } from "@engine/core/render";
import type { Ctx2D } from "@engine/core/render";

const TILE = 16;

interface Glow {
  cx: number;
  cy: number;
  radiusPx: number;

  rgb: string;
}

const GLOWS: readonly Glow[] = LIGHT_EMITTERS.map((e: LightEmitter): Glow => {
  const p = emitterPx(e);
  const [r, g, b] = rgbOf(e.color);
  return { cx: p.x, cy: p.y, radiusPx: p.radiusPx, rgb: `${r},${g},${b}` };
});

const INTENSITY: readonly number[] = LIGHT_EMITTERS.map((e) => e.intensity);

const NIGHT_GATE = 0.12;

export function makeLightOverlay(
  nightness: number,
  view?: { left: number; right: number; top: number; bottom: number },
): (ctx: Ctx2D) => void {
  return (ctx: Ctx2D) => {
    if (nightness <= NIGHT_GATE) return;

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

export const _LIGHT_COUNT = GLOWS.length;
export const _NIGHT_GATE = NIGHT_GATE;
export { TILE as _TILE };
