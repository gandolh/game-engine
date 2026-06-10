import { describe, it, expect, beforeEach } from "vitest";
import { LeaderboardPanel, type LeaderboardRow } from "./leaderboard";

function makeRow(
  overrides: Partial<LeaderboardRow> & Pick<LeaderboardRow, "id" | "name">,
): LeaderboardRow {
  return {
    rank: overrides.rank ?? 1,
    id: overrides.id,
    name: overrides.name,
    personality: overrides.personality ?? "conservative",
    gold: overrides.gold ?? 100,
    unsoldValue: overrides.unsoldValue ?? 0,
    totalValue: overrides.totalValue ?? (overrides.gold ?? 100) + (overrides.unsoldValue ?? 0),
  };
}

function makeRows4Sorted(): LeaderboardRow[] {
  return [
    makeRow({ rank: 1, id: 2, name: "Atticus", personality: "aggressive", gold: 200, unsoldValue: 50, totalValue: 250 }),
    makeRow({ rank: 2, id: 3, name: "Hannah", personality: "hoarder", gold: 150, unsoldValue: 60, totalValue: 210 }),
    makeRow({ rank: 3, id: 4, name: "Otto", personality: "opportunist", gold: 100, unsoldValue: 80, totalValue: 180 }),
    makeRow({ rank: 4, id: 1, name: "Cora", personality: "conservative", gold: 80, unsoldValue: 10, totalValue: 90 }),
  ];
}

describe("LeaderboardPanel", () => {
  let parent: HTMLElement;
  let panel: LeaderboardPanel;

  beforeEach(() => {
    parent = document.createElement("div");
    document.body.appendChild(parent);
    panel = new LeaderboardPanel(parent);
  });

  it("initial render shows 4 rows sorted by totalValue desc with correct rank chips", () => {
    const rows = makeRows4Sorted();
    panel.update(rows);

    const container = parent.querySelector("div > div:last-child") as HTMLElement;
    const rowEls = container.querySelectorAll("[data-farmer-id]");
    expect(rowEls).toHaveLength(4);

    // Check farmer ids appear in rank order (Atticus=2, Hannah=3, Otto=4, Cora=1)
    const ids = Array.from(rowEls).map((el) => Number((el as HTMLElement).dataset["farmerId"]));
    expect(ids).toEqual([2, 3, 4, 1]);

    // Rank chips show #1 through #4
    const rankSpans = Array.from(rowEls).map((el) => el.querySelector("span")?.textContent);
    expect(rankSpans).toEqual(["#1", "#2", "#3", "#4"]);

    // Total values are shown correctly
    const totalSpans = Array.from(rowEls).map((el) => {
      const spans = el.querySelectorAll("span");
      return spans[spans.length - 1]?.textContent;
    });
    expect(totalSpans).toEqual(["250g", "210g", "180g", "90g"]);
  });

  it("tied totals stable-sort by id when ranks match", () => {
    const rows: LeaderboardRow[] = [
      makeRow({ rank: 1, id: 1, name: "Cora", gold: 100, unsoldValue: 0, totalValue: 100 }),
      makeRow({ rank: 2, id: 2, name: "Atticus", gold: 100, unsoldValue: 0, totalValue: 100 }),
    ];
    panel.update(rows);

    const container = parent.querySelector("div > div:last-child") as HTMLElement;
    const rowEls = container.querySelectorAll("[data-farmer-id]");
    expect(rowEls).toHaveLength(2);

    const ids = Array.from(rowEls).map((el) => Number((el as HTMLElement).dataset["farmerId"]));
    expect(ids).toEqual([1, 2]);
  });

  it("second update() with identical data does not thrash DOM (textContent unchanged)", () => {
    const rows = makeRows4Sorted();
    panel.update(rows);

    const container = parent.querySelector("div > div:last-child") as HTMLElement;
    const firstRowEl = container.querySelectorAll("[data-farmer-id]")[0] as HTMLElement;
    const rankSpan = firstRowEl.querySelector("span") as HTMLElement;

    // Spy on textContent setter to detect re-writes
    const originalSetter = Object.getOwnPropertyDescriptor(Node.prototype, "textContent")!;
    let writeCount = 0;
    Object.defineProperty(Node.prototype, "textContent", {
      ...originalSetter,
      set(value: string) {
        if (this === rankSpan) writeCount++;
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call
        originalSetter.set!.call(this, value);
      },
    });

    try {
      panel.update(rows);
      panel.update(rows);
      expect(writeCount).toBe(0);
    } finally {
      Object.defineProperty(Node.prototype, "textContent", originalSetter);
    }
  });

  it("rank chips update when order flips after a re-render", () => {
    const rows = makeRows4Sorted();
    panel.update(rows);

    // Flip: Cora (id=1) now leads with totalValue=500
    const flipped: LeaderboardRow[] = [
      makeRow({ rank: 1, id: 1, name: "Cora", personality: "conservative", gold: 490, unsoldValue: 10, totalValue: 500 }),
      makeRow({ rank: 2, id: 2, name: "Atticus", personality: "aggressive", gold: 200, unsoldValue: 50, totalValue: 250 }),
      makeRow({ rank: 3, id: 3, name: "Hannah", personality: "hoarder", gold: 150, unsoldValue: 60, totalValue: 210 }),
      makeRow({ rank: 4, id: 4, name: "Otto", personality: "opportunist", gold: 100, unsoldValue: 80, totalValue: 180 }),
    ];
    panel.update(flipped);

    const container = parent.querySelector("div > div:last-child") as HTMLElement;
    const rowEls = container.querySelectorAll("[data-farmer-id]");

    // First row should now be Cora (id=1)
    expect((rowEls[0] as HTMLElement).dataset["farmerId"]).toBe("1");
    const rankSpan = (rowEls[0] as HTMLElement).querySelector("span");
    expect(rankSpan?.textContent).toBe("#1");

    // Atticus now #2
    expect((rowEls[1] as HTMLElement).dataset["farmerId"]).toBe("2");
    const rank2Span = (rowEls[1] as HTMLElement).querySelector("span");
    expect(rank2Span?.textContent).toBe("#2");
  });

  it("setVisible hides and shows the panel", () => {
    panel.setVisible(false);
    const panelEl = parent.querySelector("div") as HTMLElement;
    expect(panelEl.style.display).toBe("none");

    panel.setVisible(true);
    expect(panelEl.style.display).toBe("");
  });

  it("destroy() removes the panel from the DOM", () => {
    panel.destroy();
    expect(parent.querySelector("div")).toBeNull();
  });
});
