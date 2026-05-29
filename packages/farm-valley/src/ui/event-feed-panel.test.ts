import { describe, it, expect, beforeEach } from "vitest";
import {
  EventFeedPanel,
  EVENT_FEED_PANEL_CAP,
  type EventFeedRow,
} from "./event-feed-panel";

function lineTexts(parent: HTMLElement): string[] {
  const container = parent.querySelector("[data-event-feed-lines]") as HTMLElement;
  return Array.from(container.children).map((el) => el.textContent ?? "");
}

describe("EventFeedPanel", () => {
  let parent: HTMLElement;
  let panel: EventFeedPanel;

  beforeEach(() => {
    parent = document.createElement("div");
    document.body.appendChild(parent);
    panel = new EventFeedPanel(parent);
  });

  it("renders rows newest-first with a Day prefix", () => {
    const rows: EventFeedRow[] = [
      { day: 7, text: "Hannah bought 3 radish from Otto (24g)" },
      { day: 12, text: "Auction won by Cora at 45g" },
    ];
    panel.update(rows);

    expect(lineTexts(parent)).toEqual([
      "Day 12 — Auction won by Cora at 45g",
      "Day 7 — Hannah bought 3 radish from Otto (24g)",
    ]);
  });

  it("respects the display cap", () => {
    const rows: EventFeedRow[] = [];
    for (let i = 0; i < EVENT_FEED_PANEL_CAP + 15; i += 1) {
      rows.push({ day: i, text: `event ${i}` });
    }
    panel.update(rows);

    const texts = lineTexts(parent);
    expect(texts).toHaveLength(EVENT_FEED_PANEL_CAP);
    // Newest (last appended) shows first.
    const newest = rows[rows.length - 1]!;
    expect(texts[0]).toBe(`Day ${newest.day} — ${newest.text}`);
  });

  it("reconciles line count when fewer rows arrive", () => {
    panel.update([
      { day: 1, text: "a" },
      { day: 2, text: "b" },
      { day: 3, text: "c" },
    ]);
    expect(lineTexts(parent)).toHaveLength(3);

    panel.update([{ day: 4, text: "d" }]);
    expect(lineTexts(parent)).toEqual(["Day 4 — d"]);
  });
});
