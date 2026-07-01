/**
 * Tests for the in-canvas build bar (build-bar.ts). Exercises the @engine/ui widget tree
 * (a button per toolbar entry), the click→action wiring (selectBuild / setTool), the
 * per-frame state binding (selected→active, tier-locked/unaffordable→disabled, change
 * reporting), and the hover-info text. No real surface — we assert the retained tree.
 */
import { describe, it, expect } from "vitest";
import type { ButtonNode, UINode } from "@engine/ui";
import { createBuildBar, type BuildBarState, type BuildTool } from "./build-bar";

function walk(node: UINode, out: UINode[] = []): UINode[] {
  out.push(node);
  for (const c of node.children) walk(c, out);
  return out;
}
function buttons(root: UINode): ButtonNode[] {
  return walk(root).filter((n): n is ButtonNode => n.kind === "button");
}
function byLabel(root: UINode, label: string): ButtonNode {
  const b = buttons(root).find((x) => x.label === label);
  if (b === undefined) throw new Error(`no button "${label}"`);
  return b;
}

function state(over: Partial<BuildBarState> = {}): BuildBarState {
  return {
    mode: "none",
    selectedType: "",
    peakTier: "Hamlet",
    chargeBuildCost: false,
    stockpiles: {},
    ...over,
  };
}

function makeBar() {
  const builds: string[] = [];
  const tools: BuildTool[] = [];
  const bar = createBuildBar({ selectBuild: (t) => builds.push(t), setTool: (t) => tools.push(t) });
  return { bar, builds, tools };
}

describe("createBuildBar — tree + wiring", () => {
  it("renders a button per toolbar entry (all 23 builds + 4 tools)", () => {
    const { bar } = makeBar();
    const labels = buttons(bar.root).map((b) => b.label);
    expect(labels).toContain("House");
    expect(labels).toContain("Keep");
    expect(labels).toContain("Road");
    expect(labels).toContain("Cancel");
    expect(labels).toContain("Square");
    expect(labels.length).toBe(27);
  });

  it("a build button calls selectBuild(type); a tool button calls setTool(mode)", () => {
    const { bar, builds, tools } = makeBar();
    byLabel(bar.root, "House").onActivate?.();
    byLabel(bar.root, "Hall").onActivate?.();   // town-hall
    byLabel(bar.root, "Road").onActivate?.();
    byLabel(bar.root, "Cancel").onActivate?.(); // → "none"
    expect(builds).toEqual(["house", "town-hall"]);
    expect(tools).toEqual(["road", "none"]);
  });
});

describe("createBuildBar — per-frame state", () => {
  it("marks the selected build as active and clears it when deselected", () => {
    const { bar } = makeBar();
    bar.refresh(state({ mode: "place", selectedType: "farm" }));
    expect(byLabel(bar.root, "Farm").state).toBe("active");
    expect(byLabel(bar.root, "Mill").state).toBe("normal");
    bar.refresh(state({ mode: "place", selectedType: "mill" }));
    expect(byLabel(bar.root, "Farm").state).toBe("normal");
    expect(byLabel(bar.root, "Mill").state).toBe("active");
  });

  it("marks the active tool mode (road/wall/demolish/upgrade/cancel)", () => {
    const { bar } = makeBar();
    bar.refresh(state({ mode: "road" }));
    expect(byLabel(bar.root, "Road").state).toBe("active");
    bar.refresh(state({ mode: "none" }));
    expect(byLabel(bar.root, "Cancel").state).toBe("active"); // "none" ⇒ Cancel reads active
  });

  it("disables tier-locked builds until the tier is reached", () => {
    const { bar } = makeBar();
    bar.refresh(state({ peakTier: "Hamlet" }));
    expect(byLabel(bar.root, "Keep").state).toBe("disabled");   // keep needs Town
    bar.refresh(state({ peakTier: "Town" }));
    expect(byLabel(bar.root, "Keep").state).not.toBe("disabled");
  });

  it("disables unaffordable builds when build costs are on, re-enables as the stockpile grows", () => {
    const { bar } = makeBar();
    bar.refresh(state({ chargeBuildCost: true, stockpiles: { wood: 0 } }));
    expect(byLabel(bar.root, "House").state).toBe("disabled");  // house costs 4 wood
    bar.refresh(state({ chargeBuildCost: true, stockpiles: { wood: 40 } }));
    expect(byLabel(bar.root, "House").state).toBe("normal");
  });

  it("refresh reports whether any button state changed (for gating the a11y reconcile)", () => {
    const { bar } = makeBar();
    expect(bar.refresh(state({ mode: "place", selectedType: "farm" }))).toBe(true);
    expect(bar.refresh(state({ mode: "place", selectedType: "farm" }))).toBe(false); // no change
    expect(bar.refresh(state({ mode: "place", selectedType: "mill" }))).toBe(true);  // moved
  });
});

describe("createBuildBar — hover info", () => {
  it("shows the build cost / tier requirement for a hovered build button", () => {
    const { bar } = makeBar();
    expect(bar.hoverInfoFor(byLabel(bar.root, "House"))).toBe("House: 4 wood");
    expect(bar.hoverInfoFor(byLabel(bar.root, "Keep"))).toContain("requires Town");
  });
  it("shows a hint for a tool button, and nothing for an unknown node", () => {
    const { bar } = makeBar();
    expect(bar.hoverInfoFor(byLabel(bar.root, "Road"))).toMatch(/drag/i);
    expect(bar.hoverInfoFor(null)).toBe("");
  });
});
