import { describe, it, expect } from "vitest";
import { createInspectPanel } from "./inspect-panel";
import type { InspectState } from "./inspect-panel";
import type { LabelNode, UINode } from "@engine/ui";
import { personalityColor } from "../colors";

function labelTexts(node: UINode, out: string[] = []): string[] {
  if (node.kind === "label") out.push(node.text);
  for (const child of node.children) labelTexts(child, out);
  return out;
}
function findLabel(node: UINode, prefix: string): LabelNode | null {
  if (node.kind === "label" && node.text.startsWith(prefix)) return node;
  for (const child of node.children) {
    const hit = findLabel(child, prefix);
    if (hit !== null) return hit;
  }
  return null;
}

const BASE: InspectState = {
  name: "Cora",
  personality: "conservative",
  gold: 80,
  fsm: "PERCEIVE",
  apCurrent: 60,
  apMax: 100,
  region: "home",
  currentIntention: "water plot",
};

describe("createInspectPanel", () => {
  it("first refresh renders name/personality/gold/state/region/intention and reports changed", () => {
    const p = createInspectPanel();
    expect(p.refresh(BASE)).toBe(true);
    const texts = labelTexts(p.root);
    expect(texts).toContain("Cora");
    expect(texts).toContain("(conservative)");
    expect(texts).toContain("Gold 80");
    expect(texts).toContain("PERCEIVE  AP 60/100");
    expect(texts).toContain("at home");
    expect(texts).toContain("> water plot");
  });

  it("colours the personality tag with its EDG32 personality colour", () => {
    const p = createInspectPanel();
    p.refresh(BASE);
    const tag = findLabel(p.root, "(conservative)");
    expect(tag?.color).toBe(personalityColor("conservative"));
  });

  it("returns false when nothing layout-affecting changed", () => {
    const p = createInspectPanel();
    p.refresh(BASE);
    expect(p.refresh(BASE)).toBe(false);
  });

  it("reflects a changed intention / gold on the next refresh", () => {
    const p = createInspectPanel();
    p.refresh(BASE);
    const changed = p.refresh({ ...BASE, gold: 120, currentIntention: "sell wheat" });
    expect(changed).toBe(true);
    const texts = labelTexts(p.root);
    expect(texts).toContain("Gold 120");
    expect(texts).toContain("> sell wheat");
  });

  it("clears the intention line when there is no current intention", () => {
    const p = createInspectPanel();
    p.refresh(BASE);
    p.refresh({ ...BASE, currentIntention: null });
    const texts = labelTexts(p.root);
    expect(texts).not.toContain("> water plot");
    expect(texts).toContain(""); // the intention label is now empty
  });
});
