import { describe, it, expect } from "vitest";
import { advanceChronicleCursor } from "./chronicle-cursor";
import { createChronicle, CHRONICLE_CAP } from "@hollow/sim-core/observe";

describe("advanceChronicleCursor", () => {
  it("streams normally while the buffer is below the cap", () => {
    // 10 captured, 4 already posted, nothing evicted.
    const c = advanceChronicleCursor(10, 0, 4);
    expect(c).toEqual({ captured: 10, startIndex: 4, missed: 0 });
  });

  it("posts nothing when there is nothing new", () => {
    const c = advanceChronicleCursor(10, 0, 10);
    expect(c.startIndex).toBe(10); // slice(10) of a 10-length array === []
    expect(c.captured).toBe(10);
  });

  it("KEEPS STREAMING once the ring buffer plateaus at the cap", () => {
    // The regression this exists to prevent: past the cap `events().length`
    // stops growing, so a length-based cursor would freeze forever.
    const cap = 50;
    let posted = cap; // caught up exactly as the cap was reached

    // 7 more events captured: buffer stays at `cap`, dropped climbs to 7.
    const c = advanceChronicleCursor(cap, 7, posted);
    expect(c.captured).toBe(cap + 7);
    expect(c.captured).toBeGreaterThan(posted); // i.e. progress is visible
    // The 7 newest live entries are the unposted ones.
    expect(c.startIndex).toBe(cap - 7);
    posted = c.captured;

    // And again, proving it does not freeze after one wrap.
    const c2 = advanceChronicleCursor(cap, 12, posted);
    expect(c2.captured).toBe(cap + 12);
    expect(c2.startIndex).toBe(cap - 5); // the 5 captured since last post
  });

  it("reports events that aged out before this consumer saw them", () => {
    // Posted 3, but 9 have already been evicted -> 6 were missed outright.
    const c = advanceChronicleCursor(50, 9, 3);
    expect(c.missed).toBe(6);
    expect(c.startIndex).toBe(0); // everything still live is unposted
    expect(c.captured).toBe(59);
  });

  it("never produces an out-of-range slice index", () => {
    for (const [live, dropped, posted] of [
      [0, 0, 0], [0, 100, 100], [5, 0, 99], [5, 100, 0], [50, 7, 999],
    ] as const) {
      const c = advanceChronicleCursor(live, dropped, posted);
      expect(c.startIndex).toBeGreaterThanOrEqual(0);
      expect(c.startIndex).toBeLessThanOrEqual(live);
    }
  });

  it("agrees with a real capped Chronicle: nothing is skipped or double-sent", () => {
    // End-to-end against the ACTUAL ring buffer, driven well past its cap.
    const cap = 16;
    const handlers: ((msg: { body: Record<string, unknown> }) => void)[] = [];
    const bus = {
      subscribeOntology: (_o: string, h: (msg: { body: Record<string, unknown> }) => void) => {
        handlers.push(h);
      },
    } as unknown as Parameters<typeof createChronicle>[0];

    const chronicle = createChronicle(bus, cap);
    const fire = handlers[0]!;

    const seen: number[] = [];
    let posted = 0;

    // Emit 60 events, draining through the cursor every 7 -- so the buffer
    // fills, wraps several times, and the consumer reads at an offset rhythm.
    for (let n = 1; n <= 60; n++) {
      fire({ body: { tick: n, n } });
      if (n % 7 === 0) {
        const live = chronicle.events();
        const c = advanceChronicleCursor(live.length, chronicle.droppedCount(), posted);
        for (const ev of live.slice(c.startIndex)) seen.push(ev["n"] as number);
        posted = c.captured;
      }
    }
    const live = chronicle.events();
    const c = advanceChronicleCursor(live.length, chronicle.droppedCount(), posted);
    for (const ev of live.slice(c.startIndex)) seen.push(ev["n"] as number);
    posted = c.captured;

    // Every event captured is accounted for, exactly once, in order.
    expect(posted).toBe(60);
    expect(chronicle.events().length).toBe(cap);       // genuinely bounded
    expect(chronicle.droppedCount()).toBe(60 - cap);   // and genuinely evicting
    expect(new Set(seen).size).toBe(seen.length);      // no duplicates
    expect([...seen].sort((a, b) => a - b)).toEqual(seen); // strictly in order
    // Draining every 7 while the cap is 16 means nothing ages out unseen.
    expect(seen).toEqual(Array.from({ length: 60 }, (_, i) => i + 1));
    expect(CHRONICLE_CAP).toBeGreaterThan(cap);        // production cap is larger
  });
});
