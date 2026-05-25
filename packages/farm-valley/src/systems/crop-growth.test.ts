import { describe, it, expect, beforeEach } from "vitest";
import { World } from "@engine/core";
import type { GameEntity, PlotState } from "../components";
import { spawnWeatherStation } from "../agents/weather-station";
import { CropGrowthSystem } from "./crop-growth";
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
      tileX: 0,
      tileY: 0,
      state: {
        kind: "planted",
        crop: "radish",
        daysGrowing: 0,
        readyAtDay: 5,
        weatherSum: 0,
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
});
