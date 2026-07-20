import { describe, it, expect } from "vitest";
import { NEED_REST } from "@hollow/sim-core/economy";
import { defaultShockFormState, buildShock, SHOCK_KINDS } from "./shock-form";

describe("defaultShockFormState", () => {
  it("defaults to famine with a sane factor/duration", () => {
    const form = defaultShockFormState();
    expect(form.kind).toBe("famine");
    expect(form.resourceKind).toBe("food");
    expect(form.factor).toBeLessThan(1);
    expect(form.durationTicks).toBeGreaterThan(0);
  });

  it("defaults a boom's factor above 1 (abundance, not scarcity)", () => {
    const form = defaultShockFormState("boom");
    expect(form.factor).toBeGreaterThan(1);
  });
});

describe("buildShock", () => {
  it("builds a famine shock from resourceKind/factor/durationTicks", () => {
    const shock = buildShock({ kind: "famine", resourceKind: "material", factor: 0.2, durationTicks: 50, need: NEED_REST, amountPerTick: 1 });
    expect(shock).toEqual({ kind: "famine", resourceKind: "material", factor: 0.2, durationTicks: 50 });
  });

  it("builds a boom shock the same shape as famine", () => {
    const shock = buildShock({ kind: "boom", resourceKind: "food", factor: 2.5, durationTicks: 80, need: NEED_REST, amountPerTick: 1 });
    expect(shock).toEqual({ kind: "boom", resourceKind: "food", factor: 2.5, durationTicks: 80 });
  });

  it("builds a disaster shock with only resourceKind (no window fields)", () => {
    const shock = buildShock({ kind: "disaster", resourceKind: "food", factor: 1, durationTicks: 1, need: NEED_REST, amountPerTick: 1 });
    expect(shock).toEqual({ kind: "disaster", resourceKind: "food" });
  });

  it("builds a plague shock from need/amountPerTick/durationTicks", () => {
    const shock = buildShock({ kind: "plague", resourceKind: "food", factor: 1, durationTicks: 60, need: NEED_REST, amountPerTick: 2.5 });
    expect(shock).toEqual({ kind: "plague", need: NEED_REST, amountPerTick: 2.5, durationTicks: 60 });
  });

  it("covers every documented shock kind", () => {
    expect(SHOCK_KINDS).toEqual(["famine", "boom", "disaster", "plague"]);
  });
});
