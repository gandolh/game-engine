import { describe, it, expect } from "vitest";
import { createNoticeBoard, createStandingsPost } from "./diegetic-hud";
import type { UINode, LabelNode } from "@engine/ui";
import { EDG } from "@engine/core";
import type { EventFeedRow } from "./event-feed";
import type { LeaderboardRow } from "./leaderboard";

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

const ev = (day: number, text: string, drama = 0): EventFeedRow => ({ day, text, drama });
const lb = (rank: number, name: string, totalValue: number): LeaderboardRow => ({
  rank, id: rank, name, personality: "conservative", gold: 0, unsoldValue: 0, totalValue,
});

describe("createNoticeBoard", () => {
  it("shows the most recent events newest-first with a title", () => {
    const nb = createNoticeBoard();
    const changed = nb.refresh({ events: [ev(1, "planted wheat"), ev(2, "sold radish"), ev(3, "rain came")] });
    expect(changed).toBe(true);
    const texts = labelTexts(nb.root);
    expect(texts).toContain("Notice Board");
    expect(texts).toContain("Day 3: rain came"); // newest first
    expect(texts.indexOf("Day 3: rain came")).toBeLessThan(texts.indexOf("Day 2: sold radish"));
  });

  it("colours high-drama events gold", () => {
    const nb = createNoticeBoard();
    nb.refresh({ events: [ev(5, "a rivalry ignites", 0.9)] });
    const line = findLabel(nb.root, "Day 5:");
    expect(line?.color).toBe(EDG.gold);
  });

  it("returns false when nothing changed", () => {
    const nb = createNoticeBoard();
    const events = [ev(1, "planted wheat")];
    nb.refresh({ events });
    expect(nb.refresh({ events })).toBe(false);
  });
});

describe("createStandingsPost", () => {
  it("shows day/time header and top-3 with rank colours", () => {
    const sp = createStandingsPost();
    const changed = sp.refresh({
      day: 12, timeLabel: "12:00 PM",
      rows: [lb(1, "Cora", 500), lb(2, "Atticus", 400), lb(3, "Hannah", 300), lb(4, "Otto", 200)],
    });
    expect(changed).toBe(true);
    const texts = labelTexts(sp.root);
    expect(texts).toContain("Standings");
    expect(texts).toContain("Day 12  12:00 PM");
    expect(texts).toContain("1. Cora  500g");
    expect(texts).toContain("3. Hannah  300g");
    // Only top-3 rendered.
    expect(texts.some((t) => t.includes("Otto"))).toBe(false);
    const first = findLabel(sp.root, "1. Cora");
    expect(first?.color).toBe(EDG.gold);
  });

  it("returns false when nothing changed", () => {
    const sp = createStandingsPost();
    const state = { day: 1, timeLabel: "6:00 AM", rows: [lb(1, "Cora", 100)] };
    sp.refresh(state);
    expect(sp.refresh(state)).toBe(false);
  });
});
