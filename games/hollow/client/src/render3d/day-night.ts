/**
 * Day/night wash (chunk hollow-09a) — driven by the SIM CLOCK (`tick %
 * ticksPerDay`), never `Date.now()`/wall time, so every viewer of the same
 * sim state sees the same time of day. Purely a render concern: nothing
 * here is read back by the sim (see CLAUDE.md's sim/render boundary). The
 * app smooths this between snapshots by feeding a FRACTIONAL tick (the same
 * `prevTick + alpha * (nextTick - prevTick)` estimate used for agent
 * position interpolation, see `interp.ts`) rather than jumping once per
 * whole tick.
 */
import type { Vec3 } from "@engine/core/render3d";

export interface DayNightState {
  /** 0 = full night, 1 = full day (matches `Frame3d.dayNight`'s contract). */
  readonly dayNight: number;
  readonly sunDir: Vec3;
  readonly ambient: number;
}

const NIGHT_AMBIENT = 0.22;
const DAY_AMBIENT = 0.42;

/**
 * Length (in sim ticks) of ONE full visual day↔night cycle for the render
 * wash. **Deliberately decoupled from the sim's `ticksPerDay`** — the sim's
 * day is a compressed gameplay cadence (as short as 20 ticks), which at the
 * client's 20 Hz would strobe a full day every ~1 second. The atmosphere
 * cycle is a purely cosmetic render concern, so it runs on its own long
 * period: 1800 ticks ≈ 90 s at 20 Hz (≈45 s of daylight, 45 s of night).
 * Phase still derives from the (render-smoothed) sim tick, so any two
 * viewers of the same tick see the same time of day.
 */
export const RENDER_DAY_TICKS = 1800;

/** Fractional phase in `[0, 1)` through the current in-game day. Pure;
 *  accepts a fractional `tick` (render-clock-smoothed) as well as an
 *  integer one. Defensively returns 0 for a degenerate `ticksPerDay`. */
export function dayNightPhase(tick: number, ticksPerDay: number): number {
  if (ticksPerDay <= 0) return 0;
  const t = ((tick % ticksPerDay) + ticksPerDay) % ticksPerDay;
  return t / ticksPerDay;
}

/**
 * Derive the renderer's `dayNight`/`sunDir`/`ambient` triple from a day
 * phase in `[0, 1)`. `dayNight` follows a smooth single hump (0 at
 * midnight — phase 0 or 1 — up to 1 at noon, phase 0.5); `ambient` tracks it
 * linearly between a dim night floor and a bright day ceiling; `sunDir`
 * swings across the sky through the day (sunrise ~ phase 0.25, sunset ~
 * phase 0.75) and is held just above the horizon at night for a gentle glow
 * rather than going fully dark underneath the world.
 */
export function dayNightFromPhase(phase: number): DayNightState {
  const dayNight = 0.5 - 0.5 * Math.cos(phase * Math.PI * 2);
  const ambient = NIGHT_AMBIENT + (DAY_AMBIENT - NIGHT_AMBIENT) * dayNight;
  const angle = phase * Math.PI * 2 - Math.PI / 2;
  const sunDir: Vec3 = [Math.cos(angle) * 0.6, 0.5, Math.max(0.05, Math.sin(angle))];
  return { dayNight, ambient, sunDir };
}
