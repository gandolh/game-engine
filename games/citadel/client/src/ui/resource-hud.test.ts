/**
 * Tests for the in-canvas resource HUD (engine-ui chunk 7). Exercises the data-binding
 * (label text + EDG colour thresholds), the speed/pause button → command wiring, and the
 * derived button states (pause label flip, active-speed highlight) — i.e. the parts that
 * don't need a real WebGPU surface. The render/input/a11y plumbing is the framework's own
 * (covered in @engine/ui); here we just prove this consumer drives them correctly.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { EDG } from "@engine/core";
import type { ButtonNode, LabelNode, UINode } from "@engine/ui";
import { createResourceHud, type ResourceHudState } from "./resource-hud";

function baseState(overrides: Partial<ResourceHudState> = {}): ResourceHudState {
  return {
    tier: "Hamlet",
    day: 1,
    season: "spring",
    population: 0,
    popCap: 0,
    stockpiles: { grain: 0, flour: 0, bread: 0, wood: 0, stone: 0, planks: 0, tools: 0 },
    foodSurplus: 0,
    happiness: 40,
    paused: false,
    speed: 1,
    isHost: true,
    ...overrides,
  };
}

/** Flatten the tree to all leaf nodes for assertions. */
function walk(node: UINode, out: UINode[] = []): UINode[] {
  out.push(node);
  for (const c of node.children) walk(c, out);
  return out;
}
function labels(root: UINode): LabelNode[] {
  return walk(root).filter((n): n is LabelNode => n.kind === "label");
}
function buttons(root: UINode): ButtonNode[] {
  return walk(root).filter((n): n is ButtonNode => n.kind === "button");
}
function labelText(root: UINode, prefix: string): LabelNode | undefined {
  return labels(root).find((l) => l.text.startsWith(prefix));
}
function buttonByLabel(root: UINode, label: string): ButtonNode | undefined {
  return buttons(root).find((b) => b.label === label);
}

describe("createResourceHud — data binding", () => {
  it("renders the settlement readout fields from the snapshot", () => {
    const hud = createResourceHud({ togglePause: () => {}, setSpeed: () => {} });
    hud.refresh(baseState({
      tier: "Town", day: 12, season: "summer",
      population: 7, popCap: 10, happiness: 72,
    }));
    const texts = labels(hud.root).map((l) => l.text);
    expect(texts).toContain("Town");
    expect(texts).toContain("Day 12 (summer)");
    expect(texts).toContain("Pop 7/10");
    expect(texts).toContain("Happy: 72");
  });

  it("renders a live chip for every good in production-chain order", () => {
    const hud = createResourceHud({ togglePause: () => {}, setSpeed: () => {} });
    hud.refresh(baseState({
      stockpiles: { grain: 11, flour: 2, bread: 30, wood: 18, stone: 7, planks: 4, tools: 1 },
      foodSurplus: 5,
    }));
    const texts = labels(hud.root).map((l) => l.text);
    expect(texts).toContain("Grain 11");
    expect(texts).toContain("Flour 2");
    expect(texts).toContain("Bread 30 (+5)"); // bread carries the food-surplus annotation
    expect(texts).toContain("Wood 18");
    expect(texts).toContain("Planks 4");
    expect(texts).toContain("Stone 7");
    expect(texts).toContain("Tools 1");
  });

  it("shows a negative food surplus without a plus sign", () => {
    const hud = createResourceHud({ togglePause: () => {}, setSpeed: () => {} });
    hud.refresh(baseState({
      stockpiles: { grain: 0, flour: 0, bread: 4, wood: 0, stone: 0, planks: 0, tools: 0 },
      foodSurplus: -3,
    }));
    expect(labelText(hud.root, "Bread")?.text).toBe("Bread 4 (-3)");
  });

  it("colour-codes the tier (steel/green/cyan/yellow/red)", () => {
    const hud = createResourceHud({ togglePause: () => {}, setSpeed: () => {} });
    const cases: ReadonlyArray<[string, string]> = [
      ["Hamlet", EDG.steel],
      ["Village", EDG.green],
      ["Town", EDG.cyan],
      ["Citadel", EDG.yellow],
      ["Fortress-City", EDG.red],
    ];
    for (const [tier, color] of cases) {
      hud.refresh(baseState({ tier }));
      const lbl = labels(hud.root).find((l) => l.text === tier);
      expect(lbl?.color).toBe(color);
    }
  });

  it("falls back to silver for an unknown tier", () => {
    const hud = createResourceHud({ togglePause: () => {}, setSpeed: () => {} });
    hud.refresh(baseState({ tier: "Metropolis" }));
    expect(labels(hud.root).find((l) => l.text === "Metropolis")?.color).toBe(EDG.silver);
  });

  it("colour-codes happiness: cyan ≥60, yellow ≥40, red below", () => {
    const hud = createResourceHud({ togglePause: () => {}, setSpeed: () => {} });
    hud.refresh(baseState({ happiness: 80 }));
    expect(labelText(hud.root, "Happy:")?.color).toBe(EDG.cyan);
    hud.refresh(baseState({ happiness: 50 }));
    expect(labelText(hud.root, "Happy:")?.color).toBe(EDG.yellow);
    hud.refresh(baseState({ happiness: 20 }));
    expect(labelText(hud.root, "Happy:")?.color).toBe(EDG.red);
  });
});

describe("createResourceHud — buttons & commands", () => {
  it("wires pause + each speed button to the actions (the shared command path)", () => {
    const calls: string[] = [];
    const speeds: number[] = [];
    const hud = createResourceHud({
      togglePause: () => calls.push("pause"),
      setSpeed: (n) => speeds.push(n),
    });
    buttonByLabel(hud.root, "Pause")?.onActivate?.();
    buttonByLabel(hud.root, "1x")?.onActivate?.();
    buttonByLabel(hud.root, "2x")?.onActivate?.();
    buttonByLabel(hud.root, "4x")?.onActivate?.();
    expect(calls).toEqual(["pause"]);
    expect(speeds).toEqual([1, 2, 4]);
  });

  it("flips the pause button label between Pause and Resume", () => {
    const hud = createResourceHud({ togglePause: () => {}, setSpeed: () => {} });
    hud.refresh(baseState({ paused: false }));
    expect(buttons(hud.root).some((b) => b.label === "Pause")).toBe(true);
    hud.refresh(baseState({ paused: true }));
    expect(buttons(hud.root).some((b) => b.label === "Resume")).toBe(true);
    expect(buttons(hud.root).some((b) => b.label === "Pause")).toBe(false);
  });

  it("highlights the active speed button (active) and rests the others (normal)", () => {
    const hud = createResourceHud({ togglePause: () => {}, setSpeed: () => {} });
    hud.refresh(baseState({ speed: 2 }));
    expect(buttonByLabel(hud.root, "2x")?.state).toBe("active");
    expect(buttonByLabel(hud.root, "1x")?.state).toBe("normal");
    expect(buttonByLabel(hud.root, "4x")?.state).toBe("normal");
    // Switching speed moves the active highlight and releases the previous one.
    hud.refresh(baseState({ speed: 4 }));
    expect(buttonByLabel(hud.root, "4x")?.state).toBe("active");
    expect(buttonByLabel(hud.root, "2x")?.state).toBe("normal");
  });

  it("reports content-changed so the host can gate layout (first frame, then only on change)", () => {
    const hud = createResourceHud({ togglePause: () => {}, setSpeed: () => {} });
    // First refresh always reports changed (the host must run the initial layout).
    expect(hud.refresh(baseState())).toBe(true);
    // Identical state → no layout-affecting change.
    expect(hud.refresh(baseState())).toBe(false);
    // A label-text change (population) IS layout-affecting → changed.
    expect(hud.refresh(baseState({ population: 3 }))).toBe(true);
    // The pause label flip changes a button label → layout-affecting → changed.
    expect(hud.refresh(baseState({ population: 3, paused: true }))).toBe(true);
    // Same again → no change.
    expect(hud.refresh(baseState({ population: 3, paused: true }))).toBe(false);
  });

  it("does not report changed for a colour-only or speed-highlight change (no layout impact)", () => {
    const hud = createResourceHud({ togglePause: () => {}, setSpeed: () => {} });
    hud.refresh(baseState({ happiness: 80, speed: 1 })); // prime (returns true)
    // Happiness colour crosses a threshold (cyan→yellow) but the TEXT "Happy: 50" still
    // changes value, so that IS a text change. Use a same-text colour case instead:
    // tier colour map is keyed by tier string, and the tier text is the colour driver, so
    // pick a speed-highlight change which touches only button.state (not label/text).
    expect(hud.refresh(baseState({ happiness: 80, speed: 2 }))).toBe(false);
  });

  it("does not stomp a live hover the dispatcher set on a non-selected speed button", () => {
    const hud = createResourceHud({ togglePause: () => {}, setSpeed: () => {} });
    const btn1 = buttonByLabel(hud.root, "1x")!;
    btn1.state = "hover"; // simulate the input dispatcher hovering it
    hud.refresh(baseState({ speed: 2 })); // 1x is not the active speed
    expect(btn1.state).toBe("hover"); // hover preserved (only a stale "active" is cleared)
  });
});

describe("createResourceHud — host-only room control (Citadel 97/13)", () => {
  const speedLabels = ["1x", "2x", "4x"] as const;

  it("greys pause + all speed controls as `disabled` for a non-host peer", () => {
    const hud = createResourceHud({ togglePause: () => {}, setSpeed: () => {} });
    hud.refresh(baseState({ isHost: false, speed: 2 }));
    // The engine maps `disabled` to the muted theme colour AND suppresses activation.
    expect(buttons(hud.root).find((b) => b.label === "Pause" || b.label === "Resume")?.state).toBe("disabled");
    for (const s of speedLabels) expect(buttonByLabel(hud.root, s)?.state).toBe("disabled");
  });

  it("still reflects the authoritative room paused state in the (disabled) label", () => {
    const hud = createResourceHud({ togglePause: () => {}, setSpeed: () => {} });
    hud.refresh(baseState({ isHost: false, paused: true }));
    // Label mirrors the room state even though the peer can't act on it.
    expect(buttonByLabel(hud.root, "Resume")?.state).toBe("disabled");
    expect(buttonByLabel(hud.root, "Pause")).toBeUndefined();
  });

  it("re-enables the controls when the peer becomes host (migration), restoring the speed highlight", () => {
    const hud = createResourceHud({ togglePause: () => {}, setSpeed: () => {} });
    hud.refresh(baseState({ isHost: false, speed: 2 }));
    expect(buttonByLabel(hud.root, "2x")?.state).toBe("disabled");
    // Now this peer is host: controls enable, and the active speed reads as pressed again.
    hud.refresh(baseState({ isHost: true, speed: 2 }));
    expect(buttonByLabel(hud.root, "2x")?.state).toBe("active");
    expect(buttonByLabel(hud.root, "1x")?.state).toBe("normal");
    expect(buttonByLabel(hud.root, "Pause")?.state).toBe("normal");
  });

  it("marks content-changed on the enabled↔disabled flip so the a11y mirror reconciles", () => {
    const hud = createResourceHud({ togglePause: () => {}, setSpeed: () => {} });
    hud.refresh(baseState({ isHost: true })); // prime (first refresh is always changed)
    // Host → non-host greys four buttons: a state flip the a11y mirror must reflect.
    expect(hud.refresh(baseState({ isHost: false }))).toBe(true);
    // Same non-host state again → nothing to reconcile.
    expect(hud.refresh(baseState({ isHost: false }))).toBe(false);
  });
});
