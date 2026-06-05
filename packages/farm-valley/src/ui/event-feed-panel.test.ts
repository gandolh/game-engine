import { describe, it, expect, beforeEach } from "vitest";
import {
  EventFeedPanel,
  EVENT_FEED_PANEL_CAP,
  type EventFeedRow,
} from "./event-feed-panel";
import { EDG } from "@engine/core/render";

function lineTexts(parent: HTMLElement): string[] {
  const container = parent.querySelector("[data-event-feed-lines]") as HTMLElement;
  return Array.from(container.children).map((el) => el.textContent ?? "");
}

function lineColors(parent: HTMLElement): string[] {
  const container = parent.querySelector("[data-event-feed-lines]") as HTMLElement;
  return Array.from(container.children).map((el) => (el as HTMLElement).style.color);
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

  // ---- drama emphasis (brief 38) ------------------------------------------
  //
  // Note on color assertions: jsdom normalizes inline color values to rgb()
  // format (e.g. "#feae34" → "rgb(254, 174, 52)"). We compare against the EDG
  // hex values using a helper that converts hex to the same rgb() string form.

  /** Convert a "#rrggbb" hex color to the "rgb(r, g, b)" string jsdom uses. */
  function hexToRgb(hex: string): string {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgb(${r}, ${g}, ${b})`;
  }

  it("high-drama row (drama ≥ 0.7) gets the ★ prefix", () => {
    // Rows in chronological (oldest-first) order. Panel reverses for display.
    // Day 10 is older (index 0 in input = index 1 in display/newest-first).
    // Day 90 is newer (index 1 in input = index 0 in display/newest-first).
    const rows: EventFeedRow[] = [
      { day: 10, text: "Hannah bought 2 radish from Atticus (16g)", drama: 0.1 },
      { day: 90, text: "Otto overtakes Cora for 1st!", drama: 0.9 },
    ];
    panel.update(rows);

    const texts = lineTexts(parent);
    // Panel shows newest-first: day 90 is index 0.
    expect(texts[0]).toContain("★");
    expect(texts[1]).not.toContain("★");
  });

  it("high-drama row uses EDG.gold color, routine row uses EDG.green", () => {
    // Chronological order: day 5 first (older), day 90 second (newer).
    const rows: EventFeedRow[] = [
      { day: 5, text: "Routine.", drama: 0.05 },
      { day: 90, text: "High drama!", drama: 0.9 },
    ];
    panel.update(rows);

    const colors = lineColors(parent);
    // Newest-first: day 90 = index 0 (gold), day 5 = index 1 (green).
    expect(colors[0]).toBe(hexToRgb(EDG.gold));
    expect(colors[1]).toBe(hexToRgb(EDG.green));
  });

  it("a row without drama (undefined) is treated as routine (no ★, green color)", () => {
    const rows: EventFeedRow[] = [
      { day: 1, text: "No drama field" },
    ];
    panel.update(rows);

    const texts = lineTexts(parent);
    expect(texts[0]).not.toContain("★");
    expect(lineColors(parent)[0]).toBe(hexToRgb(EDG.green));
  });

  it("a node toggles emphasis correctly when re-rendered with different drama", () => {
    panel.update([{ day: 1, text: "event", drama: 0.9 }]);
    expect(lineTexts(parent)[0]).toContain("★");

    // Same DOM node, now routine.
    panel.update([{ day: 1, text: "event", drama: 0.1 }]);
    expect(lineTexts(parent)[0]).not.toContain("★");
    expect(lineColors(parent)[0]).toBe(hexToRgb(EDG.green));
  });
});
