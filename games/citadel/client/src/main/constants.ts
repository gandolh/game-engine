/**
 * Citadel main/ split (brief 114): module-scope constants shared across the boot sequence,
 * the sim client wiring, and the render loop. Moved verbatim out of main.ts — no value changes.
 */
export const SEED = 0x1a2b3c4d;
export const TICKS_PER_DAY = 20;
/**
 * Render-only day/night wash period (ticks). The sim day is very short
 * (TICKS_PER_DAY=20 ≈ 1 s of real time at 1× → the tint would strobe), so the
 * atmospheric wash is decoupled onto a much slower visual cycle: ~1800 ticks ≈
 * 90 s at 1× speed, so the map colour eases gently through dawn→dusk→night.
 * Purely cosmetic — never touches the sim or determinism.
 */
export const VISUAL_DAY_TICKS = 1800;
