import { createRng } from "@engine/core";
import type { FarmerSpec } from "../world-setup";

/**
 * Per-agent BDI jitter (todo: randomize-agent-bdi).
 *
 * Same-`kind` farmers behaved identically because every procedural farm got the
 * kind default and the 5 named farmers shared hand-tuned constants. This bakes a
 * small per-agent jitter on three SCALAR knobs ONCE at spawn — never re-derived
 * per tick (that would thrash intentions) and never reorders the intention queue
 * (same decision structure, shifted thresholds).
 *
 * Determinism: each agent gets its OWN rng derived solely from `(seed, name)`, so
 * adding/removing/reordering a farmer never shifts another agent's draws and never
 * perturbs any tick-time RNG stream. Bases preserve each farmer's character — a
 * named farmer's hand-tuned values are the CENTER of its jitter.
 */

export interface BdiJitter {
  /** Gold a farmer keeps in reserve before discretionary spend. */
  minGoldReserve: number;
  /** Continuous risk knob ∈ [0,1] augmenting the 3-level riskProfile. */
  riskTolerance: number;
  /** Fraction of a golden bean's expected resale this agent will bid ∈ (0,1]. */
  beanValueFactor: number;
}

/** Per-kind base values for the two knobs that live only as code literals today. */
const KIND_BASE: Record<
  FarmerSpec["personality"],
  { riskTolerance: number; beanValueFactor: number }
> = {
  conservative: { riskTolerance: 0.0, beanValueFactor: 0.45 },
  hoarder:      { riskTolerance: 0.5, beanValueFactor: 0.9 },
  opportunist:  { riskTolerance: 0.7, beanValueFactor: 0.7 },
  aggressive:   { riskTolerance: 1.0, beanValueFactor: 0.95 },
  pip:          { riskTolerance: 0.5, beanValueFactor: 0.5 }, // player; unused by sim deliberation
};

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** A signed jitter in [-spread, +spread). */
function jitter(rng: ReturnType<typeof createRng>, spread: number): number {
  return rng.range(-spread, spread);
}

/**
 * Bake the per-agent BDI knobs. `seed` is the run seed; the agent's stream is
 * derived from `(seed, spec.name)` only, independent of spawn order.
 */
export function bakeBdiJitter(spec: FarmerSpec, seed: number): BdiJitter {
  // Independent of iteration order: hash the name into a fresh stream off the run
  // seed. createRng().fork(label) advances only the throwaway base, never a live
  // sim stream.
  const rng = createRng(seed).fork(`bdi:${spec.name}`);

  const base = KIND_BASE[spec.personality];

  // reserve ±30% around the spec's base (named farmers keep their hand-tuned center).
  const reserveJitter = 1 + jitter(rng, 0.3);
  const minGoldReserve = Math.max(0, Math.round(spec.minGoldReserve * reserveJitter));

  // riskTolerance ±0.15, clamped to [0,1].
  const riskTolerance = clamp(base.riskTolerance + jitter(rng, 0.15), 0, 1);

  // beanValueFactor ±0.1, clamped to (0,1].
  const beanValueFactor = clamp(base.beanValueFactor + jitter(rng, 0.1), 0.05, 1);

  return { minGoldReserve, riskTolerance, beanValueFactor };
}
