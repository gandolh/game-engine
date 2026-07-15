import { describe, it, expect } from "vitest";
import { EDG } from "@engine/core";
import type { LabelNode, ButtonNode, UINode } from "@engine/ui";
import { createRelationshipMatrix, type RelationshipMatrixData } from "./relationship-matrix";
import type { PanelId, PanelPrefs } from "./panel-prefs";

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

function data(overrides: Partial<RelationshipMatrixData> = {}): RelationshipMatrixData {
  return {
    farmers: [
      { id: 1, name: "Pip", personality: "conservative" },
      { id: 2, name: "Ada", personality: "aggressive" },
    ],
    trust: { 1: { 2: 0.8 }, 2: { 1: 0.2 } },
    ...overrides,
  };
}

/** Minimal fake PanelPrefs — in-memory, defaults every id to closed. */
function makeFakePrefs(): PanelPrefs {
  const open = new Set<PanelId>();
  return {
    isOpen(id) {
      return open.has(id);
    },
    setOpen(id, isOpen) {
      if (isOpen) open.add(id);
      else open.delete(id);
    },
    toggle(id) {
      const next = !open.has(id);
      if (next) open.add(id);
      else open.delete(id);
      return next;
    },
  };
}

describe("createRelationshipMatrix — collapse (brief 117)", () => {
  it("defaults closed: grid/title absent, the Relations button present", () => {
    const rm = createRelationshipMatrix(makeFakePrefs());
    const texts = labels(rm.root).map((l) => l.text);
    expect(texts).not.toContain("Relationships");
    expect(texts.some((t) => t.includes("Who trusts whom"))).toBe(false);

    const btns = buttons(rm.root);
    expect(btns.length).toBe(1);
    expect(btns[0]!.label).toBe("Relations");
  });

  it("toggleOpen() opens the panel: next refresh() returns true and builds the grid from supplied data", () => {
    const prefs = makeFakePrefs();
    const rm = createRelationshipMatrix(prefs);

    rm.toggleOpen();
    expect(prefs.isOpen("relations")).toBe(true);

    const changed = rm.refresh(data());
    expect(changed).toBe(true);

    const texts = labels(rm.root).map((l) => l.text);
    expect(texts).toContain("Relationships");
    expect(texts).toContain("P");
    expect(texts).toContain("A");
  });

  it("pressing the Relations button has identical semantics to toggleOpen()", () => {
    const prefs = makeFakePrefs();
    const rm = createRelationshipMatrix(prefs);
    const btn = buttons(rm.root)[0]!;

    btn.onActivate?.();
    expect(prefs.isOpen("relations")).toBe(true);
    expect(rm.refresh(data())).toBe(true);
    expect(labels(rm.root).map((l) => l.text)).toContain("Relationships");
  });

  it("while closed, refresh(data) skips the grid rebuild (only reports the pending structural flag once)", () => {
    const prefs = makeFakePrefs();
    const rm = createRelationshipMatrix(prefs);

    // Open then close: closing leaves a pending structural-change flag.
    rm.toggleOpen();
    rm.refresh(data());
    rm.toggleOpen();
    expect(prefs.isOpen("relations")).toBe(false);

    expect(rm.refresh(data())).toBe(true); // consumes the close's structural flag
    expect(rm.refresh(data({ trust: { 1: { 2: 0.1 } } }))).toBe(false); // closed: no rebuild, no signal

    const btns = buttons(rm.root);
    expect(btns.length).toBe(1);
    expect(labels(rm.root).length).toBe(0);
  });

  it("reopening shows fresh data even though it was ignored while closed", () => {
    const prefs = makeFakePrefs();
    const rm = createRelationshipMatrix(prefs);

    rm.toggleOpen();
    rm.refresh(data({ trust: { 1: { 2: 0.8 }, 2: { 1: 0.2 } } }));
    rm.toggleOpen(); // close
    rm.refresh(data({ trust: { 1: { 2: 0.8 }, 2: { 1: 0.2 } } })); // ignored while closed

    rm.toggleOpen(); // reopen
    const changed = rm.refresh(data({ trust: { 1: { 2: 0.9 }, 2: { 1: 0.2 } } }));
    expect(changed).toBe(true);

    const cell90 = labels(rm.root).find((l) => l.text === "90");
    expect(cell90?.color).toBe(EDG.green);
  });

  it("colour-codes cells: green for ally (>0.65), red for rival (<0.35), steel otherwise", () => {
    const prefs = makeFakePrefs();
    const rm = createRelationshipMatrix(prefs);
    rm.toggleOpen();
    rm.refresh(data({ trust: { 1: { 2: 0.8 }, 2: { 1: 0.2 } } }));
    const cell80 = labels(rm.root).find((l) => l.text === "80");
    const cell20 = labels(rm.root).find((l) => l.text === "20");
    expect(cell80?.color).toBe(EDG.green);
    expect(cell20?.color).toBe(EDG.red);
  });

  it("uses steel for a mid-range trust value", () => {
    const prefs = makeFakePrefs();
    const rm = createRelationshipMatrix(prefs);
    rm.toggleOpen();
    rm.refresh(data({ trust: { 1: { 2: 0.5 }, 2: { 1: 0.5 } } }));
    const cell50 = labels(rm.root).find((l) => l.text === "50");
    expect(cell50?.color).toBe(EDG.steel);
  });

  it("marks the diagonal (self-trust) cells distinctly", () => {
    const prefs = makeFakePrefs();
    const rm = createRelationshipMatrix(prefs);
    rm.toggleOpen();
    rm.refresh(data());
    const texts = labels(rm.root).map((l) => l.text);
    expect(texts).toContain("*");
  });

  it("colour-codes farmer initials by personality", () => {
    const prefs = makeFakePrefs();
    const rm = createRelationshipMatrix(prefs);
    rm.toggleOpen();
    rm.refresh(data());
    const pipInitial = labels(rm.root).filter((l) => l.text === "P");
    expect(pipInitial.length).toBeGreaterThan(0);
    for (const l of pipInitial) {
      // conservative -> skyBlue per personalityColor
      expect(l.color).toBe(EDG.skyBlue);
    }
  });

  it("rebuilds (changed=true) when the trust signature changes, and short-circuits (false) when unchanged", () => {
    const prefs = makeFakePrefs();
    const rm = createRelationshipMatrix(prefs);
    rm.toggleOpen();
    expect(rm.refresh(data())).toBe(true); // consumes the open's structural flag + rebuilds
    expect(rm.refresh(data())).toBe(false);
    expect(rm.refresh(data({ trust: { 1: { 2: 0.9 }, 2: { 1: 0.2 } } }))).toBe(true);
  });

  it("handles an empty farmer roster without throwing", () => {
    const prefs = makeFakePrefs();
    const rm = createRelationshipMatrix(prefs);
    rm.toggleOpen();
    const changed = rm.refresh({ farmers: [], trust: {} });
    expect(changed).toBe(true);
    // No grid rows (no header, no farmer initials) beyond the static title/caption/legend.
    const texts = labels(rm.root).map((l) => l.text);
    expect(texts).not.toContain("P");
    expect(texts).not.toContain("A");
  });
});
