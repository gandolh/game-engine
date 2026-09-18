/**
 * audit-49 — `admissionPolicy` is a BINDING norm, not a decoration.
 *
 * Hollow's communities vote on three norms. Two steered behaviour (`shareRate` →
 * `expectedContribution`, `cooperationExpectation` → `cooperationMultiplier`); the third had
 * **zero production reads** — `grep -rnw admissionPolicy` returned only writes and type
 * declarations. So a community could vote itself fully closed and still admit anyone, while the
 * wiki and the inspect panel advertised three votable norms.
 *
 * That is worse than the feature being absent. Hollow is described as a research instrument, and a
 * researcher reading `NORM_CHANGED` out of the chronicle would have drawn causal conclusions from a
 * number with no causal effect.
 *
 * These tests are the acceptance the brief asked for: two communities, the SAME seed and the SAME
 * trust history, admitting at measurably different rates purely because their norms differ.
 */
import { describe, it, expect } from "vitest";
import { World, MessageBus, type SimContext } from "@engine/core";
import { makeNeed } from "@engine/core/agent";
import type { HollowEntity } from "../components";
import { NEED_BELONGING } from "../economy";
import { CommunityRegistry } from "./registry";
import { HollowTrustAccrualSystem } from "./trust-accrual-system";
import { HollowCommunitySystem } from "./crystallize-system";
import {
  admissionJoinThreshold,
  COMMUNITY_DEFAULT_ADMISSION_POLICY,
  COMMUNITY_JOIN_TRUST_THRESHOLD,
  COMMUNITY_LEAVE_TRUST_THRESHOLD,
  COMMUNITY_ADMISSION_OPEN_THRESHOLD,
  COMMUNITY_ADMISSION_CLOSED_THRESHOLD,
} from "./constants";

const TEST_TICKS_PER_DAY = 20;

function spawnAgent(world: World<HollowEntity>, gx: number, gy: number): HollowEntity & { id: number } {
  return world.spawn({
    agent: { gx, gy, moveTarget: null },
    needs: { byKind: { [NEED_BELONGING]: makeNeed({ value: 50, decayPerTick: 0 }) } },
    inventory: { goods: {} },
    intentions: { queue: [] },
    relationships: { byId: new Map() },
    communityId: null,
  } satisfies HollowEntity) as HollowEntity & { id: number };
}

/**
 * One community of `founders` co-located agents plus `newcomers` standing with them, run for
 * `ticks`. Returns how many newcomers were admitted. Everything about the two runs is identical
 * except `admissionPolicy`.
 */
function admittedUnderPolicy(admissionPolicy: number | undefined): number {
  const world = new World<HollowEntity>();
  const bus = new MessageBus();
  const registry = new CommunityRegistry();
  const trust = new HollowTrustAccrualSystem(world, { ticksPerDay: TEST_TICKS_PER_DAY });
  const community = new HollowCommunitySystem(world, registry, bus, { checkIntervalTicks: 50 });

  const founders = [0, 1, 2, 3].map(() => spawnAgent(world, 5, 5));
  // Newcomers start FAR AWAY so they are genuinely unaffiliated when the founders crystallize —
  // otherwise they join at FORM and the GROW pass (the only consumer of the norm) never runs on
  // them, which is exactly the trap the first draft of this test fell into.
  // ...and SEPARATED from each other too, so they cannot crystallize a community among
  // themselves and must be admitted to the founders' one or stay unaffiliated.
  // TWO of them, not three: COMMUNITY_MIN_SIZE is 3, so three co-located newcomers would
  // crystallize their OWN community via FORM and then MERGE into the founders' — bypassing GROW,
  // the only pass that consults the norm. Two can only be admitted or stay out.
  const newcomers = [[40, 10], [10, 40]].map(([x, y]) => spawnAgent(world, x!, y!));

  let tick = 0;
  const step = (): void => {
    const ctx: SimContext = { tick };
    trust.run(ctx);
    community.run(ctx);
    bus.flush();
    bus.notifySubscribers();
    tick++;
    for (const c of registry.all()) {
      if (admissionPolicy !== undefined) c.norms.admissionPolicy = admissionPolicy;
    }
  };

  // Phase 1: the founders form a community; the newcomers are elsewhere.
  for (let i = 0; i < 300; i++) step();
  expect(registry.all().length).toBeGreaterThan(0);
  expect(newcomers.every((n) => n.communityId === null)).toBe(true);
  expect(founders.every((f) => f.communityId !== null)).toBe(true);

  // Phase 2: the newcomers move in and build trust. Only GROW can admit them now.
  for (const n of newcomers) n.agent!.gx = 5, n.agent!.gy = 5;
  for (let i = 0; i < 900; i++) step();

  return newcomers.filter((n) => n.communityId !== null).length;
}

describe("admissionJoinThreshold — the norm→threshold dial", () => {
  it("the DEFAULT policy returns the unchanged join threshold, exactly", () => {
    // The hinge. A community that never voted its norm away from neutral must behave precisely as
    // it did before this coupling existed — which is what confines the re-baselining to the
    // mechanism actually under test.
    expect(admissionJoinThreshold(COMMUNITY_DEFAULT_ADMISSION_POLICY))
      .toBe(COMMUNITY_JOIN_TRUST_THRESHOLD);
  });

  it("fully open demands the least trust, fully closed the most", () => {
    expect(admissionJoinThreshold(0)).toBe(COMMUNITY_ADMISSION_OPEN_THRESHOLD);
    expect(admissionJoinThreshold(1)).toBe(COMMUNITY_ADMISSION_CLOSED_THRESHOLD);
    expect(admissionJoinThreshold(0)).toBeLessThan(admissionJoinThreshold(1));
  });

  it("never dips below the LEAVE threshold — the hysteresis invariant", () => {
    // If a voted-open community could admit below the leave bar, an agent would join one pass and
    // defect the next, forever. The join bar sitting above the leave bar is deliberate slack, and
    // a norm must not be able to vote it away.
    for (let i = 0; i <= 100; i++) {
      expect(admissionJoinThreshold(i / 100)).toBeGreaterThanOrEqual(COMMUNITY_LEAVE_TRUST_THRESHOLD);
    }
  });

  it("is monotonically non-decreasing in the policy", () => {
    let prev = -Infinity;
    for (let i = 0; i <= 100; i++) {
      const v = admissionJoinThreshold(i / 100);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });

  it("clamps out-of-range policies rather than extrapolating", () => {
    expect(admissionJoinThreshold(-5)).toBe(admissionJoinThreshold(0));
    expect(admissionJoinThreshold(99)).toBe(admissionJoinThreshold(1));
  });
});

describe("the norm is BINDING: same seed, different admission rates", () => {
  it("a fully CLOSED community admits strictly fewer newcomers than a fully OPEN one", () => {
    // THE acceptance test. Identical world, identical trust history, identical tick count — the
    // ONLY difference is the voted norm.
    const open = admittedUnderPolicy(0);
    const closed = admittedUnderPolicy(1);

    expect(open).toBeGreaterThan(closed);
    expect(closed).toBe(0); // "fully closed" must actually close
  });

  it("a community that voted itself CLOSED admits fewer than one left at the default", () => {
    expect(admittedUnderPolicy(1)).toBeLessThan(admittedUnderPolicy(undefined));
  });

  it("leaving the norm at its default reproduces the pre-coupling behaviour exactly", () => {
    // The no-op guarantee, measured rather than argued: an explicit default and no norm at all
    // must admit the same agents.
    expect(admittedUnderPolicy(COMMUNITY_DEFAULT_ADMISSION_POLICY)).toBe(admittedUnderPolicy(undefined));
  });

  it("is deterministic — the same policy gives the same count every run", () => {
    for (const p of [0, 0.5, 1]) {
      expect(admittedUnderPolicy(p)).toBe(admittedUnderPolicy(p));
    }
  });
});
