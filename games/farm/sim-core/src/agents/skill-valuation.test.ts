/**
 * Skill-gated intention valuation (2026-07-16 brief) — pins the pure valuation
 * layer the personalities deliberate through: marginals rise with the tier in a
 * line (the divergence flywheel), affinity follows the owned-resource endowment,
 * temperament scales commitment, and the gather bias only fires for a leaning
 * farmer. The 100-day behavioural acceptance lives in the run-sim probe
 * (`probe-skill-diverge.ts`); these tests pin the mechanism.
 */
import { describe, it, expect } from "vitest";
import type { GameEntity } from "../components";
import {
  FARM_BASELINE_GPA,
  farmingMarginalValue,
  fishingMarginalValue,
  foragingMarginalValue,
  miningMarginalValue,
  nonFarmAffinity,
  nonFarmFocus,
  gatherBias,
  TEMPERAMENT,
  ENDOWMENT_THRESHOLD,
  NON_FARM_LINES,
} from "./skill-valuation";

/** Minimal farmer stub — skill-valuation reads only skills/beliefs/farmer.name. */
function stub(opts: {
  name?: string;
  skills?: Partial<Record<"farming" | "foraging" | "fishing" | "mining", number>>;
  day?: number;
  features?: Array<{ kind: string }>;
}): GameEntity {
  return {
    farmer: { name: opts.name ?? "Testa" },
    skills: { farming: 0, foraging: 0, fishing: 0, mining: 0, ...opts.skills },
    beliefs: {
      data: {
        currentDay: opts.day ?? 0,
        tileFeatures: opts.features ?? [],
      },
    },
  } as unknown as GameEntity;
}

const HIGH_XP = 10_000; // safely past the top SKILL_LEVEL_XP threshold

describe("baseline + marginals", () => {
  it("farm baseline g/AP is positive and finite", () => {
    expect(FARM_BASELINE_GPA).toBeGreaterThan(0);
    expect(Number.isFinite(FARM_BASELINE_GPA)).toBe(true);
  });

  it("every line's marginal RISES with xp in that line (the flywheel)", () => {
    const novice = stub({});
    expect(fishingMarginalValue(stub({ skills: { fishing: HIGH_XP } }))).toBeGreaterThan(
      fishingMarginalValue(novice),
    );
    expect(miningMarginalValue(stub({ skills: { mining: HIGH_XP } }))).toBeGreaterThan(
      miningMarginalValue(novice),
    );
    expect(foragingMarginalValue(stub({ skills: { foraging: HIGH_XP } }))).toBeGreaterThan(
      foragingMarginalValue(novice),
    );
    expect(farmingMarginalValue(stub({ skills: { farming: HIGH_XP } }))).toBeGreaterThan(
      farmingMarginalValue(novice),
    );
  });

  it("mining stays a support line: below the farmer's own farming marginal at equal tiers", () => {
    const equalTiers = stub({ skills: { farming: HIGH_XP, mining: HIGH_XP } });
    expect(miningMarginalValue(equalTiers)).toBeLessThan(farmingMarginalValue(equalTiers));
  });
});

describe("affinity from owned endowment", () => {
  const stones = (n: number) => Array.from({ length: n }, () => ({ kind: "stone" }));
  const bushes = (n: number) => Array.from({ length: n }, () => ({ kind: "bush" }));

  it("a stone-vein owner leans mining, a bush owner foraging", () => {
    expect(nonFarmAffinity(stub({ features: stones(ENDOWMENT_THRESHOLD) }))).toBe("mining");
    expect(nonFarmAffinity(stub({ features: bushes(ENDOWMENT_THRESHOLD) }))).toBe("foraging");
  });

  it("below the threshold, falls back to a deterministic name bucket", () => {
    const a = nonFarmAffinity(stub({ name: "Cora" }));
    expect(a).toBe(nonFarmAffinity(stub({ name: "Cora" }))); // stable
    expect(NON_FARM_LINES).toContain(a);
  });

  it("name buckets spread across the three lines over the roster", () => {
    const names = ["Cora", "Atticus", "Hannah", "Otto", "Pip", "Wren", "Silas", "Mabel", "Juno", "Felix"];
    const lines = new Set(names.map((n) => nonFarmAffinity(stub({ name: n }))));
    expect(lines.size).toBeGreaterThan(1);
  });
});

describe("temperament + focus", () => {
  it("TEMPERAMENT covers every AI personality kind (registry side-effect imports in sim-bootstrap)", () => {
    // The four base kinds every AI farmer dispatches through; Pip deliberates by hand.
    for (const kind of ["conservative", "aggressive", "hoarder", "opportunist"]) {
      expect(TEMPERAMENT[kind], `missing temperament for ${kind}`).toBeDefined();
    }
  });

  it("commit rises with skill tier for the same farmer/temperament", () => {
    const feats = Array.from({ length: ENDOWMENT_THRESHOLD }, () => ({ kind: "stone" }));
    const low = nonFarmFocus(stub({ features: feats }), TEMPERAMENT.opportunist!);
    const high = nonFarmFocus(
      stub({ features: feats, skills: { mining: HIGH_XP } }),
      TEMPERAMENT.opportunist!,
    );
    expect(high).not.toBeNull();
    if (low !== null) expect(high!.commit).toBeGreaterThan(low.commit);
  });

  it("a stronger diversifier commits at least as hard as a weaker one", () => {
    const farmer = () => stub({ features: [{ kind: "stone" }, { kind: "stone" }, { kind: "stone" }], skills: { mining: HIGH_XP } });
    const cons = nonFarmFocus(farmer(), TEMPERAMENT.conservative!);
    const opp = nonFarmFocus(farmer(), TEMPERAMENT.opportunist!);
    expect(opp).not.toBeNull();
    expect(opp!.commit).toBeGreaterThanOrEqual(cons?.commit ?? 0);
  });

  it("chaseBest evaluates all lines: a fishing-skilled opportunist leans fishing despite a stone affinity", () => {
    const f = stub({
      features: Array.from({ length: ENDOWMENT_THRESHOLD }, () => ({ kind: "stone" })),
      skills: { fishing: HIGH_XP },
    });
    const focus = nonFarmFocus(f, TEMPERAMENT.opportunist!);
    expect(focus).not.toBeNull();
    expect(focus!.line).toBe("fishing");
  });
});

describe("gatherBias", () => {
  it("no lean → caller's base cadence untouched", () => {
    expect(gatherBias(null, 1, 8)).toEqual({ maxActions: 1, priority: 8 });
  });

  it("a fishing lean does not distort the gather cadence", () => {
    const bias = gatherBias({ line: "fishing", commit: 1, marginal: 9, ratio: 1.5 }, 1, 8);
    expect(bias).toEqual({ maxActions: 1, priority: 8 });
  });

  it("a mining lean boosts the cap, front-shifts priority, and prefers stone", () => {
    const bias = gatherBias({ line: "mining", commit: 1, marginal: 9, ratio: 1.5 }, 1, 8);
    expect(bias.maxActions).toBeGreaterThan(1);
    expect(bias.priority).toBeLessThan(8);
    expect(bias.preferKind).toBe("stone");
  });

  it("a foraging lean prefers bushes", () => {
    expect(gatherBias({ line: "foraging", commit: 0.5, marginal: 9, ratio: 1.2 }, 1, 8).preferKind).toBe("bush");
  });
});
