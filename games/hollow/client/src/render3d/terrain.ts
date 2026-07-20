/**
 * Ground relief (chunk hollow-09a) — a purely deterministic, low-amplitude
 * height field over the 64x64 town grid. NO randomness (no `Rng`, no
 * `Math.random`): the sim already owns the grid's authoritative (gx, gy)
 * layout, so the render side derives a fixed height per tile from a couple
 * of summed sine waves. Two identical calls with the same (gx, gy) always
 * return the same height — this is render-only geometry, never fed back
 * into the sim (see CLAUDE.md's sim/render boundary + determinism notes).
 *
 * Kept deliberately subtle ("gentle... cozy", per the brief) — the three
 * summed amplitudes (0.4 + 0.35 + 0.25 = 1.0) bound the output to [-1, 1]
 * world-space units, a small ripple against houses/agents sized in the 1-6
 * unit range (see household-layout.ts's `homeMeshFor`).
 */

const AMP_A = 0.4;
const AMP_B = 0.35;
const AMP_C = 0.25;

/** Deterministic terrain height (world-space z) at grid tile (gx, gy). Pure. */
export function groundHeightAt(gx: number, gy: number): number {
  const a = Math.sin(gx * 0.15) * AMP_A;
  const b = Math.sin(gy * 0.13 + 1.7) * AMP_B;
  const c = Math.sin((gx + gy) * 0.07) * AMP_C;
  return a + b + c;
}

/** The maximum possible magnitude of {@link groundHeightAt} — bounds-check helper. */
export const GROUND_HEIGHT_MAX_MAGNITUDE = AMP_A + AMP_B + AMP_C;
