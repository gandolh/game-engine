/**
 * Day/night wash (chunk hollow-09a, resynced to the sim day by chunk
 * hollow-14d) — driven by the SIM CLOCK (`tick % ticksPerDay`), never
 * `Date.now()`/wall time, so every viewer of the same sim state sees the
 * same time of day. Purely a render concern: nothing here is read back by
 * the sim (see CLAUDE.md's sim/render boundary). The app smooths this
 * between snapshots by feeding a FRACTIONAL tick (the same `prevTick +
 * alpha * (nextTick - prevTick)` estimate used for agent position
 * interpolation, see `interp.ts`) rather than jumping once per whole tick.
 *
 * Chunk hollow-14d's payoff: {@link simDayPhaseWash} maps the SIM's own
 * `dayPhase` (commute/work/gather/sleep — `@hollow/sim-core/world`) onto this
 * module's wash `phase` so dusk visibly coincides with agents converging on
 * the glowing hearth at GATHER, and it's properly dark by SLEEP — see that
 * function's doc. This REPLACES the old `RENDER_DAY_TICKS`-driven decoupled
 * cosmetic cycle (a fixed long period unrelated to the sim's own day-phase
 * boundaries, which pre-14d made dusk never actually line up with the
 * gather phase) — `dayNightPhase`/`dayNightFromPhase` below stay as generic,
 * independently-tested primitives; `simDayPhaseWash` is what `app.ts` now
 * calls for the real per-frame wash.
 */
import type { Vec3 } from "@engine/core/render3d";
import { dayPhase, type DayPhase } from "@hollow/sim-core/world";

export interface DayNightState {
  /** 0 = full night, 1 = full day (matches `Frame3d.dayNight`'s contract). */
  readonly dayNight: number;
  readonly sunDir: Vec3;
  readonly ambient: number;
}

const NIGHT_AMBIENT = 0.22;
const DAY_AMBIENT = 0.42;

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

// ---------------------------------------------------------------------------
// Sim-day-synced wash (chunk hollow-14d)
// ---------------------------------------------------------------------------

/**
 * Where each sim day-phase (`@hollow/sim-core/world`'s `dayPhase`,
 * commute/work/gather/sleep) STARTS in `dayNightFromPhase`'s wash-phase space
 * (0 = midnight, 0.5 = noon), and how much wash-phase range it sweeps
 * through (`WASH_PHASE_WIDTH`) over its own `fractionThroughPhase`.
 *
 * Deliberately NOT the same proportions as the sim's own
 * `DAY_PHASE_BOUNDARIES` (commute .15 / work .55 / gather .2 / sleep .1 of
 * the day) — these are hand-tuned against `dayNightFromPhase`'s cosine hump
 * (`dayNight < ~0.15` only for wash-phase within roughly `[0.877, 1) ∪ [0,
 * 0.123)`, a narrow trough around midnight) so: WORK (`[0.40, 0.63]`) stays
 * comfortably bright (`dayNight` never drops below ~0.84 — it straddles
 * noon); GATHER (`[0.63, 0.88]`) sweeps DOWN from that brightness to
 * genuinely dark (`dayNight` ~0.14) by its END; and SLEEP (`[0.88, 1.12 ≡
 * 0.12]`) sits entirely inside the dark trough — the payoff this chunk
 * exists for: the sky visibly darkens exactly as agents converge on the
 * glowing hearth for GATHER, and it's genuinely night, not just dim, for the
 * whole of SLEEP. The four spans are contiguous and sum to exactly 1 (each
 * phase's end anchor equals the next phase's start anchor, mod 1), so the
 * wash never jumps at a phase boundary — verified by day-night.test.ts.
 */
const WASH_PHASE_ANCHOR: Readonly<Record<DayPhase, number>> = {
  commute: 0.12,
  work: 0.4,
  gather: 0.63,
  sleep: 0.88,
};
const WASH_PHASE_WIDTH: Readonly<Record<DayPhase, number>> = {
  commute: 0.28,
  work: 0.23,
  gather: 0.25,
  sleep: 0.24,
};

/**
 * The wash `phase` (feed straight into {@link dayNightFromPhase}) for a raw
 * sim `tick` at the sim's own `ticksPerDay` — reuses the SIM's `dayPhase`
 * (`@hollow/sim-core/world`, the same clock hollow-14b's job shifts and
 * hollow-14c's hearth gating run on) so render and sim agree on which phase
 * is "now", then remaps that phase's `fractionThroughPhase` onto the
 * {@link WASH_PHASE_ANCHOR}/{@link WASH_PHASE_WIDTH} table above. Pure —
 * accepts a fractional (render-clock-smoothed) tick; degenerate `ticksPerDay`
 * defers to `dayPhase`'s own documented `"commute"`/fraction-0 fallback.
 * This is what `app.ts` calls for the real per-frame wash (never fed back
 * into the sim — see this module's header).
 */
export function simDayPhaseWash(tick: number, ticksPerDay: number): number {
  const { phase, fractionThroughPhase } = dayPhase(tick, ticksPerDay);
  const wash = WASH_PHASE_ANCHOR[phase] + fractionThroughPhase * WASH_PHASE_WIDTH[phase];
  return ((wash % 1) + 1) % 1;
}
