import { describe, it, expect } from "vitest";
import { EDG } from "@engine/core";
import { createEventFeed, EVENT_FEED_CAP } from "./event-feed";
import type { EventFeedRow } from "./event-feed";
import type { LabelNode, UINode } from "@engine/ui";

/** Collect every label's text (in pre-order) whose text is non-empty. */
function labelTexts(node: UINode, out: LabelNode[] = []): LabelNode[] {
  if (node.kind === "label" && node.text.length > 0) out.push(node);
  for (const child of node.children) labelTexts(child, out);
  return out;
}

function row(day: number, text: string, drama?: number, farmerId?: number | null): EventFeedRow {
  const r: EventFeedRow = { day, text };
  if (drama !== undefined) r.drama = drama;
  if (farmerId !== undefined) r.farmerId = farmerId;
  return r;
}

describe("createEventFeed", () => {
  it("first refresh renders lines and reports changed", () => {
    const feed = createEventFeed();
    const changed = feed.refresh([row(1, "Pip watered a crop")]);
    expect(changed).toBe(true);

    const lines = labelTexts(feed.root);
    expect(lines.some((l) => l.text.includes("Day 1 — Pip watered a crop"))).toBe(true);
  });

  it("shows newest events first", () => {
    const feed = createEventFeed();
    feed.refresh([row(1, "first"), row(2, "second"), row(3, "third")]);

    const lines = labelTexts(feed.root).map((l) => l.text);
    const iThird = lines.findIndex((t) => t.includes("third"));
    const iFirst = lines.findIndex((t) => t.includes("first"));
    expect(iThird).toBeGreaterThanOrEqual(0);
    expect(iFirst).toBeGreaterThan(iThird);
  });

  it("high-drama events (>=0.7) render gold with a star prefix; others render green", () => {
    const feed = createEventFeed();
    feed.refresh([row(1, "a raid!", 0.9), row(2, "routine chore", 0.1)]);

    const lines = labelTexts(feed.root);
    const dramaLine = lines.find((l) => l.text.includes("a raid!"))!;
    expect(dramaLine.text.startsWith("★ ")).toBe(true);
    expect(dramaLine.color).toBe(EDG.gold);

    const routineLine = lines.find((l) => l.text.includes("routine chore"))!;
    expect(routineLine.text.startsWith("★ ")).toBe(false);
    expect(routineLine.color).toBe(EDG.green);
  });

  it("caps the visible rows at EVENT_FEED_CAP", () => {
    const feed = createEventFeed();
    const rows = Array.from({ length: EVENT_FEED_CAP + 10 }, (_, i) => row(i, `event ${i}`));
    feed.refresh(rows);

    const lines = labelTexts(feed.root).filter((l) => l.text.includes("event "));
    expect(lines.length).toBeLessThanOrEqual(EVENT_FEED_CAP);
    // The oldest events (below the cap window) must not appear.
    expect(lines.some((l) => l.text.includes("event 0"))).toBe(false);
  });

  it("refresh returns false when nothing layout-affecting changed", () => {
    const feed = createEventFeed();
    const rows = [row(1, "steady state")];
    feed.refresh(rows);
    const again = feed.refresh([row(1, "steady state")]);
    expect(again).toBe(false);
  });

  it("wheel() scrolls the feed without throwing", () => {
    const feed = createEventFeed();
    feed.refresh([row(1, "a"), row(2, "b"), row(3, "c")]);
    expect(() => feed.wheel(20)).not.toThrow();
  });
});
