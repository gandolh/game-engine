import { describe, it, expect, beforeEach } from "vitest";
import { World, MessageBus, createRng } from "@engine/core";
import type { GameEntity } from "../components";
import { spawnWeatherStation } from "../agents/weather-station";
import { WeatherSystem } from "./weather";
import { ONT_SIMULATION, ONT_WEATHER, PERFORMATIVE } from "../protocols";

function makeWorld(): World<GameEntity> {
  return new World<GameEntity>();
}

function makeContext(tick = 0) {
  return { tick, deltaMs: 16, totalMs: tick * 16 };
}

/**
 * Simulate inbox dispatch: push a day-start message directly into the station's inbox.
 */
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

describe("WeatherSystem", () => {
  let world: World<GameEntity>;
  let bus: MessageBus;
  let system: WeatherSystem;

  beforeEach(() => {
    world = makeWorld();
    bus = new MessageBus();
    const rng = createRng(42);
    spawnWeatherStation(world);
    system = new WeatherSystem(bus, world, rng);
  });

  it("does nothing on ticks with no day-start message", () => {
    system.run(makeContext(0));
    bus.flush();
    expect(bus.drain().length).toBe(0);
  });

  it("broadcasts weather-now when day starts", () => {
    sendDayStart(world, 1);
    system.run(makeContext(10));
    bus.flush();

    const msgs = bus.drain();
    const nowMsgs = msgs.filter((m) => m.ontology === ONT_WEATHER.NOW);
    expect(nowMsgs.length).toBe(1);
    const body = nowMsgs[0]!.body as { condition: string; multiplier: number; day: number };
    expect(body.day).toBe(1);
    expect(typeof body.condition).toBe("string");
    expect(typeof body.multiplier).toBe("number");
  });

  it("broadcasts 3 forecast messages when day starts", () => {
    sendDayStart(world, 1);
    system.run(makeContext(10));
    bus.flush();

    const msgs = bus.drain();
    const forecastMsgs = msgs.filter((m) => m.ontology === ONT_WEATHER.FORECAST);
    expect(forecastMsgs.length).toBe(3);
    const days = forecastMsgs.map((m) => (m.body as { forDay: number }).forDay).sort((a, b) => a - b);
    expect(days).toEqual([2, 3, 4]);
  });

  it("updates WeatherStation component state", () => {
    sendDayStart(world, 1);
    system.run(makeContext(10));

    const stations = world.query("weatherStation", "inbox");
    let station: GameEntity | null = null;
    for (const s of stations) { station = s; break; }
    expect(station).not.toBeNull();
    expect(["sunny", "normal", "rainy", "storm"]).toContain(station!.weatherStation!.current);
    expect(station!.weatherStation!.multiplier).toBeGreaterThan(0);
    expect(station!.weatherStation!.forecast.length).toBe(3);
  });

  it("writes weather into all farmers' beliefs", () => {
    // Spawn two farmers with beliefs
    world.spawn({
      farmer: { name: "Alice", currentRegion: "farm-cora" as const },
      beliefs: { data: {}, revision: 0 },
      inbox: { messages: [] },
    });
    world.spawn({
      farmer: { name: "Bob", currentRegion: "farm-atticus" as const },
      beliefs: { data: {}, revision: 0 },
      inbox: { messages: [] },
    });

    sendDayStart(world, 2);
    system.run(makeContext(20));

    const farmers = world.query("beliefs", "farmer");
    for (const f of farmers) {
      expect(f.beliefs.data.weatherNow).toBeDefined();
      expect(f.beliefs.data.weatherForecast).toBeDefined();
      const forecast = f.beliefs.data.weatherForecast as unknown[];
      expect(forecast.length).toBe(3);
    }
  });

  it("does not re-process the same day twice", () => {
    sendDayStart(world, 1);
    system.run(makeContext(10));
    bus.flush();
    bus.drain(); // consume

    // Send same day again — should be a no-op
    sendDayStart(world, 1);
    system.run(makeContext(11));
    bus.flush();
    const msgs = bus.drain().filter((m) => m.ontology === ONT_WEATHER.NOW);
    expect(msgs.length).toBe(0);
  });

  it("is deterministic with same seed", () => {
    const conditions: string[] = [];
    for (let run = 0; run < 2; run++) {
      const w = makeWorld();
      const b = new MessageBus();
      const rng = createRng(99);
      spawnWeatherStation(w);
      const sys = new WeatherSystem(b, w, rng);

      const runConditions: string[] = [];
      for (let day = 1; day <= 5; day++) {
        const stations = w.query("weatherStation", "inbox");
        for (const s of stations) {
          s.inbox.messages.push({
            performative: PERFORMATIVE.INFORM,
            ontology: ONT_SIMULATION.DAY_START,
            sender: "world",
            body: { day },
            tickIssued: day,
          });
        }
        sys.run(makeContext(day * 10));
        for (const s of w.query("weatherStation", "inbox")) {
          runConditions.push(s.weatherStation!.current);
        }
      }

      if (run === 0) {
        conditions.push(...runConditions);
      } else {
        expect(runConditions).toEqual(conditions);
      }
    }
  });
});
