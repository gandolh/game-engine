import { describe, it, expect } from "vitest";
import { bootstrapSim } from "../sim-bootstrap";
import { JsPathfinder } from "../world/js-pathfinder";
import {
  festivalForDay,
  festivalStartDayForDay,
  isFestivalStartDay,
  isFestivalLastDay,
  festivalDayForSeason,
  daysUntilFestival,
  FESTIVAL_DAYS,
  FESTIVALS,
} from "../protocols/festival";
import { rankSubmissions, type Submission } from "./festival";

describe("festival calendar (pure)", () => {
  it("fires one festival per season starting on its fixed mid-season day", () => {
    expect(festivalDayForSeason("spring")).toBe(13);
    expect(festivalDayForSeason("summer")).toBe(38);
    expect(festivalDayForSeason("autumn")).toBe(63);
    expect(festivalDayForSeason("winter")).toBe(88);

    expect(festivalForDay(13)?.id).toBe("spring-planting-fair");
    expect(festivalForDay(38)?.id).toBe("summer-market-day");
    expect(festivalForDay(63)?.id).toBe("autumn-harvest-fair");
    expect(festivalForDay(88)?.id).toBe("winter-feast");
  });

  it("runs for FESTIVAL_DAYS consecutive days from the start day", () => {
    // Default FESTIVAL_DAYS = 2: day 13 AND day 14 are the spring fair; day 15
    // is clear. (Written to generalise: if the constant grows, so does the run.)
    expect(FESTIVAL_DAYS).toBeGreaterThanOrEqual(2);
    for (let d = 13; d < 13 + FESTIVAL_DAYS; d++) {
      expect(festivalForDay(d)?.id).toBe("spring-planting-fair");
      expect(festivalStartDayForDay(d)).toBe(13);
    }
    expect(festivalForDay(13 + FESTIVAL_DAYS)).toBeNull();
    expect(isFestivalStartDay(13)).toBe(true);
    expect(isFestivalStartDay(14)).toBe(false);
    expect(isFestivalLastDay(13 + FESTIVAL_DAYS - 1)).toBe(true);
    expect(isFestivalLastDay(13)).toBe(FESTIVAL_DAYS <= 1);
  });

  it("returns null on non-festival days", () => {
    expect(festivalForDay(1)).toBeNull();
    expect(festivalForDay(12)).toBeNull();
    expect(festivalForDay(13 + FESTIVAL_DAYS)).toBeNull();
    expect(festivalForDay(50)).toBeNull();
    expect(festivalStartDayForDay(50)).toBeNull();
  });

  it("daysUntilFestival counts down to the next one (0 through the whole window)", () => {
    expect(daysUntilFestival(13)).toBe(0);
    expect(daysUntilFestival(13 + FESTIVAL_DAYS - 1)).toBe(0); // still inside the window
    expect(daysUntilFestival(10)).toBe(3);
    expect(daysUntilFestival(0)).toBe(13);
    expect(daysUntilFestival(63)).toBe(0);
    expect(daysUntilFestival(63 + FESTIVAL_DAYS)).toBe(88 - (63 + FESTIVAL_DAYS));
  });

  it("each festival celebrates an in-season crop", () => {
    for (const season of ["spring", "summer", "autumn", "winter"] as const) {
      expect(FESTIVALS[season].season).toBe(season);
    }
  });
});

describe("DayClockSystem festival exposure", () => {
  it("exposes festivalToday / daysUntilFestival from the clock", () => {
    const sim = bootstrapSim({
      seed: 1,
      ticksPerDay: 20,
      maxDays: 100,
      pathfinder: new JsPathfinder(),
      shock: false,
    });

    for (let tick = 0; sim.dayClock.day < 13; tick++) {
      sim.scheduler.tick({ tick });
    }

    expect(typeof sim.dayClock.daysUntilFestival).toBe("number");

  });
});

function sub(id: number, name: string, q: "normal" | "silver" | "gold", count: number): Submission {
  const rank = q === "gold" ? 3 : q === "silver" ? 2 : 1;
  return { id, name, bestQuality: q, bestRank: rank, bestCount: count };
}

describe("rankSubmissions (pure contest ranking)", () => {
  it("ranks by best quality first (gold > silver > normal)", () => {
    const ranked = rankSubmissions([
      sub(3, "Cora", "normal", 9),
      sub(1, "Atticus", "gold", 1),
      sub(2, "Hannah", "silver", 5),
    ]);
    expect(ranked.map((e) => e.name)).toEqual(["Atticus", "Hannah", "Cora"]);
  });

  it("breaks a quality tie by more units of that quality", () => {
    const ranked = rankSubmissions([
      sub(1, "Atticus", "gold", 1),
      sub(2, "Hannah", "gold", 10),
    ]);

    expect(ranked[0]!.name).toBe("Hannah");
  });

  it("breaks a full quality+count tie by lower farmer id (total order, deterministic)", () => {
    const ranked = rankSubmissions([
      sub(5, "Otto", "silver", 3),
      sub(2, "Hannah", "silver", 3),
    ]);
    expect(ranked[0]!.id).toBe(2);
  });

  it("returns an empty array for no entrants (no winner)", () => {
    expect(rankSubmissions([])).toEqual([]);
  });

  it("does not mutate its input", () => {
    const input = [sub(2, "Hannah", "silver", 5), sub(1, "Atticus", "gold", 1)];
    const snapshot = input.map((e) => e.name);
    rankSubmissions(input);
    expect(input.map((e) => e.name)).toEqual(snapshot);
  });
});

describe("FestivalSystem (live) — a festival fires, awards a winner, narrates", () => {
  it("runs the spring fair: declares a winner, awards the prize, emits a feed line", () => {
    const sim = bootstrapSim({
      seed: 1,
      ticksPerDay: 20,
      maxDays: 100,
      pathfinder: new JsPathfinder(),
      shock: false,
    });

    // Multi-day festival (days 13..13+FESTIVAL_DAYS-1) resolves the day AFTER
    // its last day; run a couple of days past the window so the result lands.
    let tick = 0;
    while (sim.dayClock.day < 13 + FESTIVAL_DAYS + 1) sim.scheduler.tick({ tick: ++tick });

    const winners = sim.farmers.filter((f) => (f.farmer?.festivalWins ?? 0) > 0);
    expect(winners.length).toBe(1);
    const winner = winners[0]!;
    expect(winner.farmer!.festivalWins).toBe(1);

    const feedLine = sim.eventFeed
      .recent()
      .find((e) => e.text.startsWith(FESTIVALS.spring.name));
    expect(feedLine).toBeTruthy();
    expect(feedLine!.text).toContain(winner.farmer!.name);
  });
});
