

import { describe, it, expect } from "vitest";
import { ZERO_CROPS } from "./economy";
import { summarizeRun } from "./run-recap";
import type { RunHistoryRow } from "./systems/run-history";
import type { EventEntry } from "./systems/event-feed";
import type { FinalStandingRow, SnapshotRivalry } from "./snapshot";

function makeHistory(
  days: number,
  farmerCount: number,

  rankFn: (farmerId: number, day: number) => number,
): RunHistoryRow[] {
  const rows: RunHistoryRow[] = [];
  for (let d = 1; d <= days; d++) {
    for (let f = 1; f <= farmerCount; f++) {
      rows.push({ day: d, farmerId: f, gold: 100 + d * 10, rank: rankFn(f, d) });
    }
  }
  return rows;
}

function makeStandings(specs: Array<{ id: number; name: string; personality: string; rank: number; totalValue: number; gold: number }>): FinalStandingRow[] {
  return specs.map((s) => ({
    ...s,
    unsoldValue: s.totalValue - s.gold,
    crops: { ...ZERO_CROPS },
  }));
}

function makeEvent(text: string, day = 1, drama = 0): EventEntry {
  return { tick: day * 20, day, text, key: `${day}:${text}`, drama };
}

describe("summarizeRun — arc patterns", () => {
  it("produces a surge arc for a farmer that was last for most days then won", () => {
    const DAYS = 100;
    const FARMERS = 4;

    const history = makeHistory(DAYS, FARMERS, (id, day) => {
      if (id === 1) return day >= 80 ? 1 : 4;

      if (day >= 80) return id; 
      return id - 1; 
    });

    const standings = makeStandings([
      { id: 1, name: "Otto", personality: "opportunist", rank: 1, totalValue: 500, gold: 500 },
      { id: 2, name: "Cora", personality: "conservative", rank: 2, totalValue: 400, gold: 400 },
      { id: 3, name: "Hannah", personality: "hoarder", rank: 3, totalValue: 300, gold: 300 },
      { id: 4, name: "Atticus", personality: "aggressive", rank: 4, totalValue: 200, gold: 200 },
    ]);

    const recap = summarizeRun(history, [], standings);

    expect(recap.arcs[0]).toContain("Otto");
    expect(recap.arcs[0]).toMatch(/surged to 1st/);
  });

  it("produces a collapse arc for a farmer who led most days then fell", () => {
    const DAYS = 100;
    const FARMERS = 4;

    const history = makeHistory(DAYS, FARMERS, (id, day) => {
      if (id === 3) return day <= 70 ? 1 : 3;
      if (day <= 70) {

        if (id === 1) return 2;
        if (id === 2) return 3;
        return 4; 
      } else {

        if (id === 1) return 1;
        if (id === 2) return 2;
        return 4;
      }
    });

    const standings = makeStandings([
      { id: 1, name: "Cora", personality: "conservative", rank: 1, totalValue: 500, gold: 500 },
      { id: 2, name: "Atticus", personality: "aggressive", rank: 2, totalValue: 400, gold: 400 },
      { id: 3, name: "Hannah", personality: "hoarder", rank: 3, totalValue: 300, gold: 300 },
      { id: 4, name: "Otto", personality: "opportunist", rank: 4, totalValue: 200, gold: 200 },
    ]);

    const recap = summarizeRun(history, [], standings);

    expect(recap.arcs[2]).toContain("Hannah");
    expect(recap.arcs[2]).toMatch(/led for \d+ days.*collapsed/);
  });

  it("produces a steady arc for a farmer who stays in the top half", () => {
    const DAYS = 100;
    const FARMERS = 4;

    const history = makeHistory(DAYS, FARMERS, (id, _day) => id);

    const standings = makeStandings([
      { id: 1, name: "Cora", personality: "conservative", rank: 1, totalValue: 500, gold: 500 },
      { id: 2, name: "Atticus", personality: "aggressive", rank: 2, totalValue: 400, gold: 400 },
      { id: 3, name: "Hannah", personality: "hoarder", rank: 3, totalValue: 300, gold: 300 },
      { id: 4, name: "Otto", personality: "opportunist", rank: 4, totalValue: 200, gold: 200 },
    ]);

    const recap = summarizeRun(history, [], standings);

    expect(recap.arcs[1]).toContain("Atticus");
    expect(recap.arcs[1]).toMatch(/steady|consistent/);
  });
});

describe("summarizeRun — standings with midRankDelta", () => {
  it("computes midRankDelta correctly", () => {
    const DAYS = 100;

    const history = makeHistory(DAYS, 2, (id, day) => {
      if (id === 1) return day <= 50 ? 3 : 1; 
      return day <= 50 ? 1 : 2;
    });

    const history2 = makeHistory(DAYS, 2, (id, day) => {
      if (id === 1) return day <= 50 ? 2 : 1;
      return day <= 50 ? 1 : 2;
    });

    const standings = makeStandings([
      { id: 1, name: "A", personality: "conservative", rank: 1, totalValue: 200, gold: 200 },
      { id: 2, name: "B", personality: "aggressive", rank: 2, totalValue: 100, gold: 100 },
    ]);

    const recap = summarizeRun(history2, [], standings);

    expect(recap.standings[0]!.midRankDelta).toBe(1);

    expect(recap.standings[1]!.midRankDelta).toBe(-1);
  });

  it("uses final rank when no mid-season history exists (empty history)", () => {
    const standings = makeStandings([
      { id: 1, name: "A", personality: "conservative", rank: 1, totalValue: 200, gold: 200 },
    ]);
    const recap = summarizeRun([], [], standings);

    expect(recap.standings[0]!.midRankDelta).toBe(0);
  });
});

describe("summarizeRun — headline", () => {
  it("uses the biggest trade event in the headline", () => {
    const standings = makeStandings([
      { id: 1, name: "Cora", personality: "conservative", rank: 1, totalValue: 500, gold: 500 },
    ]);
    const events: EventEntry[] = [
      makeEvent("Cora bought 5 wheat from Otto (70g)", 10),
      makeEvent("Atticus bought 2 radish from Hannah (16g)", 20),
    ];
    const recap = summarizeRun([], events, standings);
    expect(recap.headline).toContain("70g");
    expect(recap.headline).toMatch(/The story of the run/);
  });

  it("falls back to the winner name when no notable events", () => {
    const standings = makeStandings([
      { id: 1, name: "Cora", personality: "conservative", rank: 1, totalValue: 500, gold: 500 },
    ]);
    const recap = summarizeRun([], [], standings);
    expect(recap.headline).toContain("Cora");
    expect(recap.headline).toContain("500g");
  });

  it("includes drought text when a shock event is present", () => {
    const standings = makeStandings([
      { id: 1, name: "Otto", personality: "opportunist", rank: 1, totalValue: 600, gold: 600 },
    ]);
    const events: EventEntry[] = [
      makeEvent("Drought! Atticus lost 2 crops", 50),
    ];
    const recap = summarizeRun([], events, standings);
    expect(recap.headline.toLowerCase()).toContain("drought");
  });
});

describe("summarizeRun — headline drama-based selection (brief 38)", () => {
  const standings = makeStandings([
    { id: 1, name: "Cora", personality: "conservative", rank: 1, totalValue: 500, gold: 500 },
  ]);

  it("prefers the highest-drama event as the headline source", () => {

    const events: EventEntry[] = [
      makeEvent("Cora bought 5 wheat from Otto (70g)", 10, 0.1),
      makeEvent("Atticus overtakes Hannah for 1st!", 80, 0.9),
    ];
    const recap = summarizeRun([], events, standings);
    expect(recap.headline).toContain("Atticus overtakes Hannah for 1st!");
  });

  it("when multiple events share max drama, picks the latest-day one", () => {
    const events: EventEntry[] = [
      makeEvent("Drought! Hannah lost 2 crops", 30, 0.85),
      makeEvent("Cora overtakes Otto for 1st!", 90, 0.85),
    ];
    const recap = summarizeRun([], events, standings);

    expect(recap.headline).toContain("Cora overtakes Otto for 1st!");
  });

  it("falls back to text-based heuristics when all drama scores are zero", () => {
    const events: EventEntry[] = [
      makeEvent("Cora bought 5 wheat from Otto (70g)", 10, 0),
      makeEvent("Drought! Hannah lost 2 crops", 50, 0),
    ];
    const recap = summarizeRun([], events, standings);

    expect(recap.headline.toLowerCase()).toContain("drought");
    expect(recap.headline.toLowerCase()).toContain("70g");
  });

  it("uses winner fallback when events list is empty", () => {
    const recap = summarizeRun([], [], standings);
    expect(recap.headline).toContain("Cora");
  });
});

describe("summarizeRun — rivalries (brief 37)", () => {
  const standings = makeStandings([
    { id: 1, name: "Atticus", personality: "aggressive", rank: 1, totalValue: 500, gold: 500 },
    { id: 2, name: "Hannah", personality: "hoarder", rank: 2, totalValue: 400, gold: 400 },
  ]);

  it("includes rivalry line when active rivalries provided", () => {
    const rivalries: SnapshotRivalry[] = [
      { aId: 1, bId: 2, aName: "Atticus", bName: "Hannah", score: 5, kind: "rivalry" },
    ];
    const recap = summarizeRun([], [], standings, rivalries);
    expect(recap.rivalries).toBeDefined();
    expect(recap.rivalries).toHaveLength(1);
    expect(recap.rivalries![0]).toContain("Atticus");
    expect(recap.rivalries![0]).toContain("Hannah");
    expect(recap.rivalries![0]).toContain("5");
  });

  it("includes alliance line for alliance kind", () => {
    const rivalries: SnapshotRivalry[] = [
      { aId: 1, bId: 2, aName: "Cora", bName: "Otto", score: 0, kind: "alliance" },
    ];
    const recap = summarizeRun([], [], standings, rivalries);
    expect(recap.rivalries).toBeDefined();
    expect(recap.rivalries![0]).toContain("Cora");
    expect(recap.rivalries![0]).toContain("Otto");
    expect(recap.rivalries![0]).toContain("alliance");
  });

  it("omits rivalries field when no rivalries provided", () => {
    const recap = summarizeRun([], [], standings);
    expect(recap.rivalries).toBeUndefined();
  });

  it("omits rivalries field when empty array provided", () => {
    const recap = summarizeRun([], [], standings, []);
    expect(recap.rivalries).toBeUndefined();
  });
});

describe("summarizeRun — determinism", () => {
  it("same inputs produce identical RunRecap (deep-equal across two calls)", () => {
    const DAYS = 10;
    const history = makeHistory(DAYS, 3, (id, _day) => id);
    const standings = makeStandings([
      { id: 1, name: "Cora", personality: "conservative", rank: 1, totalValue: 500, gold: 500 },
      { id: 2, name: "Atticus", personality: "aggressive", rank: 2, totalValue: 400, gold: 400 },
      { id: 3, name: "Hannah", personality: "hoarder", rank: 3, totalValue: 300, gold: 300 },
    ]);
    const events: EventEntry[] = [
      makeEvent("Cora bought 5 wheat from Otto (70g)", 5),
      makeEvent("Drought! Hannah lost 1 crop", 7),
    ];

    const a = summarizeRun(history, events, standings);
    const b = summarizeRun(history, events, standings);

    expect(b).toEqual(a);
  });
});
