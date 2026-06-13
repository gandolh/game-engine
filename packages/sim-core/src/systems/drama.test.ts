

import { describe, it, expect } from "vitest";
import { dramaScore, actBandForDay, type DramaCtx } from "./drama";

describe("actBandForDay", () => {
  it("returns 'establishment' for the first 30% of days (maxDays=100)", () => {
    expect(actBandForDay(1, 100)).toBe("establishment");
    expect(actBandForDay(15, 100)).toBe("establishment");
    expect(actBandForDay(30, 100)).toBe("establishment");
  });

  it("returns 'competition' for days 31–70 at maxDays=100", () => {
    expect(actBandForDay(31, 100)).toBe("competition");
    expect(actBandForDay(50, 100)).toBe("competition");
    expect(actBandForDay(70, 100)).toBe("competition");
  });

  it("returns 'climax' for the last 30% of days (maxDays=100)", () => {
    expect(actBandForDay(71, 100)).toBe("climax");
    expect(actBandForDay(90, 100)).toBe("climax");
    expect(actBandForDay(100, 100)).toBe("climax");
  });

  it("generalises to maxDays=50", () => {

    expect(actBandForDay(1, 50)).toBe("establishment");
    expect(actBandForDay(15, 50)).toBe("establishment");

    expect(actBandForDay(16, 50)).toBe("competition");
    expect(actBandForDay(35, 50)).toBe("competition");

    expect(actBandForDay(36, 50)).toBe("climax");
    expect(actBandForDay(50, 50)).toBe("climax");
  });

  it("handles day 0 and degenerate maxDays gracefully", () => {
    expect(actBandForDay(0, 100)).toBe("establishment"); 
    expect(actBandForDay(5, 0)).toBe("climax");           
  });
});

describe("dramaScore", () => {
  const maxDays = 100;

  it("a rank-flip on day 95 (climax) scores higher than the same flip on day 5 (establishment)", () => {
    const earlyCtx: DramaCtx = { day: 5, maxDays };
    const lateCtx: DramaCtx = { day: 95, maxDays };
    const earlyScore = dramaScore("rank-flip", earlyCtx);
    const lateScore = dramaScore("rank-flip", lateCtx);
    expect(lateScore).toBeGreaterThan(earlyScore);
  });

  it("a rank-flip on day 50 (competition) scores between establishment and climax", () => {
    const earlyScore = dramaScore("rank-flip", { day: 5, maxDays });
    const midScore = dramaScore("rank-flip", { day: 50, maxDays });
    const lateScore = dramaScore("rank-flip", { day: 95, maxDays });
    expect(midScore).toBeGreaterThan(earlyScore);
    expect(lateScore).toBeGreaterThan(midScore);
  });

  it("a trade scores low (< 0.3) regardless of act band", () => {
    expect(dramaScore("trade", { day: 1, maxDays })).toBeLessThan(0.3);
    expect(dramaScore("trade", { day: 50, maxDays })).toBeLessThan(0.3);
    expect(dramaScore("trade", { day: 95, maxDays })).toBeLessThan(0.3);
  });

  it("a blight shock scores high (≥ 0.8) in the competition act", () => {
    expect(dramaScore("shock", { day: 50, maxDays })).toBeGreaterThanOrEqual(0.8);
  });

  it("a blight shock scores high (≥ 0.8) in the climax act", () => {
    expect(dramaScore("shock", { day: 90, maxDays })).toBeGreaterThanOrEqual(0.8);
  });

  it("a race-on event scores high (≥ 0.8) in the climax act", () => {
    expect(dramaScore("race-on", { day: 92, maxDays })).toBeGreaterThanOrEqual(0.8);
  });

  it("an auction scores medium (≥ 0.4) in the competition act", () => {
    expect(dramaScore("auction", { day: 50, maxDays })).toBeGreaterThanOrEqual(0.4);
  });

  it("score is always clamped to [0, 1]", () => {
    const kinds: Array<import("./drama").DramaEventKind> = [
      "trade", "auction", "shock", "crop-death", "accept",
      "rivalry", "alliance", "rank-flip", "race-on",
    ];
    for (const kind of kinds) {
      for (const day of [1, 50, 100]) {
        const s = dramaScore(kind, { day, maxDays });
        expect(s).toBeGreaterThanOrEqual(0);
        expect(s).toBeLessThanOrEqual(1);
      }
    }
  });

  it("same inputs produce identical scores across two calls", () => {
    const ctx: DramaCtx = { day: 77, maxDays: 100 };
    expect(dramaScore("rank-flip", ctx)).toBe(dramaScore("rank-flip", ctx));
    expect(dramaScore("shock", ctx)).toBe(dramaScore("shock", ctx));
    expect(dramaScore("trade", ctx)).toBe(dramaScore("trade", ctx));
  });
});
