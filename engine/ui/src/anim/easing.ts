/**
 * Easing functions for `@engine/ui` tweens.
 *
 * Each function maps a normalized time `t ∈ [0, 1]` to an output in `[0, 1]`.
 * They are pure, stateless, and importable individually to keep bundle size minimal.
 *
 * `linear` and `easeOutCubic` live in `@engine/core/animation` (the shared engine
 * curve library) and are re-exported here so `@engine/ui/anim`'s public surface is
 * unchanged. Only the cubic in/in-out curves below are UI-local (core lacks them).
 */
import { linear, easeOutCubic } from "@engine/core/animation";

export { linear, easeOutCubic };

/** An easing function: maps normalized time `t ∈ [0,1]` → output value `∈ [0,1]`. */
export type EaseFn = (t: number) => number;

/**
 * Ease-in cubic — slow at the start, accelerates toward the end.
 * `f(t) = t³`.
 */
export function easeInCubic(t: number): number {
  return t * t * t;
}

/**
 * Ease-in-out cubic — slow at both ends, fastest in the middle.
 * A symmetric S-curve.
 */
export function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}
