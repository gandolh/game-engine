/**
 * Tests for the in-canvas villager follow panel (villager-job Chunk 3). Exercises the
 * data-binding (the job/id/fsm/cargo labels) and the layout-changed gating — the parts that
 * don't need a real WebGPU surface. The render/a11y plumbing is the framework's own (covered
 * in @engine/ui); here we just prove this consumer binds its fields correctly.
 */
import { describe, it, expect } from "vitest";
import type { LabelNode, UINode } from "@engine/ui";
import { createVillagerPanel, type VillagerPanelState } from "./villager-panel";

function baseState(overrides: Partial<VillagerPanelState> = {}): VillagerPanelState {
  return {
    id: 1,
    job: "farmer",
    fsm: "work",
    carryGood: null,
    ...overrides,
  };
}

/** Flatten the tree to all nodes for assertions. */
function walk(node: UINode, out: UINode[] = []): UINode[] {
  out.push(node);
  for (const c of node.children) walk(c, out);
  return out;
}
function labels(root: UINode): LabelNode[] {
  return walk(root).filter((n): n is LabelNode => n.kind === "label");
}
function labelText(root: UINode, prefix: string): LabelNode | undefined {
  return labels(root).find((l) => l.text.startsWith(prefix));
}

describe("createVillagerPanel — data binding", () => {
  it("binds job (prominent), id, activity, and cargo from the snapshot", () => {
    const panel = createVillagerPanel();
    panel.refresh(baseState({ id: 7, job: "baker", fsm: "haulToStore", carryGood: "bread" }));
    const texts = labels(panel.root).map((l) => l.text);
    expect(texts).toContain("Villager #7");
    expect(texts).toContain("Job: Baker");
    expect(texts).toContain("Activity: haulToStore");
    expect(texts).toContain("Carrying: Bread");
  });

  it("capitalises the job label for every job value", () => {
    const panel = createVillagerPanel();
    const cases: ReadonlyArray<[string, string]> = [
      ["farmer", "Job: Farmer"],
      ["quarryman", "Job: Quarryman"],
      ["idle", "Job: Idle"],
      ["watchman", "Job: Watchman"],
    ];
    for (const [job, expected] of cases) {
      panel.refresh(baseState({ job }));
      expect(labelText(panel.root, "Job:")?.text).toBe(expected);
    }
  });

  it("shows an em dash for an empty-handed villager (carryGood null)", () => {
    const panel = createVillagerPanel();
    panel.refresh(baseState({ carryGood: null }));
    expect(labelText(panel.root, "Carrying:")?.text).toBe("Carrying: —");
  });

  it("re-binds when following a different villager (job + id update in place)", () => {
    const panel = createVillagerPanel();
    panel.refresh(baseState({ id: 1, job: "farmer" }));
    panel.refresh(baseState({ id: 2, job: "miller" }));
    expect(labelText(panel.root, "Villager #")?.text).toBe("Villager #2");
    expect(labelText(panel.root, "Job:")?.text).toBe("Job: Miller");
  });
});

describe("createVillagerPanel — layout-changed gating", () => {
  it("reports changed on the first frame, then only on a layout-affecting change", () => {
    const panel = createVillagerPanel();
    // First refresh always reports changed (the host must run the initial layout).
    expect(panel.refresh(baseState())).toBe(true);
    // Identical state → no layout-affecting change.
    expect(panel.refresh(baseState())).toBe(false);
    // A label-text change (job) IS layout-affecting → changed.
    expect(panel.refresh(baseState({ job: "smith" }))).toBe(true);
    // Same again → no change.
    expect(panel.refresh(baseState({ job: "smith" }))).toBe(false);
    // FSM change is layout-affecting too.
    expect(panel.refresh(baseState({ job: "smith", fsm: "idle" }))).toBe(true);
  });

  it("markOpened() forces the next refresh to report changed even for identical content", () => {
    const panel = createVillagerPanel();
    panel.refresh(baseState()); // prime (returns true)
    expect(panel.refresh(baseState())).toBe(false); // identical → no change
    panel.markOpened();
    expect(panel.refresh(baseState())).toBe(true); // forced changed on reopen
  });
});
