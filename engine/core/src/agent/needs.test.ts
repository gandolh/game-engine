import { describe, it, expect } from "vitest";
import { World, type EngineEntity } from "../ecs";
import {
  makeNeed,
  decayNeed,
  replenishNeed,
  needFraction,
  needIsDepleted,
  type Needs,
} from "./needs";
import { createNeedsDecaySystem } from "./needs-decay-system";

describe("needs primitives", () => {
  it("makeNeed defaults value to max and 0..100 range", () => {
    const n = makeNeed({ decayPerTick: 2 });
    expect(n).toEqual({ value: 100, min: 0, max: 100, decayPerTick: 2 });
  });

  it("decays by decayPerTick and clamps at min", () => {
    const n = makeNeed({ value: 5, decayPerTick: 2 });
    decayNeed(n);
    expect(n.value).toBe(3);
    decayNeed(n, 10); // would go negative
    expect(n.value).toBe(0);
    expect(needIsDepleted(n)).toBe(true);
  });

  it("replenishes and clamps at max", () => {
    const n = makeNeed({ value: 90, max: 100, decayPerTick: 1 });
    replenishNeed(n, 5);
    expect(n.value).toBe(95);
    replenishNeed(n, 50);
    expect(n.value).toBe(100);
  });

  it("needFraction reports 0..1 within range", () => {
    expect(needFraction(makeNeed({ value: 25, min: 0, max: 100, decayPerTick: 0 }))).toBe(0.25);
    expect(needFraction(makeNeed({ value: 0, max: 0, decayPerTick: 0 }))).toBe(0);
  });
});

interface NeedAgent extends EngineEntity {
  needs?: Needs;
}

describe("createNeedsDecaySystem", () => {
  it("decays every need on every agent once per tick", () => {
    const world = new World<NeedAgent>();
    const a = world.spawn({
      needs: { byKind: { food: makeNeed({ value: 10, decayPerTick: 3 }), rest: makeNeed({ value: 8, decayPerTick: 1 }) } },
    });
    const b = world.spawn({ needs: { byKind: { food: makeNeed({ value: 1, decayPerTick: 5 }) } } });
    world.spawn({}); // no needs component — untouched

    const sys = createNeedsDecaySystem(world, { component: "needs", needsOf: (e) => e.needs });
    sys.run({ tick: 0 });

    expect(a.needs!.byKind.food!.value).toBe(7);
    expect(a.needs!.byKind.rest!.value).toBe(7);
    expect(b.needs!.byKind.food!.value).toBe(0); // clamped at min
  });
});
