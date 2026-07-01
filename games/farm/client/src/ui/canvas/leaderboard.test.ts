import { describe, it, expect } from "vitest";
import { EDG } from "@engine/core";
import type { LabelNode, UINode } from "@engine/ui";
import { createLeaderboard, type LeaderboardRow } from "./leaderboard";

function walk(node: UINode, out: UINode[] = []): UINode[] {
  out.push(node);
  for (const c of node.children) walk(c, out);
  return out;
}
function labels(root: UINode): LabelNode[] {
  return walk(root).filter((n): n is LabelNode => n.kind === "label");
}
function row(overrides: Partial<LeaderboardRow>): LeaderboardRow {
  return {
    rank: 1,
    id: 1,
    name: "Pip",
    personality: "conservative",
    gold: 10,
    unsoldValue: 5,
    totalValue: 15,
    ...overrides,
  };
}

describe("createLeaderboard — data binding", () => {
  it("renders ranked rows with name, personality, and total", () => {
    const lb = createLeaderboard();
    lb.refresh([
      row({ rank: 1, id: 1, name: "Pip", totalValue: 100 }),
      row({ rank: 2, id: 2, name: "Ada", personality: "aggressive", totalValue: 80 }),
    ]);
    const texts = labels(lb.root).map((l) => l.text);
    expect(texts).toContain("#1");
    expect(texts).toContain("Pip");
    expect(texts).toContain("100g");
    expect(texts).toContain("#2");
    expect(texts).toContain("Ada");
    expect(texts).toContain("80g");
  });

  it("colour-codes rank 1/2/3 as gold/silver/clay, others steel", () => {
    const lb = createLeaderboard();
    lb.refresh([
      row({ rank: 1, id: 1 }),
      row({ rank: 2, id: 2 }),
      row({ rank: 3, id: 3 }),
      row({ rank: 4, id: 4 }),
    ]);
    const ranks = labels(lb.root).filter((l) => /^#\d$/.test(l.text));
    expect(ranks.find((l) => l.text === "#1")?.color).toBe(EDG.gold);
    expect(ranks.find((l) => l.text === "#2")?.color).toBe(EDG.silver);
    expect(ranks.find((l) => l.text === "#3")?.color).toBe(EDG.clay);
    expect(ranks.find((l) => l.text === "#4")?.color).toBe(EDG.steel);
  });

  it("reorders rows in the tree to match rank order across refreshes", () => {
    const lb = createLeaderboard();
    lb.refresh([row({ rank: 1, id: 1, name: "Pip" }), row({ rank: 2, id: 2, name: "Ada" })]);
    lb.refresh([row({ rank: 1, id: 2, name: "Ada" }), row({ rank: 2, id: 1, name: "Pip" })]);
    const texts = labels(lb.root).map((l) => l.text);
    const adaIdx = texts.indexOf("Ada");
    const pipIdx = texts.indexOf("Pip");
    expect(adaIdx).toBeLessThan(pipIdx);
  });

  it("drops a row once its farmer is no longer in the ranked list", () => {
    const lb = createLeaderboard();
    lb.refresh([row({ id: 1, name: "Pip" }), row({ id: 2, name: "Ada" })]);
    lb.refresh([row({ id: 1, name: "Pip" })]);
    const texts = labels(lb.root).map((l) => l.text);
    expect(texts).not.toContain("Ada");
  });

  it("reports changed on first refresh, then false when nothing changes", () => {
    const lb = createLeaderboard();
    expect(lb.refresh([row({})])).toBe(true);
    expect(lb.refresh([row({})])).toBe(false);
  });

  it("triggers a score-bump scale animation on the total label when totalValue increases", () => {
    const lb = createLeaderboard();
    lb.refresh([row({ id: 1, totalValue: 100 })]);
    const totalLbl = labels(lb.root).find((l) => l.text === "100g")!;
    expect(totalLbl.scale ?? 1).toBe(1);

    lb.refresh([row({ id: 1, totalValue: 150 })], 100); // 100ms into the 350ms bump
    expect(totalLbl.scale).toBeGreaterThan(1);

    // Advance past the bump duration (dt is clamped per-call, so tick repeatedly like real
    // frames) — settles back to scale 1.
    for (let i = 0; i < 10; i++) {
      lb.refresh([row({ id: 1, totalValue: 150 })], 100);
    }
    expect(totalLbl.scale).toBe(1);
  });

  it("does not bump when totalValue is unchanged or decreases", () => {
    const lb = createLeaderboard();
    lb.refresh([row({ id: 1, totalValue: 100 })]);
    lb.refresh([row({ id: 1, totalValue: 100 })], 100);
    const totalLbl = labels(lb.root).find((l) => l.text === "100g")!;
    expect(totalLbl.scale ?? 1).toBe(1);

    lb.refresh([row({ id: 1, totalValue: 80 })], 100);
    const totalLbl2 = labels(lb.root).find((l) => l.text === "80g")!;
    expect(totalLbl2.scale ?? 1).toBe(1);
  });
});
