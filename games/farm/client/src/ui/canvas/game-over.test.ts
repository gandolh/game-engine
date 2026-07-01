import { describe, it, expect, vi } from "vitest";
import { createGameOverPanel } from "./game-over";
import type { UINode, ButtonNode } from "@engine/ui";
import type { FinalStandingRow, RunRecap } from "@farm/sim-core/snapshot";

function labelTexts(node: UINode, out: string[] = []): string[] {
  if (node.kind === "label") out.push(node.text);
  for (const child of node.children) labelTexts(child, out);
  return out;
}

function findButtons(node: UINode, out: ButtonNode[] = []): ButtonNode[] {
  if (node.kind === "button") out.push(node);
  for (const child of node.children) findButtons(child, out);
  return out;
}

const rows: FinalStandingRow[] = [
  {
    rank: 1,
    id: 1,
    name: "Pip",
    personality: "player",
    gold: 500,
    unsoldValue: 20,
    totalValue: 900,
    crops: { wheat: 3 },
  },
  {
    rank: 2,
    id: 2,
    name: "Rex",
    personality: "conservative",
    gold: 300,
    unsoldValue: 10,
    totalValue: 500,
    crops: {},
  },
];

describe("createGameOverPanel", () => {
  it("first refresh renders headline, standings, winner, and reports changed", () => {
    const panel = createGameOverPanel({ onShare: () => {} });
    const recap: RunRecap = {
      standings: [
        { rank: 1, name: "Pip", personality: "player", totalValue: 900, gold: 500, midRankDelta: 1 },
        { rank: 2, name: "Rex", personality: "conservative", totalValue: 500, gold: 300, midRankDelta: 0 },
      ],
      arcs: ["Pip had a great season."],
      headline: "Pip wins!",
    };
    const changed = panel.refresh({ rows, finalDay: 100, seed: 0xc0ffee, recap, shareStatus: "" });
    expect(changed).toBe(true);

    const texts = labelTexts(panel.root);
    expect(texts).toContain("Pip wins!");
    expect(texts.some((t) => t.includes("Pip"))).toBe(true);
    expect(texts.some((t) => t.includes("Winner: Pip"))).toBe(true);
    expect(texts).toContain("Pip had a great season.");
  });

  it("falls back to plain row text when recap is null", () => {
    const panel = createGameOverPanel({ onShare: () => {} });
    panel.refresh({ rows, finalDay: 50, seed: 1, recap: null, shareStatus: "" });
    const texts = labelTexts(panel.root);
    expect(texts.some((t) => t.includes("Rex") && t.includes("conservative"))).toBe(true);
  });

  it("wires the share button to onShare", () => {
    const onShare = vi.fn();
    const panel = createGameOverPanel({ onShare });
    panel.refresh({ rows, finalDay: 50, seed: 1, recap: null, shareStatus: "" });
    const [shareBtn] = findButtons(panel.root);
    expect(shareBtn?.label).toBe("Share this run");
    shareBtn?.onActivate?.();
    expect(onShare).toHaveBeenCalledOnce();
  });

  it("shows the share status text once set", () => {
    const panel = createGameOverPanel({ onShare: () => {} });
    panel.refresh({ rows, finalDay: 50, seed: 1, recap: null, shareStatus: "" });
    const changed = panel.refresh({
      rows,
      finalDay: 50,
      seed: 1,
      recap: null,
      shareStatus: "copied URL to clipboard",
    });
    expect(changed).toBe(true);
    expect(labelTexts(panel.root)).toContain("copied URL to clipboard");
  });

  it("refresh returns false when nothing layout-affecting changed", () => {
    const panel = createGameOverPanel({ onShare: () => {} });
    panel.refresh({ rows, finalDay: 50, seed: 1, recap: null, shareStatus: "" });
    const again = panel.refresh({ rows, finalDay: 50, seed: 1, recap: null, shareStatus: "" });
    expect(again).toBe(false);
  });
});
