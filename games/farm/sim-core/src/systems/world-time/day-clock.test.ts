import { describe, it, expect } from "vitest";
import { MessageBus } from "@engine/core";
import { DayClockSystem } from "./day-clock";
import { ONT_SIMULATION, type DayStartBody } from "../../protocols";

function captureDayStarts(bus: MessageBus): DayStartBody[] {
  const out: DayStartBody[] = [];
  bus.subscribeOntology(ONT_SIMULATION.DAY_START, (msg) => {
    out.push(msg.body as unknown as DayStartBody);
  });
  return out;
}

function tickAndDeliver(bus: MessageBus, sys: DayClockSystem, tick: number): void {
  sys.run({ tick });
  bus.flush();
  bus.notifySubscribers();
}

describe("DayClockSystem", () => {
  it("publishes DAY_START on the first tick with day=0 and daysRemaining=maxDays", () => {
    const bus = new MessageBus();
    const captured = captureDayStarts(bus);
    const sys = new DayClockSystem(bus, { ticksPerDay: 20, maxDays: 100 });

    tickAndDeliver(bus, sys, 0);

    expect(captured).toHaveLength(1);
    expect(captured[0]!.day).toBe(0);
    expect(captured[0]!.daysRemaining).toBe(100);
  });

  it("decrements daysRemaining as days advance", () => {
    const bus = new MessageBus();
    const captured = captureDayStarts(bus);
    const sys = new DayClockSystem(bus, { ticksPerDay: 20, maxDays: 100 });

    tickAndDeliver(bus, sys, 0);
    tickAndDeliver(bus, sys, 20);
    tickAndDeliver(bus, sys, 40);

    expect(captured.map((c) => c.day)).toEqual([0, 1, 2]);
    expect(captured.map((c) => c.daysRemaining)).toEqual([100, 99, 98]);
  });

  it("clamps daysRemaining to 0 once past maxDays", () => {
    const bus = new MessageBus();
    const captured = captureDayStarts(bus);
    const sys = new DayClockSystem(bus, { ticksPerDay: 20, maxDays: 3 });

    tickAndDeliver(bus, sys, 0);
    tickAndDeliver(bus, sys, 20);
    tickAndDeliver(bus, sys, 40);
    tickAndDeliver(bus, sys, 60);
    tickAndDeliver(bus, sys, 80);

    expect(captured.map((c) => c.daysRemaining)).toEqual([3, 2, 1, 0, 0]);
  });

  it("emits at most one DAY_START per day boundary", () => {
    const bus = new MessageBus();
    const captured = captureDayStarts(bus);
    const sys = new DayClockSystem(bus, { ticksPerDay: 20, maxDays: 100 });

    for (let t = 0; t < 5; t += 1) tickAndDeliver(bus, sys, t);

    expect(captured).toHaveLength(1);
    expect(captured[0]!.day).toBe(0);
  });
});
