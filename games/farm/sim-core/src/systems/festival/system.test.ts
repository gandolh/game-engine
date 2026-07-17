import { describe, it, expect } from "vitest";
import { World, MessageBus, createRng } from "@engine/core";
import type { GameEntity, CropKind } from "../../components";
import { FestivalSystem } from "./system";
import { spawnWeatherStation } from "../../agents/weather-station";
import { ZERO_CROPS } from "../../economy";
import { ONT_SIMULATION, PERFORMATIVE } from "../../protocols";
import {
  ONT_FESTIVAL,
  festivalForDay,
  isFestivalLastDay,
  type FestivalResultBody,
} from "../../protocols/festival";

const TICKS_PER_DAY = 10;

function firstFestivalDay(): { day: number; crop: CropKind } {
  for (let d = 1; d < 400; d += 1) {
    const f = festivalForDay(d);
    if (f) return { day: d, crop: f.contestCrop };
  }
  throw new Error("no festival day found");
}

function spawnFarmerWithCrop(
  world: World<GameEntity>,
  name: string,
  crop: CropKind,
  qty: number,
): GameEntity {
  return world.spawn({
    farmer: { name, currentRegion: "village" as const },
    inventory: { gold: 0, crops: { ...ZERO_CROPS, [crop]: qty }, seeds: { ...ZERO_CROPS } },
  });
}

function pushDayStart(station: GameEntity, day: number): void {
  station.inbox!.messages.push({
    performative: PERFORMATIVE.INFORM,
    ontology: ONT_SIMULATION.DAY_START,
    sender: "world",
    body: { day },
    tickIssued: 0,
  });
}

/** Run one festival where exactly two farmers tie on quality AND count. */
function runTiedFestival(seed: number): number {
  const world = new World<GameEntity>();
  const bus = new MessageBus();
  const { day: D, crop } = firstFestivalDay();

  const station = spawnWeatherStation(world);
  // Two entrants, equal quality (normal) and equal count → a genuine tie.
  spawnFarmerWithCrop(world, "Amy", crop, 5);
  spawnFarmerWithCrop(world, "Bob", crop, 5);

  const sys = new FestivalSystem(bus, world, createRng(seed), TICKS_PER_DAY);

  // Run every festival day so submissions are captured across the whole
  // (multi-day) window, then one more day to trigger the single resolution.
  let cursor = D;
  while (festivalForDay(cursor) !== null) {
    pushDayStart(station, cursor);
    sys.run({ tick: cursor * TICKS_PER_DAY });
    station.inbox!.messages.length = 0;
    bus.flush();
    bus.drain();
    if (isFestivalLastDay(cursor)) break;
    cursor += 1;
  }

  // Day after the last festival day: resolve the contest.
  const resolveDay = cursor + 1;
  pushDayStart(station, resolveDay);
  sys.run({ tick: resolveDay * TICKS_PER_DAY });

  bus.flush();
  for (const m of bus.drain()) {
    if (m.ontology !== ONT_FESTIVAL.RESULT) continue;
    const body = m.body as unknown as FestivalResultBody;
    if (body.day === D) return body.winnerId ?? -1;
  }
  return -1;
}

describe("FestivalSystem — tie-break", () => {
  it("consults the rng: a two-way tie can resolve to either entrant", () => {
    const winners = new Set<number>();
    for (let seed = 1; seed <= 40; seed += 1) {
      winners.add(runTiedFestival(seed));
    }
    // Pre-fix the drawn value was discarded and lowest id always won → one
    // distinct winner. With the draw actually consulted, both tied entrants
    // win for some seeds → two distinct winners.
    expect(winners.size).toBe(2);
    expect(winners.has(-1)).toBe(false);
  });

  it("always awards one of the tied entrants (coherent outcome)", () => {
    const winner = runTiedFestival(7);
    expect(winner).toBeGreaterThan(0);
  });
});
