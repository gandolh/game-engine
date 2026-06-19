
import { describe, it, expect } from "vitest";
import { bakeBdiJitter } from "./bdi-jitter";
import type { FarmerSpec } from "../world-setup";

const SEED = 0x5eed_face;

function specOf(name: string, kind: FarmerSpec["personality"], reserve: number): FarmerSpec {
  return {
    name,
    personality: kind,
    homeRegion: "farm-0" as FarmerSpec["homeRegion"],
    homeX: 0,
    homeY: 0,
    startGold: 100,
    riskProfile: "medium",
    minGoldReserve: reserve,
    startSeeds: {},
  };
}

describe("bakeBdiJitter", () => {
  it("is deterministic on (seed, name)", () => {
    const s = specOf("Cora-7", "conservative", 30);
    expect(bakeBdiJitter(s, SEED)).toEqual(bakeBdiJitter(s, SEED));
  });

  it("is independent of spawn order — depends only on name", () => {
    const a = specOf("Atticus-3", "aggressive", 10);

    bakeBdiJitter(specOf("Cora-0", "conservative", 30), SEED);
    bakeBdiJitter(specOf("Hannah-1", "hoarder", 80), SEED);
    expect(bakeBdiJitter(a, SEED)).toEqual(bakeBdiJitter(a, SEED));
  });

  it("same-kind agents diverge", () => {
    const a = bakeBdiJitter(specOf("Atticus-1", "aggressive", 10), SEED);
    const b = bakeBdiJitter(specOf("Atticus-2", "aggressive", 10), SEED);

    const diverged =
      a.minGoldReserve !== b.minGoldReserve ||
      a.riskTolerance !== b.riskTolerance ||
      a.beanValueFactor !== b.beanValueFactor;
    expect(diverged).toBe(true);
  });

  it("knobs stay in valid ranges", () => {
    for (const kind of ["conservative", "hoarder", "opportunist", "aggressive"] as const) {
      for (let i = 0; i < 20; i++) {
        const j = bakeBdiJitter(specOf(`${kind}-${i}`, kind, 50), SEED);
        expect(j.minGoldReserve).toBeGreaterThanOrEqual(0);
        expect(j.riskTolerance).toBeGreaterThanOrEqual(0);
        expect(j.riskTolerance).toBeLessThanOrEqual(1);
        expect(j.beanValueFactor).toBeGreaterThan(0);
        expect(j.beanValueFactor).toBeLessThanOrEqual(1);
      }
    }
  });

  it("centres jitter on the kind base — mean of many agents ≈ base", () => {
    let sumRisk = 0;
    const N = 400;
    for (let i = 0; i < N; i++) {
      sumRisk += bakeBdiJitter(specOf(`hoarder-${i}`, "hoarder", 80), SEED).riskTolerance;
    }

    expect(Math.abs(sumRisk / N - 0.5)).toBeLessThan(0.03);
  });
});
