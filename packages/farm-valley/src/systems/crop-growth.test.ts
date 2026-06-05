import { describe, it, expect, beforeEach } from "vitest";
import { World, createRng } from "@engine/core";
import type { GameEntity, PlotState } from "../components";
import { spawnWeatherStation } from "../agents/weather-station";
import { CropGrowthSystem } from "./crop-growth";
import { computeQuality } from "./harvest";
import { cropInventoryValue, ZERO_CROPS } from "../economy";
import { PERFORMATIVE, ONT_SIMULATION } from "../protocols";

function makeWorld(): World<GameEntity> {
  return new World<GameEntity>();
}

function makeContext(tick = 0) {
  return { tick, deltaMs: 16, totalMs: tick * 16 };
}

function sendDayStart(world: World<GameEntity>, day: number): void {
  const stations = world.query("weatherStation", "inbox");
  for (const s of stations) {
    s.inbox.messages.push({
      performative: PERFORMATIVE.INFORM,
      ontology: ONT_SIMULATION.DAY_START,
      sender: "world",
      body: { day },
      tickIssued: 0,
    });
  }
}

function spawnPlot(world: World<GameEntity>, ownerId: number): GameEntity {
  return world.spawn({
    plot: {
      ownerId,
      regionId: "farm-cora" as const,
      tileX: 0,
      tileY: 0,
      state: {
        kind: "planted",
        crop: "radish",
        daysGrowing: 0,
        readyAtDay: 5,
        weatherSum: 0,
        // brief 29 — start watered so the first day grows (mirrors planting,
        // which marks the soil watered). Tests re-water before later days.
        daysSinceWater: 0,
        wateredToday: true,
      } satisfies PlotState,
    },
  });
}

describe("CropGrowthSystem", () => {
  let world: World<GameEntity>;
  let system: CropGrowthSystem;

  beforeEach(() => {
    world = makeWorld();
    spawnWeatherStation(world);
    system = new CropGrowthSystem(world);
  });

  it("does nothing when no day-start message is in the inbox", () => {
    const plotEntity = spawnPlot(world, 1);
    system.run(makeContext(0));
    const state = plotEntity.plot!.state;
    expect(state.kind).toBe("planted");
    if (state.kind === "planted") {
      expect(state.daysGrowing).toBe(0);
      expect(state.weatherSum).toBe(0);
    }
  });

  it("increments daysGrowing on day boundary", () => {
    const plotEntity = spawnPlot(world, 1);
    sendDayStart(world, 1);
    system.run(makeContext(10));

    const state = plotEntity.plot!.state;
    if (state.kind === "planted") {
      expect(state.daysGrowing).toBe(1);
    } else {
      throw new Error("Expected planted state");
    }
  });

  it("accumulates weatherSum using the WeatherStation multiplier", () => {
    const plotEntity = spawnPlot(world, 1);

    // Set multiplier directly on the WeatherStation
    const stations = world.query("weatherStation", "inbox");
    for (const s of stations) {
      s.weatherStation!.multiplier = 1.2; // sunny
    }

    sendDayStart(world, 1);
    system.run(makeContext(10));

    const state = plotEntity.plot!.state;
    if (state.kind === "planted") {
      expect(state.weatherSum).toBeCloseTo(1.2);
    } else {
      throw new Error("Expected planted state");
    }
  });

  it("accumulates weatherSum over multiple days", () => {
    const plotEntity = spawnPlot(world, 1);

    // Day 1: multiplier 1.2
    const stations = [...world.query("weatherStation", "inbox")];
    stations[0]!.weatherStation!.multiplier = 1.2;
    sendDayStart(world, 1);
    system.run(makeContext(10));

    // Re-water before day 2 (brief 29 — watering is per-day).
    {
      const s = plotEntity.plot!.state;
      if (s.kind === "planted") s.wateredToday = true;
    }
    // Day 2: multiplier 0.8
    stations[0]!.weatherStation!.multiplier = 0.8;
    sendDayStart(world, 2);
    system.run(makeContext(20));

    const state = plotEntity.plot!.state;
    if (state.kind === "planted") {
      expect(state.daysGrowing).toBe(2);
      expect(state.weatherSum).toBeCloseTo(1.2 + 0.8);
    } else {
      throw new Error("Expected planted state");
    }
  });

  it("does not advance empty plots", () => {
    const emptyPlot = world.spawn({
      plot: {
        ownerId: 1,
        regionId: "farm-cora" as const,
        tileX: 1,
        tileY: 1,
        state: { kind: "empty" },
      },
    });

    sendDayStart(world, 1);
    system.run(makeContext(10));

    expect(emptyPlot.plot!.state.kind).toBe("empty");
  });

  it("advances multiple plots in deterministic order", () => {
    const plot1 = spawnPlot(world, 1);
    const plot2 = spawnPlot(world, 2);
    const plot3 = spawnPlot(world, 3);

    sendDayStart(world, 1);
    system.run(makeContext(10));

    for (const p of [plot1, plot2, plot3]) {
      const state = p.plot!.state;
      if (state.kind === "planted") {
        expect(state.daysGrowing).toBe(1);
      }
    }
  });

  it("does not re-process the same day", () => {
    const plotEntity = spawnPlot(world, 1);
    sendDayStart(world, 1);
    system.run(makeContext(10));

    // Send same day again — should be a no-op
    sendDayStart(world, 1);
    system.run(makeContext(11));

    const state = plotEntity.plot!.state;
    if (state.kind === "planted") {
      expect(state.daysGrowing).toBe(1);
    }
  });

  // ---- brief 29: irrigation & crop death ----------------------------------

  function setWeather(world: World<GameEntity>, cond: string, mult: number): void {
    for (const s of world.query("weatherStation")) {
      s.weatherStation!.current = cond as never;
      s.weatherStation!.multiplier = mult;
    }
  }

  it("a dry (unwatered) plot does not grow and accrues dry days", () => {
    const plot = spawnPlot(world, 1);
    (plot.plot!.state as Extract<PlotState, { kind: "planted" }>).wateredToday = false;
    setWeather(world, "sunny", 1.2);
    sendDayStart(world, 1);
    system.run(makeContext(10));
    const s = plot.plot!.state as Extract<PlotState, { kind: "planted" }>;
    expect(s.daysGrowing).toBe(0); // no progress on a dry day
    expect(s.daysSinceWater).toBe(1);
  });

  it("rain auto-waters every plot (grows without an agent watering)", () => {
    const plot = spawnPlot(world, 1);
    (plot.plot!.state as Extract<PlotState, { kind: "planted" }>).wateredToday = false;
    setWeather(world, "rainy", 0.8);
    sendDayStart(world, 1);
    system.run(makeContext(10));
    const s = plot.plot!.state as Extract<PlotState, { kind: "planted" }>;
    expect(s.daysGrowing).toBe(1); // rain watered it
    expect(s.daysSinceWater).toBe(0);
  });

  it("a crop withers after exceeding the grace window of dry days", () => {
    const plot = spawnPlot(world, 1);
    setWeather(world, "sunny", 1.2);
    // Day 1: planted-watered → grows, resets dry. Days 2,3: dry (1,2). Day 4: dry 3 > grace 2 → death.
    for (let day = 1; day <= 4; day++) {
      const s = plot.plot!.state;
      if (s.kind === "planted" && day > 1) s.wateredToday = false; // never re-water after day 1
      sendDayStart(world, day);
      system.run(makeContext(day * 10));
    }
    expect(plot.plot!.state.kind).toBe("empty"); // withered, seed lost
  });

  // ---- brief 41: season suitability & quality -----------------------------

  it("in-season crop grows at full rate (daysGrowing += 1 per day)", () => {
    // Radish is a spring crop. Day 1 = spring → full rate.
    const plot = spawnPlot(world, 1);
    sendDayStart(world, 1);
    system.run(makeContext(10));
    const s = plot.plot!.state as Extract<PlotState, { kind: "planted" }>;
    expect(s.daysGrowing).toBe(1); // full-rate increment
  });

  it("out-of-season crop grows at half rate (daysGrowing += 0.5 per day)", () => {
    // Radish is a spring crop. Day 51 = autumn → half rate.
    const plotEntity = world.spawn({
      plot: {
        ownerId: 1,
        regionId: "farm-cora" as const,
        tileX: 2,
        tileY: 0,
        state: {
          kind: "planted",
          crop: "radish",
          daysGrowing: 0,
          readyAtDay: 5,
          weatherSum: 0,
          daysSinceWater: 0,
          wateredToday: true,
        } satisfies PlotState,
      },
    });
    sendDayStart(world, 51); // autumn
    system.run(makeContext(100));
    const s = plotEntity.plot!.state as Extract<PlotState, { kind: "planted" }>;
    expect(s.daysGrowing).toBeCloseTo(0.5); // half-rate increment
  });

  // ---- brief 43: greenhouse (season-immune) -------------------------------

  it("greenhouse plot grows an out-of-season crop at FULL rate (vs half for a normal plot)", () => {
    const mkOutOfSeasonRadish = (greenhouse: boolean, tileX: number): GameEntity =>
      world.spawn({
        plot: {
          ownerId: 1,
          regionId: "farm-cora" as const,
          tileX,
          tileY: 0,
          greenhouse,
          state: {
            kind: "planted",
            crop: "radish", // spring crop
            daysGrowing: 0,
            readyAtDay: 5,
            weatherSum: 0,
            daysSinceWater: 0,
            wateredToday: true,
          } satisfies PlotState,
        },
      });
    const normalPlot = mkOutOfSeasonRadish(false, 0);
    const greenhousePlot = mkOutOfSeasonRadish(true, 4);

    sendDayStart(world, 51); // autumn — radish is OUT of season
    system.run(makeContext(100));

    const sNormal = normalPlot.plot!.state as Extract<PlotState, { kind: "planted" }>;
    const sGreen = greenhousePlot.plot!.state as Extract<PlotState, { kind: "planted" }>;
    expect(sNormal.daysGrowing).toBeCloseTo(0.5); // open field: half-rate out of season
    expect(sGreen.daysGrowing).toBeCloseTo(1.0);   // greenhouse: full-rate regardless of season
  });
});

// ---- brief 41: computeQuality (harvest) -------------------------------------

describe("computeQuality", () => {
  it("produces deterministic gold quality for perfect husbandry", () => {
    const rng = createRng(999).fork("crop-quality");
    // Perfect conditions: watered every day (daysSinceWater=0), full growth (daysGrowing>=growthDays),
    // high weatherSum, decoration boost.
    const q1 = computeQuality(3, 3, 3.0, 0, 1, rng);
    const rng2 = createRng(999).fork("crop-quality");
    const q2 = computeQuality(3, 3, 3.0, 0, 1, rng2);
    expect(q1).toBe(q2); // deterministic
  });

  it("perfect husbandry yields gold quality", () => {
    const rng = createRng(42).fork("crop-quality");
    // daysGrowing=growthDays (100%), weatherSum=growthDays (avg 1.0), daysSinceWater=0, decoration boost
    const q = computeQuality(4, 4, 4.0, 0, 1, rng);
    expect(q).toBe("gold");
  });

  it("neglected crop (never watered) yields normal quality", () => {
    const rng = createRng(1234).fork("crop-quality");
    // daysSinceWater = growthDays (never watered, always dry)
    const growthDays = 4;
    const q = computeQuality(4, growthDays, 4.0, growthDays, 0, rng);
    // Water score = 0 (worst); quality should be normal.
    expect(q).toBe("normal");
  });

  it("leaderboard values gold > normal for same crop", () => {
    // Build two inventories: one normal, one gold. Same count, same crop.
    const seeds = { ...ZERO_CROPS };
    const invNormal = {
      gold: 0,
      crops: { ...ZERO_CROPS, radish: 2 },
      seeds,
      cropQuality: { radish: { normal: 2, silver: 0, gold: 0 } },
    };
    const invGold = {
      gold: 0,
      crops: { ...ZERO_CROPS, radish: 2 },
      seeds,
      cropQuality: { radish: { normal: 0, silver: 0, gold: 2 } },
    };
    expect(cropInventoryValue(invGold)).toBeGreaterThan(cropInventoryValue(invNormal));
  });
});
