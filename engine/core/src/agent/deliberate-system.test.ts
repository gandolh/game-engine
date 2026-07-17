import { describe, it, expect } from "vitest";
import { World, type EngineEntity } from "../ecs";
import { createPersonalityRegistry } from "./registry";
import { createDeliberateSystem } from "./deliberate-system";

interface TestAgent extends EngineEntity {
  player?: boolean;
}

function agent(kind: string, state: string, extra: Partial<TestAgent> = {}): TestAgent {
  return {
    fsm: { current: state, enteredTick: 0 },
    personality: { kind },
    intentions: { queue: [] },
    beliefs: { data: {}, revision: 0 },
    desires: { data: {} },
    ...extra,
  };
}

describe("createDeliberateSystem", () => {
  it("dispatches by kind and advances PERCEIVE → ACT", () => {
    const world = new World<TestAgent>();
    const reg = createPersonalityRegistry<TestAgent>();
    reg.register("worker", (a, ctx) => {
      a.intentions!.queue.push({ kind: "work", data: { at: ctx.tick }, priority: 1 });
    });
    const a = world.spawn(agent("worker", "PERCEIVE"));
    const sys = createDeliberateSystem(world, {
      registry: reg,
      perceiveState: "PERCEIVE",
      actState: "ACT",
    });

    sys.run({ tick: 5 });

    expect(a.fsm!.current).toBe("ACT");
    expect(a.intentions!.queue).toHaveLength(1);
    expect(a.intentions!.queue[0]!.data).toEqual({ at: 5 });
  });

  it("clears the intention queue when no deliberator is registered", () => {
    const world = new World<TestAgent>();
    const reg = createPersonalityRegistry<TestAgent>();
    const a = world.spawn(agent("unknown", "PERCEIVE"));
    a.intentions!.queue.push({ kind: "stale", data: {}, priority: 1 });
    const sys = createDeliberateSystem(world, {
      registry: reg,
      perceiveState: "PERCEIVE",
      actState: "ACT",
    });

    sys.run({ tick: 1 });

    expect(a.intentions!.queue).toHaveLength(0);
    expect(a.fsm!.current).toBe("ACT");
  });

  it("ignores agents not in the perceive state", () => {
    const world = new World<TestAgent>();
    const reg = createPersonalityRegistry<TestAgent>();
    let ran = false;
    reg.register("worker", () => {
      ran = true;
    });
    const a = world.spawn(agent("worker", "ACT"));
    const sys = createDeliberateSystem(world, {
      registry: reg,
      perceiveState: "PERCEIVE",
      actState: "ACT",
    });

    sys.run({ tick: 1 });

    expect(ran).toBe(false);
    expect(a.fsm!.current).toBe("ACT");
  });

  it("honors shouldSkip (e.g. the human player)", () => {
    const world = new World<TestAgent>();
    const reg = createPersonalityRegistry<TestAgent>();
    let ran = false;
    reg.register("worker", () => {
      ran = true;
    });
    const a = world.spawn(agent("worker", "PERCEIVE", { player: true }));
    const sys = createDeliberateSystem(world, {
      registry: reg,
      perceiveState: "PERCEIVE",
      actState: "ACT",
      shouldSkip: (ag) => (ag as TestAgent).player === true,
    });

    sys.run({ tick: 1 });

    expect(ran).toBe(false);
    // skipped agents stay in PERCEIVE (never advanced)
    expect(a.fsm!.current).toBe("PERCEIVE");
  });
});
