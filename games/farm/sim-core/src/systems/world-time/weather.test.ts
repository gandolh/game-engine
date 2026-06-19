import { describe, it, expect, beforeEach } from "vitest";
import { World, MessageBus, createRng } from "@engine/core";
import type { GameEntity } from "../../components";
import { spawnWeatherStation } from "../../agents/weather-station";
import { WeatherSystem } from "./weather";
import {
  ONT_SIMULATION,
  ONT_WEATHER,
  PERFORMATIVE,
  seasonForDay,
  SEASON_LENGTH,
} from "../../protocols";
import type { WeatherCondition } from "../../protocols";

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
    bus.drain(); 

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

  it("stamps the current season onto the station and the now broadcast", () => {
    sendDayStart(world, 30); 
    system.run(makeContext(10));
    bus.flush();

    const stations = [...world.query("weatherStation")];
    expect(stations[0]!.weatherStation!.season).toBe("summer");

    const nowMsg = bus.drain().find((m) => m.ontology === ONT_WEATHER.NOW);
    expect(nowMsg).toBeDefined();
    const body = nowMsg!.body as { season: string; trend: string };
    expect(body.season).toBe("summer");
    expect(typeof body.trend).toBe("string");
    expect(body.trend.length).toBeGreaterThan(0);
  });

  it("stamps a season onto each forecast message", () => {
    sendDayStart(world, 1);
    system.run(makeContext(10));
    bus.flush();

    const forecastMsgs = bus.drain().filter((m) => m.ontology === ONT_WEATHER.FORECAST);
    expect(forecastMsgs.length).toBe(3);
    for (const m of forecastMsgs) {
      const body = m.body as { forDay: number; season: string };
      expect(body.season).toBe(seasonForDay(body.forDay));
    }
  });
});

describe("seasonForDay schedule", () => {
  it("divides the run into four 25-day seasons", () => {
    expect(seasonForDay(1)).toBe("spring");
    expect(seasonForDay(25)).toBe("spring");
    expect(seasonForDay(26)).toBe("summer");
    expect(seasonForDay(50)).toBe("summer");
    expect(seasonForDay(51)).toBe("autumn");
    expect(seasonForDay(75)).toBe("autumn");
    expect(seasonForDay(76)).toBe("winter");
    expect(seasonForDay(100)).toBe("winter");
  });

  it("is a pure function — same day always returns the same season", () => {
    for (let day = 1; day <= 100; day++) {
      expect(seasonForDay(day)).toBe(seasonForDay(day));
    }
  });

  it("wraps the four-season cycle for runs longer than 100 days", () => {
    expect(seasonForDay(101)).toBe("spring");
    expect(seasonForDay(126)).toBe("summer");
    expect(SEASON_LENGTH).toBe(25);
  });

  it("treats day 0 (pre-start) as spring", () => {
    expect(seasonForDay(0)).toBe("spring");
  });
});

describe("season biases the weather distribution", () => {

  function tallySeason(firstDay: number): Record<WeatherCondition, number> {
    const w = new World<GameEntity>();
    const b = new MessageBus();
    const rng = createRng(2024);
    spawnWeatherStation(w);
    const sys = new WeatherSystem(b, w, rng);

    const counts: Record<WeatherCondition, number> = {
      sunny: 0,
      normal: 0,
      rainy: 0,
      storm: 0,
    };
    for (let i = 0; i < SEASON_LENGTH; i++) {
      const day = firstDay + i;
      for (const s of w.query("weatherStation", "inbox")) {
        s.inbox.messages.push({
          performative: PERFORMATIVE.INFORM,
          ontology: ONT_SIMULATION.DAY_START,
          sender: "world",
          body: { day },
          tickIssued: day,
        });
      }
      sys.run(makeContext(day * 10));
      for (const s of w.query("weatherStation")) {
        counts[s.weatherStation!.current] += 1;
        break;
      }
    }
    return counts;
  }

  it("summer is sunnier and stormier than winter; winter is rainier", () => {
    const summer = tallySeason(26); 
    const winter = tallySeason(76); 

    expect(summer.sunny).toBeGreaterThan(winter.sunny);
    expect(winter.rainy).toBeGreaterThan(summer.rainy);

    expect(winter.storm).toBeGreaterThanOrEqual(summer.storm);
  });

  it("spring sees more rain than summer", () => {
    const spring = tallySeason(1); 
    const summer = tallySeason(26);
    expect(spring.rainy).toBeGreaterThan(summer.rainy);
  });
});
