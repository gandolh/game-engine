import { describe, it, expect } from "vitest";
import { ARCHETYPE_PRESETS } from "@hollow/sim-core/persona";
import {
  defaultPersonaFormState,
  emptyArchetypeRow,
  withCount,
  withLockToggled,
  withBehaviorValue,
  withAptitudeValue,
  withAppearanceNumber,
  withAppearanceTone,
  withRow,
  withSeed,
  randomizeUnlocked,
  buildPersonaSeed,
  type PersonaFormState,
} from "./persona-form";

describe("defaultPersonaFormState", () => {
  it("has one row per built-in archetype preset", () => {
    const form = defaultPersonaFormState();
    expect(form.archetypes.map((r) => r.preset).sort()).toEqual(Object.keys(ARCHETYPE_PRESETS).sort());
  });
});

describe("buildPersonaSeed", () => {
  it("maps seed + archetype counts straight through", () => {
    const form: PersonaFormState = {
      seed: 42,
      archetypes: [emptyArchetypeRow("cooperator", 3), emptyArchetypeRow("hoarder", 2)],
    };
    const seed = buildPersonaSeed(form);
    expect(seed.seed).toBe(42);
    expect(seed.archetypes).toEqual([
      { preset: "cooperator", count: 3 },
      { preset: "hoarder", count: 2 },
    ]);
  });

  it("drops rows with count <= 0", () => {
    const form: PersonaFormState = {
      seed: 1,
      archetypes: [emptyArchetypeRow("cooperator", 0), emptyArchetypeRow("loner", 5)],
    };
    const seed = buildPersonaSeed(form);
    expect(seed.archetypes).toEqual([{ preset: "loner", count: 5 }]);
  });

  it("omits archetypes entirely when every row is empty", () => {
    const form: PersonaFormState = { seed: 1, archetypes: [emptyArchetypeRow("cooperator", 0)] };
    const seed = buildPersonaSeed(form);
    expect(seed.archetypes).toBeUndefined();
  });

  it("carries a row's touched gene/appearance/lock fields into overrides", () => {
    let row = emptyArchetypeRow("opportunist", 4);
    row = withBehaviorValue(row, "greed", 0.95);
    row = withAptitudeValue(row, "food", 0.4);
    row = withAppearanceNumber(row, "height", 1.1);
    row = withAppearanceTone(row, "hairTone", "hairRed");
    row = withLockToggled(row, "greed");

    const form: PersonaFormState = { seed: 7, archetypes: [row] };
    const seed = buildPersonaSeed(form);
    expect(seed.archetypes).toEqual([
      {
        preset: "opportunist",
        count: 4,
        overrides: {
          behavior: { greed: 0.95 },
          aptitude: { food: 0.4 },
          appearance: { height: 1.1, hairTone: "hairRed" },
          lock: ["greed"],
        },
      },
    ]);
  });

  it("does not attach an overrides object when a row was never touched", () => {
    const form: PersonaFormState = { seed: 1, archetypes: [emptyArchetypeRow("nurturer", 2)] };
    const seed = buildPersonaSeed(form);
    expect(seed.archetypes?.[0]).not.toHaveProperty("overrides");
  });

  it("maps resource-density fields conditionally (undefined fields omitted, not sent as literal undefined)", () => {
    const form: PersonaFormState = { seed: 1, archetypes: [], foodNodeCount: 12, materialNodeMaxStock: 500 };
    const seed = buildPersonaSeed(form);
    expect(seed.foodNodeCount).toBe(12);
    expect(seed.materialNodeMaxStock).toBe(500);
    expect("foodNodeMaxStock" in seed).toBe(false);
    expect("materialNodeCount" in seed).toBe(false);
  });
});

describe("withCount", () => {
  it("floors and clamps to >= 0", () => {
    expect(withCount(emptyArchetypeRow("loner"), 3.7).count).toBe(3);
    expect(withCount(emptyArchetypeRow("loner"), -5).count).toBe(0);
  });
});

describe("withLockToggled", () => {
  it("toggles a gene name in/out of the lock set", () => {
    let row = emptyArchetypeRow("loner");
    row = withLockToggled(row, "sociability");
    expect(row.lock).toEqual(["sociability"]);
    row = withLockToggled(row, "sociability");
    expect(row.lock).toEqual([]);
  });
});

describe("withRow / withSeed", () => {
  it("replace one row by index / the top-level seed, leaving the rest untouched", () => {
    const form = defaultPersonaFormState();
    const changed = withRow(form, 1, withCount(form.archetypes[1]!, 99));
    expect(changed.archetypes[1]!.count).toBe(99);
    expect(changed.archetypes[0]).toBe(form.archetypes[0]); // untouched rows are the SAME reference

    const reseeded = withSeed(form, 12345);
    expect(reseeded.seed).toBe(12345);
    expect(reseeded.archetypes).toBe(form.archetypes);
  });
});

describe("randomizeUnlocked", () => {
  it("only overwrites UNLOCKED genes, leaving locked ones exactly as authored", () => {
    let row = emptyArchetypeRow("hoarder");
    row = withBehaviorValue(row, "greed", 0.42);
    row = withLockToggled(row, "greed");
    row = withAppearanceTone(row, "skinTone", "skinDark");
    row = withLockToggled(row, "skinTone");

    const randomized = randomizeUnlocked(row, () => 0.5);
    expect(randomized.behavior.greed).toBe(0.42); // locked, untouched
    expect(randomized.appearance.skinTone).toBe("skinDark"); // locked, untouched
    // unlocked genes got a fresh value from the injected deterministic source
    expect(randomized.behavior.sociability).toBe(0.5);
    expect(randomized.aptitude.food).toBe(0.5);
    expect(randomized.appearance.height).toBeCloseTo(1.0, 5); // midpoint of [0.85, 1.15] at rand()=0.5
  });

  it("is deterministic for a given injected rand source (repeatable preview)", () => {
    const row = emptyArchetypeRow("cooperator");
    let calls = 0;
    const seq = [0.1, 0.9, 0.3, 0.7, 0.2, 0.4, 0.6, 0.8, 0.0, 0.5, 1, 0, 0.15];
    const rand = () => seq[calls++ % seq.length]!;
    const a = randomizeUnlocked(row, (() => {
      let i = 0;
      return () => seq[i++ % seq.length]!;
    })());
    const b = randomizeUnlocked(row, (() => {
      let i = 0;
      return () => seq[i++ % seq.length]!;
    })());
    expect(a).toEqual(b);
    void rand;
  });
});
