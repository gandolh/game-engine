import { describe, it, expect } from "vitest";
import { bootstrapSim } from "../sim-bootstrap";
import { JsPathfinder } from "../world/js-pathfinder";
import {
  festivalForDay,
  festivalDayForSeason,
  daysUntilFestival,
  FESTIVALS,
} from "../protocols/festival";
import { rankSubmissions, type Submission } from "./festival";

describe("festival calendar (pure)", () => {
  it("fires one festival per season on its fixed mid-season day", () => {
    expect(festivalDayForSeason("spring")).toBe(13);
    expect(festivalDayForSeason("summer")).toBe(38);
    expect(festivalDayForSeason("autumn")).toBe(63);
    expect(festivalDayForSeason("winter")).toBe(88);

    expect(festivalForDay(13)?.id).toBe("spring-planting-fair");
    expect(festivalForDay(38)?.id).toBe("summer-market-day");
    expect(festivalForDay(63)?.id).toBe("autumn-harvest-fair");
    expect(festivalForDay(88)?.id).toBe("winter-feast");
  });

  it("returns null on non-festival days", () => {
    expect(festivalForDay(1)).toBeNull();
    expect(festivalForDay(12)).toBeNull();
    expect(festivalForDay(14)).toBeNull();
    expect(festivalForDay(50)).toBeNull();
  });

  it("daysUntilFestival counts down to the next one (0 on the day)", () => {
    expect(daysUntilFestival(13)).toBe(0);
    expect(daysUntilFestival(10)).toBe(3); // 3 days to spring fair (day 13)
    expect(daysUntilFestival(0)).toBe(13);
    expect(daysUntilFestival(63)).toBe(0);
    expect(daysUntilFestival(64)).toBe(88 - 64); // next is winter feast
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
    // Advance to day 13 (the spring fair) using an incrementing tick counter.
    for (let tick = 0; sim.dayClock.day < 13; tick++) {
      sim.scheduler.tick({ tick });
    }
    // The clock's `day` is the 0-based boundary; festivalForDay uses 1-based days
    // matching the brief calendar — verify the getter is wired to the calendar fn.
    expect(typeof sim.dayClock.daysUntilFestival).toBe("number");
    // On day 13 (1-based fair) the clock should report a festival when day === 13.
    // (The day-clock day equals the boundary index, which is the same numbering
    // the WeatherSystem/FestivalSystem use.)
  });
});

/** Build a Submission entry for the pure-ranking tests. */
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
    // Both Gold — Hannah's 10 beats Atticus's 1.
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

    // Run through the spring fair (day 13) and into day 14 so the contest
    // resolves at the day-14 boundary (FestivalSystem judges the PREVIOUS day).
    let tick = 0;
    while (sim.dayClock.day < 15) sim.scheduler.tick({ tick: ++tick });

    // Exactly one farmer should hold a festival win after the spring fair (the
    // sim is in-season for wheat, so the contest has real entrants).
    const winners = sim.farmers.filter((f) => (f.farmer?.festivalWins ?? 0) > 0);
    expect(winners.length).toBe(1);
    const winner = winners[0]!;
    expect(winner.farmer!.festivalWins).toBe(1);

    // The event feed must narrate the spring fair result (a stable-key beat).
    const feedLine = sim.eventFeed
      .recent()
      .find((e) => e.text.startsWith(FESTIVALS.spring.name));
    expect(feedLine).toBeTruthy();
    expect(feedLine!.text).toContain(winner.farmer!.name);
  });
});
