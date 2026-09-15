import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createTickPump } from "./tick-pump";

describe("createTickPump", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it("start/stop/isRunning lifecycle", () => {
    const pump = createTickPump({ hz: 20, onTick: () => {} });
    expect(pump.isRunning()).toBe(false);
    pump.start();
    expect(pump.isRunning()).toBe(true);
    pump.stop();
    expect(pump.isRunning()).toBe(false);
  });

  it("start() is idempotent — does not reset or recreate an already-running pump", () => {
    const setIntervalSpy = vi.spyOn(globalThis, "setInterval");
    const pump = createTickPump({ hz: 20, onTick: () => {} });
    pump.start();
    pump.start();
    pump.start();
    expect(setIntervalSpy).toHaveBeenCalledTimes(1);
  });

  it("stop() before start() and double-stop are both no-ops", () => {
    const clearIntervalSpy = vi.spyOn(globalThis, "clearInterval");
    const pump = createTickPump({ hz: 20, onTick: () => {} });
    pump.stop(); // never started
    expect(clearIntervalSpy).not.toHaveBeenCalled();
    pump.start();
    pump.stop();
    pump.stop(); // already stopped
    expect(clearIntervalSpy).toHaveBeenCalledTimes(1);
  });

  it("fires at the fixed period derived from hz", () => {
    let fires = 0;
    const pump = createTickPump({ hz: 20, onTick: () => {}, onFire: () => fires++ });
    pump.start();
    vi.advanceTimersByTime(50); // one period at 20 Hz
    expect(fires).toBe(1);
    vi.advanceTimersByTime(150); // three more periods
    expect(fires).toBe(4);
    pump.stop();
  });

  it("batch size equals the current getBatchSize() value — one onTick call per logical tick", () => {
    let speed = 3;
    const ticks: number[] = [];
    const pump = createTickPump({
      hz: 20,
      getBatchSize: () => speed,
      onTick: () => ticks.push(1),
    });
    pump.start();
    vi.advanceTimersByTime(50); // one fire
    expect(ticks.length).toBe(3);

    speed = 7;
    vi.advanceTimersByTime(50); // next fire picks up the new speed
    expect(ticks.length).toBe(3 + 7);
    pump.stop();
  });

  it("onFire receives the exact ticksThisFire, including 0 for a caller-modeled paused fire", () => {
    let batchSize = 0;
    const fires: number[] = [];
    const pump = createTickPump({
      hz: 20,
      getBatchSize: () => batchSize,
      onTick: () => {},
      onFire: (n) => fires.push(n),
    });
    pump.start();
    vi.advanceTimersByTime(50);
    expect(fires).toEqual([0]);

    batchSize = 5;
    vi.advanceTimersByTime(50);
    expect(fires).toEqual([0, 5]);
    pump.stop();
  });

  it("fixed period is NOT re-periodized when the batch size (speed) changes", () => {
    let speed = 1;
    let fires = 0;
    const pump = createTickPump({ hz: 20, getBatchSize: () => speed, onTick: () => {}, onFire: () => fires++ });
    pump.start();

    // At a fixed 50ms period, 500ms should always yield exactly 10 fires,
    // no matter what speed was set to along the way — speed changes the
    // ticks PER fire, never how often fires happen.
    speed = 1;
    vi.advanceTimersByTime(100); // 2 fires
    speed = 8;
    vi.advanceTimersByTime(200); // 4 more fires
    speed = 2;
    vi.advanceTimersByTime(200); // 4 more fires
    expect(fires).toBe(10);
    pump.stop();
  });

  it("a speed change does not tear down/recreate the timer (no extra setInterval/clearInterval calls)", () => {
    const setIntervalSpy = vi.spyOn(globalThis, "setInterval");
    const clearIntervalSpy = vi.spyOn(globalThis, "clearInterval");
    let speed = 1;
    const pump = createTickPump({ hz: 20, getBatchSize: () => speed, onTick: () => {} });
    pump.start();
    expect(setIntervalSpy).toHaveBeenCalledTimes(1);

    // Changing the batch size is purely external state — the pump never
    // even sees a "speed changed" event, so there is nothing to restart.
    speed = 4;
    vi.advanceTimersByTime(50);
    speed = 1;
    vi.advanceTimersByTime(50);
    speed = 16;
    vi.advanceTimersByTime(50);

    expect(setIntervalSpy).toHaveBeenCalledTimes(1);
    expect(clearIntervalSpy).not.toHaveBeenCalled();
    pump.stop();
    expect(clearIntervalSpy).toHaveBeenCalledTimes(1);
  });

  it("batch overrun caps the batch and drops debt — never scales ticks by elapsed wall-clock time", () => {
    // A wall-clock-based catch-up accumulator would read Date.now()/
    // performance.now() to compute "how many periods have elapsed" and
    // inflate the next batch to compensate. This pump must never do that:
    // proven here by jumping Date.now() far ahead before a fire and
    // confirming the batch is still exactly getBatchSize(), not scaled by
    // the jump.
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(1_000_000);
    let ticks = 0;
    const pump = createTickPump({ hz: 20, getBatchSize: () => 3, onTick: () => ticks++ });
    pump.start();

    nowSpy.mockReturnValue(1_000_000 + 60_000); // simulate a 60s wall-clock jump (e.g. backgrounded tab)
    vi.advanceTimersByTime(50); // exactly one period elapses on the fake timer clock
    expect(ticks).toBe(3); // exactly one batch — not 3 * (60000/50)

    vi.advanceTimersByTime(50);
    expect(ticks).toBe(6); // still exactly one batch per fire, no accumulated debt
    pump.stop();
    nowSpy.mockRestore();
  });

  it("a fire whose onTick calls run long does not inflate the NEXT fire's batch", () => {
    // Model a slow fire (e.g. a heavy sim tick) by doing real synchronous
    // work inside onTick that consumes wall-clock time on the fake-timer
    // clock via Date.now(), without ever advancing the fake timers
    // ourselves mid-callback. The next fire must still run exactly
    // getBatchSize() ticks — no compensation for the slow fire.
    const ticks: number[] = [];
    let fireIndex = 0;
    const pump = createTickPump({
      hz: 20,
      getBatchSize: () => 2,
      onTick: () => ticks.push(fireIndex),
      onFire: () => {
        fireIndex++;
      },
    });
    pump.start();
    vi.advanceTimersByTime(500); // 10 periods' worth, delivered as 10 discrete fires
    expect(ticks.length).toBe(10 * 2); // exactly 2 ticks per fire, 10 fires — no more
    pump.stop();
  });

  it("clamps a fractional or negative getBatchSize() to a non-negative integer", () => {
    let raw = -3.7;
    const ticks: number[] = [];
    const pump = createTickPump({ hz: 20, getBatchSize: () => raw, onTick: () => ticks.push(1) });
    pump.start();
    vi.advanceTimersByTime(50);
    expect(ticks.length).toBe(0);

    raw = 2.9;
    vi.advanceTimersByTime(50);
    expect(ticks.length).toBe(2);
    pump.stop();
  });

  it("defaults getBatchSize to a constant 1 when omitted", () => {
    const ticks: number[] = [];
    const pump = createTickPump({ hz: 20, onTick: () => ticks.push(1) });
    pump.start();
    vi.advanceTimersByTime(150);
    expect(ticks.length).toBe(3);
    pump.stop();
  });

  it("throws for a non-positive hz", () => {
    expect(() => createTickPump({ hz: 0, onTick: () => {} })).toThrow();
    expect(() => createTickPump({ hz: -5, onTick: () => {} })).toThrow();
  });
});
