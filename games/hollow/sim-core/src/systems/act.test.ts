/**
 * Real-structure tests for `HollowActSystem`'s chunk-hollow-06a addition:
 * the `material` skill's yield bonus + practice wiring in `runWork` (see
 * this file's own header comment and social/constants.ts's `SKILL_YIELD_
 * BONUS`/`PRACTICE_RATE` derivations). Mirrors world/resources.test.ts's
 * and community/dynamics.test.ts's "drive the real production class over a
 * hand-built World" harness pattern.
 */
import { describe, it, expect } from "vitest";
import { World, createRng, type SimContext } from "@engine/core";
import { makeNeed } from "@engine/core/agent";
import type { HollowEntity, Genome } from "../components";
import { NEED_WEALTH, MATERIAL_HARVEST_PER_TICK, WEALTH_PER_MATERIAL_UNIT } from "../economy";
import { ResourceWorld } from "../world";
import { HollowActSystem } from "./act";

type Agent = HollowEntity & { id: number };

function flatGenome(materialAptitude: number): Genome {
  return {
    behavior: {},
    aptitude: { food: 0, material: materialAptitude },
    appearance: { height: 1, build: 1, skinTone: "skin", hairTone: "hairBlack" },
  };
}

/** A worker standing exactly on a material node (no travel needed), with a
 *  `wealth` need whose `max` is deliberately huge so it never caps out
 *  within a test's tick budget — that would otherwise pop the `work`
 *  intention and stop practice, since nothing here re-arms/re-plans
 *  (that's PerceiveSystem/DeliberateSystem's job, out of scope for this
 *  isolated-system test). */
function spawnWorker(
  world: World<HollowEntity>,
  nodeId: number,
  gx: number,
  gy: number,
  skillLevel: number,
  aptitude: number,
): Agent {
  return world.spawn({
    agent: { gx, gy, moveTarget: null },
    needs: { byKind: { [NEED_WEALTH]: makeNeed({ value: 0, max: 1_000_000, decayPerTick: 0 }) } },
    inventory: { goods: {} },
    fsm: { current: "ACT", enteredTick: 0 },
    intentions: { queue: [{ kind: "work", data: { nodeId }, priority: 10 }] },
    skills: { byKind: { food: 0, material: skillLevel } },
    genome: flatGenome(aptitude),
  } satisfies HollowEntity) as Agent;
}

describe("HollowActSystem's runWork: material skill -> production wiring (chunk hollow-06a)", () => {
  it("a higher-skill agent harvests strictly more materials per work tick than a zero-skill agent, holding the node constant", () => {
    const resources = new ResourceWorld(createRng(1), {
      foodNodeCount: 0,
      materialNodeCount: 2,
      foodNodeMaxStock: 0,
      foodNodeRegenPerTick: 0,
      materialNodeMaxStock: 1_000_000,
      materialNodeRegenPerTick: 0,
    });
    const [nodeA, nodeB] = resources.nodes;
    const world = new World<HollowEntity>();
    const act = new HollowActSystem(world, resources);

    const zeroSkill = spawnWorker(world, nodeA!.id, nodeA!.gx, nodeA!.gy, 0, 1);
    const highSkill = spawnWorker(world, nodeB!.id, nodeB!.gx, nodeB!.gy, 1, 1);

    act.run({ tick: 0 } as SimContext);

    const zeroWealth = zeroSkill.needs!.byKind[NEED_WEALTH]!.value;
    const highWealth = highSkill.needs!.byKind[NEED_WEALTH]!.value;
    // Both start at wealth 0; the tick's replenishment IS `harvested *
    // WEALTH_PER_MATERIAL_UNIT` (runWork immediately converts the harvest
    // into need-replenishment, see act.ts), so comparing wealth after one
    // tick is exactly comparing harvested amounts.
    expect(highWealth).toBeGreaterThan(zeroWealth);
    // Exact expected values (not just "greater than") -- proves the precise
    // SKILL_YIELD_BONUS wiring, not an accidental difference.
    expect(zeroWealth).toBeCloseTo(MATERIAL_HARVEST_PER_TICK * WEALTH_PER_MATERIAL_UNIT, 6);
    expect(highWealth).toBeCloseTo(MATERIAL_HARVEST_PER_TICK * 1.5 * WEALTH_PER_MATERIAL_UNIT, 6);
  });

  it("practice raises the material skill toward its aptitude cap over several work ticks, and never overshoots the cap", () => {
    const resources = new ResourceWorld(createRng(2), {
      foodNodeCount: 0,
      materialNodeCount: 1,
      foodNodeMaxStock: 0,
      foodNodeRegenPerTick: 0,
      materialNodeMaxStock: 1_000_000,
      materialNodeRegenPerTick: 0,
    });
    const node = resources.nodes[0]!;
    const world = new World<HollowEntity>();
    const act = new HollowActSystem(world, resources);

    const cap = 0.6;
    const worker = spawnWorker(world, node.id, node.gx, node.gy, 0, cap);

    let previous = 0;
    for (let tick = 0; tick < 100; tick++) {
      act.run({ tick } as SimContext);
      const current = worker.skills!.byKind["material"]!;
      expect(current).toBeGreaterThanOrEqual(previous); // monotonically non-decreasing
      expect(current).toBeLessThanOrEqual(cap); // never exceeds the aptitude cap
      previous = current;
    }
    // Real progress happened, and it's converged close to (but not past) the cap.
    expect(previous).toBeGreaterThan(0.5);
    expect(previous).toBeLessThanOrEqual(cap);
  });

  it("an agent with no genome falls back to GENE_MAX as its practice cap and to zero skill bonus (defensive, not a throw)", () => {
    const resources = new ResourceWorld(createRng(3), {
      foodNodeCount: 0,
      materialNodeCount: 1,
      foodNodeMaxStock: 0,
      foodNodeRegenPerTick: 0,
      materialNodeMaxStock: 1_000_000,
      materialNodeRegenPerTick: 0,
    });
    const node = resources.nodes[0]!;
    const world = new World<HollowEntity>();
    const act = new HollowActSystem(world, resources);

    const worker = world.spawn({
      agent: { gx: node.gx, gy: node.gy, moveTarget: null },
      needs: { byKind: { [NEED_WEALTH]: makeNeed({ value: 0, max: 1_000_000, decayPerTick: 0 }) } },
      inventory: { goods: {} },
      fsm: { current: "ACT", enteredTick: 0 },
      intentions: { queue: [{ kind: "work", data: { nodeId: node.id }, priority: 10 }] },
      // No `skills`, no `genome` -- pre-hollow-06a hand-built entity shape.
    } satisfies HollowEntity) as Agent;

    expect(() => act.run({ tick: 0 } as SimContext)).not.toThrow();
    const wealth = worker.needs!.byKind[NEED_WEALTH]!.value;
    expect(wealth).toBeCloseTo(MATERIAL_HARVEST_PER_TICK * WEALTH_PER_MATERIAL_UNIT, 6); // no skill bonus without a `skills` component
  });
});
