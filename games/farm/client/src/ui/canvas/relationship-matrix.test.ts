import { describe, it, expect } from "vitest";
import { EDG } from "@engine/core";
import type { LabelNode, UINode } from "@engine/ui";
import { createRelationshipMatrix, type RelationshipMatrixData } from "./relationship-matrix";

function walk(node: UINode, out: UINode[] = []): UINode[] {
  out.push(node);
  for (const c of node.children) walk(c, out);
  return out;
}
function labels(root: UINode): LabelNode[] {
  return walk(root).filter((n): n is LabelNode => n.kind === "label");
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

describe("createRelationshipMatrix — data binding", () => {
  it("renders a grid of farmer initials as header + row labels", () => {
    const rm = createRelationshipMatrix();
    rm.refresh(data());
    const texts = labels(rm.root).map((l) => l.text);
    expect(texts).toContain("P");
    expect(texts).toContain("A");
  });

  it("colour-codes cells: green for ally (>0.65), red for rival (<0.35), steel otherwise", () => {
    const rm = createRelationshipMatrix();
    rm.refresh(data({ trust: { 1: { 2: 0.8 }, 2: { 1: 0.2 } } }));
    const cell80 = labels(rm.root).find((l) => l.text === "80");
    const cell20 = labels(rm.root).find((l) => l.text === "20");
    expect(cell80?.color).toBe(EDG.green);
    expect(cell20?.color).toBe(EDG.red);
  });

  it("uses steel for a mid-range trust value", () => {
    const rm = createRelationshipMatrix();
    rm.refresh(data({ trust: { 1: { 2: 0.5 }, 2: { 1: 0.5 } } }));
    const cell50 = labels(rm.root).find((l) => l.text === "50");
    expect(cell50?.color).toBe(EDG.steel);
  });

  it("marks the diagonal (self-trust) cells distinctly", () => {
    const rm = createRelationshipMatrix();
    rm.refresh(data());
    const texts = labels(rm.root).map((l) => l.text);
    expect(texts).toContain("*");
  });

  it("colour-codes farmer initials by personality", () => {
    const rm = createRelationshipMatrix();
    rm.refresh(data());
    const pipInitial = labels(rm.root).filter((l) => l.text === "P");
    expect(pipInitial.length).toBeGreaterThan(0);
    for (const l of pipInitial) {
      // conservative -> skyBlue per personalityColor
      expect(l.color).toBe(EDG.skyBlue);
    }
  });

  it("rebuilds (changed=true) when the trust signature changes, and short-circuits (false) when unchanged", () => {
    const rm = createRelationshipMatrix();
    expect(rm.refresh(data())).toBe(true);
    expect(rm.refresh(data())).toBe(false);
    expect(rm.refresh(data({ trust: { 1: { 2: 0.9 }, 2: { 1: 0.2 } } }))).toBe(true);
  });

  it("handles an empty farmer roster without throwing", () => {
    const rm = createRelationshipMatrix();
    const changed = rm.refresh({ farmers: [], trust: {} });
    expect(changed).toBe(true);
    // No grid rows (no header, no farmer initials) beyond the static title/caption/legend.
    const texts = labels(rm.root).map((l) => l.text);
    expect(texts).not.toContain("P");
    expect(texts).not.toContain("A");
  });
});
