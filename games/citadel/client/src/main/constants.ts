/**
 * Citadel main/ split (brief 114): module-scope constants shared across the boot sequence,
 * the sim client wiring, and the render loop. Moved verbatim out of main.ts — no value changes.
 */
export const SEED = 0x1a2b3c4d;
/**
 * Sim ticks per in-game day. Matches Farm Valley's day length (1200 ticks ≈ 60 s
 * of real time at 1×, since the worker paces 20 ticks/s) so a Citadel day reads as
 * the same watchable rhythm instead of the old ~1 s/day blur (20 ticks). This is
 * the sim's true day denominator: per-tick rate constants re-scale off it via
 * `scaleTicks`/`BASELINE_TICKS_PER_DAY` in @citadel/sim-core, so per-DAY outcomes
 * (production, growth, raid cadence) are unchanged — only the day is longer.
 */
export const TICKS_PER_DAY = 1200;
/**
 * Render-only day/night wash period (ticks) — kept independent of the sim day.
 * A gentle ~1800-tick (~90 s at 1×) cosmetic cycle so the map colour eases through
 * dawn→dusk→night. Now close to the 60 s sim day but deliberately still its own
 * constant. Purely cosmetic — never touches the sim or determinism.
 */
export const VISUAL_DAY_TICKS = 1800;
