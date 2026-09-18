/**
 * audit-41 — "skip to highlight" must not block the event loop.
 *
 * The drain ran up to `SKIP_MAX_DAYS * ticksPerDay` ticks — **36 000** at the production
 * `ticksPerDay = 1200` — inside a single `setInterval` callback, with no yield. `RunRegistry` puts
 * one `SimHost` per run in ONE process, so for the whole duration every other connected player's
 * sim stopped ticking, no snapshots were sent, and sockets could time out. One player pressing
 * Skip in a quiet stretch froze everyone.
 *
 * These tests drive the drain against an injected clock and a stub tick so the slice boundaries
 * are exact rather than raced. The sim itself is not booted (constrained hardware, and the
 * pacing is what is under test — not what a tick does).
 */
import { describe, it, expect, vi } from "vitest";
import { SimHost } from "./sim-host";
import { SKIP_MAX_DAYS } from "@farm/sim-core/sim-worker-skip";

const TICKS_PER_DAY = 1200; // production
const CAP = SKIP_MAX_DAYS * TICKS_PER_DAY;

interface Harness {
  host: SimHost;
  /** Advance one `setInterval` fire. */
  fire: () => void;
  ticks: () => number;
  /** Wall-clock ms consumed per simulated tick. */
  setTickCost: (ms: number) => void;
  /** Make the next tick produce a highlight-worthy event. */
  emitHighlight: () => void;
}

/**
 * A SimHost with its internals replaced by stubs: a counting `runOneTick`, a controllable event
 * feed, and an injected clock that only advances when a tick runs. Reaches in through the private
 * fields because the drain's collaborators are assigned inside `startUnsafe`, which would
 * otherwise mean booting a full 21-farmer world just to test pacing.
 */
function makeHarness(): Harness {
  let clock = 0;
  let tickCost = 0.5;
  let ticks = 0;
  let feedLength = 0;
  let newestDrama = 0;
  let pendingHighlight = false;

  const host = new SimHost(() => {}, { now: () => clock });
  const internals = host as unknown as {
    runOneTick: () => void;
    getEventFeedInfo: () => { length: number; newestDrama: number };
    ticksPerDay: number;
    pendingSkipToHighlight: boolean;
    onInterval: () => void;
  };

  internals.ticksPerDay = TICKS_PER_DAY;
  internals.runOneTick = () => {
    ticks++;
    clock += tickCost;
    if (pendingHighlight) {
      pendingHighlight = false;
      feedLength += 1;
      newestDrama = 100;
    }
  };
  internals.getEventFeedInfo = () => ({ length: feedLength, newestDrama });

  return {
    host,
    fire: () => { (host as unknown as { onInterval: () => void }).onInterval(); },
    ticks: () => ticks,
    setTickCost: (ms) => { tickCost = ms; },
    emitHighlight: () => { pendingHighlight = true; },
  };
}

function requestSkip(h: Harness): void {
  h.host.handleInbound({ type: "skipToHighlight" });
}

describe("skip drain yields between interval fires (audit-41)", () => {
  it("ONE fire no longer drains the whole 36 000-tick cap", () => {
    const h = makeHarness();
    requestSkip(h);

    h.fire();

    // 12 ms budget at 0.5 ms/tick ≈ 25 ticks, not 36 000. The exact count is not the contract —
    // "far below the cap, and the drain is still owed work" is.
    expect(h.ticks()).toBeLessThan(200);
    expect(h.ticks()).toBeGreaterThan(0);
    expect(h.host.skipTicksPending()).toBeGreaterThan(0);
  });

  it("a slice stays under one 60 Hz tick period, the fastest rate the host allows", () => {
    const h = makeHarness();
    h.setTickCost(1);
    requestSkip(h);

    const before = h.ticks();
    h.fire();
    const spentMs = (h.ticks() - before) * 1;

    // 1000/MAX_TICK_RATE_HZ = 16.67 ms. Staying under it means the loop always yields inside a
    // frame — which is what keeps every OTHER run in the process ticking.
    expect(spentMs).toBeLessThan(16.67);
  });

  it("resumes across fires and reaches the SAME logical tick count as the unsliced loop", () => {
    const h = makeHarness();
    requestSkip(h);

    let fires = 0;
    do {
      h.fire();
      fires++;
    } while (h.host.skipTicksPending() > 0 && fires < 100_000);

    // Byte-identical in sim terms: the same total ticks ran, in the same order, with the same
    // stop condition. Only WHERE the drain paused changed.
    expect(h.ticks()).toBe(CAP);
    expect(fires).toBeGreaterThan(1); // it genuinely spread across fires
    expect(h.host.skipTicksPending()).toBe(0);
  });

  it("stops on the highlight at exactly the tick it always did", () => {
    const h = makeHarness();
    requestSkip(h);

    h.fire();
    const beforeHighlight = h.ticks();
    h.emitHighlight();
    h.fire();

    // The highlight lands on the FIRST tick of the second fire and ends the drain there.
    expect(h.ticks()).toBe(beforeHighlight + 1);
    expect(h.host.skipTicksPending()).toBe(0);
  });

  it("a slice always advances by at least one tick, even when a tick outruns the budget", () => {
    // Guards against a livelock: if the deadline were checked BEFORE running a tick, a tick
    // costing more than the whole budget would make the drain never progress.
    const h = makeHarness();
    h.setTickCost(500); // one tick blows a 12 ms budget forty times over
    requestSkip(h);

    h.fire();
    expect(h.ticks()).toBe(1);
    h.fire();
    expect(h.ticks()).toBe(2);
  });

  it("stop() cancels an in-flight drain instead of leaving it owed", () => {
    const h = makeHarness();
    requestSkip(h);
    h.fire();
    expect(h.host.skipTicksPending()).toBeGreaterThan(0);

    h.host.stop();

    expect(h.host.skipTicksPending()).toBe(0);
    const after = h.ticks();
    h.fire();
    expect(h.ticks()).toBe(after); // no further work
  });

  it("a second skip request mid-drain re-arms the full budget rather than stacking", () => {
    const h = makeHarness();
    requestSkip(h);
    h.fire();
    expect(h.host.skipTicksPending()).toBeLessThan(CAP);

    requestSkip(h);
    h.fire();

    expect(h.host.skipTicksPending()).toBeLessThanOrEqual(CAP);
    expect(h.host.skipTicksPending()).toBeGreaterThan(CAP - 500);
  });
});

describe("THE SHARED-SERVER SYMPTOM: one run skipping must not freeze another (audit-41)", () => {
  /**
   * The actual defect, modelled the way it bites: two SimHosts in one process, each driven by its
   * own `setInterval`. Run A skips; run B must keep ticking. With the unsliced drain, A's callback
   * never returned until 36 000 ticks were done, so B's interval callbacks queued up behind it and
   * B's tick count stayed frozen.
   */
  it("run B keeps ticking while run A drains its skip", () => {
    vi.useFakeTimers();
    try {
      const a = makeHarness();
      const b = makeHarness();

      // Real interval wiring for B; A is fired by the same scheduler.
      setInterval(() => { a.fire(); }, 10);
      setInterval(() => { b.fire(); }, 10);

      requestSkip(a);
      vi.advanceTimersByTime(100); // 10 fires each

      expect(a.ticks()).toBeGreaterThan(0);     // A is making progress on its skip...
      expect(a.host.skipTicksPending()).toBeGreaterThan(0); // ...and has not finished it
      expect(b.ticks()).toBe(10);               // ...while B ticked once per fire throughout

      vi.clearAllTimers();
    } finally {
      vi.useRealTimers();
    }
  });
});
