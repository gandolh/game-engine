import { createRng } from "@engine/core";
import type { FarmerSpec } from "../world-setup";

export interface BdiJitter {

  minGoldReserve: number;

  riskTolerance: number;

  beanValueFactor: number;
}

const KIND_BASE: Record<
  FarmerSpec["personality"],
  { riskTolerance: number; beanValueFactor: number }
> = {
  conservative: { riskTolerance: 0.0, beanValueFactor: 0.45 },
  hoarder:      { riskTolerance: 0.5, beanValueFactor: 0.9 },
  opportunist:  { riskTolerance: 0.7, beanValueFactor: 0.7 },
  aggressive:   { riskTolerance: 1.0, beanValueFactor: 0.95 },
  pip:          { riskTolerance: 0.5, beanValueFactor: 0.5 }, 
};

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function jitter(rng: ReturnType<typeof createRng>, spread: number): number {
  return rng.range(-spread, spread);
}

export function bakeBdiJitter(spec: FarmerSpec, seed: number): BdiJitter {

  const rng = createRng(seed).fork(`bdi:${spec.name}`);

  const base = KIND_BASE[spec.personality];

  const reserveJitter = 1 + jitter(rng, 0.3);
  const minGoldReserve = Math.max(0, Math.round(spec.minGoldReserve * reserveJitter));

  const riskTolerance = clamp(base.riskTolerance + jitter(rng, 0.15), 0, 1);

  const beanValueFactor = clamp(base.beanValueFactor + jitter(rng, 0.1), 0.05, 1);

  return { minGoldReserve, riskTolerance, beanValueFactor };
}
