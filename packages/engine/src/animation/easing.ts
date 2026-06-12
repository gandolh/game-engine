/**
 * Easing functions for render-side animation (scale pops, eases, settles).
 * All take a normalized `t` in [0,1] and return an eased value; most return
 * within [0,1] except the *Back/*Elastic family, which overshoot by design.
 * Pure — safe to call per frame. (Robert Penner / easings.net.)
 */

/** Linear — sharp onset; use for impact flashes that should cut in. */
export function linear(t: number): number {
  return t;
}

/** Symmetric ease-in-out (3t² − 2t³). Good for ambient loops / breathing. */
export function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

/** Decelerate into rest. The default for arrivals / settles. */
export function easeOutQuad(t: number): number {
  return 1 - (1 - t) * (1 - t);
}

/** Stronger deceleration (weightier settle). */
export function easeOutCubic(t: number): number {
  const u = 1 - t;
  return 1 - u * u * u;
}

/**
 * Overshoot-and-settle. Peaks just past 1 then eases back — the "springy pop"
 * for scale punches (harvest/action). `overshoot` ≈ 1.70158 gives ~10% past 1.
 */
export function easeOutBack(t: number, overshoot = 1.70158): number {
  const c = overshoot + 1;
  const u = t - 1;
  return 1 + c * u * u * u + overshoot * u * u;
}

/**
 * Oscillating overshoot that rings down to 1. Reserve for rare celebration
 * moments — it reads as "wacky" if applied to every action. `period` ≈ 0.3.
 */
export function easeOutElastic(t: number, period = 0.3): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  const s = period / 4;
  return Math.pow(2, -10 * t) * Math.sin(((t - s) * (2 * Math.PI)) / period) + 1;
}
