/**
 * Needs / decay — a generic depleting-need component and the per-tick decay
 * system that drains it. A "need" is a bounded scalar that falls a fixed amount
 * each tick and is topped back up by gameplay (eating, resting, praying, …).
 * Games read `needFraction`/`needIsDepleted` to drive behavior and consequences.
 *
 * A depleting resource with a bounded value and a per-tick drain — a fresh,
 * reusable primitive the engine owns for games that model needs (as opposed to
 * accumulating progress like XP, which grows rather than depletes).
 */

/** One bounded, depleting need. */
export interface Need {
  value: number;
  min: number;
  max: number;
  /** Amount removed from `value` per tick of decay (>= 0). */
  decayPerTick: number;
}

/** A bag of named needs carried by an agent (component). */
export interface Needs {
  byKind: Record<string, Need>;
}

export interface MakeNeedOptions {
  /** Starting value. Defaults to `max`. */
  value?: number;
  min?: number;
  max?: number;
  decayPerTick?: number;
}

export function makeNeed(opts: MakeNeedOptions = {}): Need {
  const min = opts.min ?? 0;
  const max = opts.max ?? 100;
  const value = clamp(opts.value ?? max, min, max);
  const decayPerTick = opts.decayPerTick ?? 0;
  return { value, min, max, decayPerTick };
}

/** Drain a need by `decayPerTick * ticks`, clamped to `min`. Mutates `need`. */
export function decayNeed(need: Need, ticks = 1): void {
  need.value = clamp(need.value - need.decayPerTick * ticks, need.min, need.max);
}

/** Top a need up by `amount`, clamped to `max`. Mutates `need`. */
export function replenishNeed(need: Need, amount: number): void {
  need.value = clamp(need.value + amount, need.min, need.max);
}

/** 0..1 position of the need's value within its range. */
export function needFraction(need: Need): number {
  const span = need.max - need.min;
  if (span <= 0) return 0;
  return (need.value - need.min) / span;
}

/** True once the need has bottomed out. */
export function needIsDepleted(need: Need): boolean {
  return need.value <= need.min;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
