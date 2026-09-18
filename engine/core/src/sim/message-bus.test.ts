import { describe, it, expect, vi } from "vitest";
import { MessageBus } from "./message-bus";

function makeMsg(overrides: Partial<Parameters<MessageBus["send"]>[0]> = {}) {
  return {
    performative: "inform",
    ontology: "test.ontology",
    sender: 1 as const,
    recipient: 2 as const,
    body: { value: 42 },
    ...overrides,
  };
}

describe("MessageBus", () => {
  describe("send / flush / drain", () => {
    it("send then flush then drain returns the message", () => {
      const bus = new MessageBus();
      const msg = makeMsg();
      bus.send(msg, 0);
      bus.flush();
      const result = bus.drain();
      expect(result).toHaveLength(1);
      expect(result[0]!.ontology).toBe("test.ontology");
    });

    it("second drain (without flush) still returns the same deliverable batch", () => {
      const bus = new MessageBus();
      bus.send(makeMsg(), 0);
      bus.flush();
      const first = bus.drain();
      const second = bus.drain();
      expect(second).toHaveLength(first.length);
      expect(second[0]).toBe(first[0]);
    });

    it("drain returns empty before any flush", () => {
      const bus = new MessageBus();
      bus.send(makeMsg(), 0);
      expect(bus.drain()).toHaveLength(0);
    });
  });

  describe("second flush swaps batches", () => {
    it("clears old inflight and promotes new inflight to deliverable", () => {
      const bus = new MessageBus();
      bus.send(makeMsg({ ontology: "first" }), 0);
      bus.flush();
      expect(bus.drain()).toHaveLength(1);

      bus.send(makeMsg({ ontology: "second" }), 1);
      bus.flush();

      const result = bus.drain();
      expect(result).toHaveLength(1);
      expect(result[0]!.ontology).toBe("second");
    });

    it("flush clears the old inflight (not accumulated)", () => {
      const bus = new MessageBus();
      bus.send(makeMsg({ ontology: "a" }), 0);
      bus.send(makeMsg({ ontology: "b" }), 0);
      bus.flush();
      bus.flush();
      expect(bus.drain()).toHaveLength(0);
    });
  });

  describe("subscribeOntology / notifySubscribers", () => {
    it("invokes handler exactly once per matching message in notifySubscribers", () => {
      const bus = new MessageBus();
      const handler = vi.fn();
      bus.subscribeOntology("test.ontology", handler);
      bus.send(makeMsg({ ontology: "test.ontology" }), 0);
      bus.send(makeMsg({ ontology: "test.ontology" }), 0);
      bus.send(makeMsg({ ontology: "other" }), 0);
      bus.flush();
      bus.notifySubscribers();
      expect(handler).toHaveBeenCalledTimes(2);
    });

    it("does not invoke handler for non-matching ontology", () => {
      const bus = new MessageBus();
      const handler = vi.fn();
      bus.subscribeOntology("my.ontology", handler);
      bus.send(makeMsg({ ontology: "other.ontology" }), 0);
      bus.flush();
      bus.notifySubscribers();
      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe("unsubscribe", () => {
    it("returned function removes the handler", () => {
      const bus = new MessageBus();
      const handler = vi.fn();
      const unsub = bus.subscribeOntology("test.ontology", handler);

      bus.send(makeMsg(), 0);
      bus.flush();
      bus.notifySubscribers();
      expect(handler).toHaveBeenCalledTimes(1);

      unsub();
      handler.mockClear();

      bus.send(makeMsg(), 1);
      bus.flush();
      bus.notifySubscribers();
      expect(handler).not.toHaveBeenCalled();
    });
  });
});

// ---------------------------------------------------------------------------
// audit-57 — two behaviours that LOOK like bugs and are deliberate.
//
// Both were flagged during the coverage sweep as "probably should be fixed". Both were checked
// against their callers and kept. These tests exist so the behaviour is an asserted CHOICE rather
// than an accident nobody had looked at — the next reader who spots them finds this instead of
// re-deriving the question.
// ---------------------------------------------------------------------------

describe("notifySubscribers — a throwing subscriber aborts LOUDLY (deliberate)", () => {
  it("propagates the throw instead of isolating handlers", () => {
    // DECISION: keep the throw; do NOT wrap handlers in try/catch.
    //
    // The tempting fix is per-handler isolation so one bad subscriber cannot starve the others.
    // Rejected, because of where this runs and what subscribes:
    //
    //  - `notifySubscribers()` is called by the sim HOST, and on the Farm server that call sits
    //    INSIDE the tick's try/catch — so a throw already becomes a `fault` frame that halts the
    //    run visibly (audit-17's tick-fault policy). Isolation would convert a loud halt into a
    //    silent partial delivery.
    //  - The subscribers are observers that count things: Hollow's sim-bootstrap increments
    //    birth/death/burial/gift metrics this way. Hollow is a RESEARCH INSTRUMENT, and a
    //    silently under-counted metric is a worse outcome than a crash — it produces a number a
    //    researcher would trust.
    //  - It cannot corrupt sim state: notification runs after the scheduler, and handlers write
    //    host-side state, not the ECS. So there is no determinism argument for swallowing either.
    const bus = new MessageBus();
    const later = vi.fn();
    bus.subscribeOntology("test.ontology", () => { throw new Error("subscriber blew up"); });
    bus.subscribeOntology("test.ontology", later);

    bus.send(makeMsg(), 1);
    bus.flush();

    expect(() => { bus.notifySubscribers(); }).toThrow("subscriber blew up");
    expect(later).not.toHaveBeenCalled();
  });

  it("delivers every message to every handler when nothing throws", () => {
    const bus = new MessageBus();
    const a = vi.fn();
    const b = vi.fn();
    bus.subscribeOntology("test.ontology", a);
    bus.subscribeOntology("test.ontology", b);

    bus.send(makeMsg(), 1);
    bus.send(makeMsg({ body: { value: 43 } }), 1);
    bus.flush();
    bus.notifySubscribers();

    expect(a).toHaveBeenCalledTimes(2);
    expect(b).toHaveBeenCalledTimes(2);
  });
});

describe("drain() returns the LIVE deliverable array (deliberate)", () => {
  it("hands back the buffer itself, not a copy", () => {
    // DECISION: keep it; do NOT copy per call.
    //
    // The bus is double-buffered — `flush()` SWAPS `inflight` and `deliverable` and truncates the
    // old one — so the array a caller holds is stable for exactly one tick, which is the whole
    // lifetime any caller needs. Copying would allocate a fresh array every tick of every run for
    // no reader that wants one.
    //
    // Checked before keeping it: there is exactly ONE production caller,
    // `InboxDispatchSystem.run` (@farm/sim-core), and it only iterates and reads — it never
    // mutates what it drains. Every other caller is a test.
    const bus = new MessageBus();
    bus.send(makeMsg(), 1);
    bus.flush();

    expect(bus.drain()).toBe(bus.drain());
  });

  it("the drained array is emptied by the NEXT flush, not by draining it", () => {
    const bus = new MessageBus();
    bus.send(makeMsg(), 1);
    bus.flush();
    expect(bus.drain()).toHaveLength(1);
    expect(bus.drain()).toHaveLength(1); // draining is not consuming

    bus.flush(); // swap: this tick's (empty) inflight becomes deliverable
    expect(bus.drain()).toHaveLength(0);
  });

  it("a message sent after flush is not visible until the next flush", () => {
    // The property the single production caller relies on: what it drains is exactly the
    // previous tick's traffic, frozen.
    const bus = new MessageBus();
    bus.send(makeMsg(), 1);
    bus.flush();
    const batch = bus.drain();

    bus.send(makeMsg({ body: { value: 99 } }), 2);

    expect(batch).toHaveLength(1);
    expect(bus.drain()).toHaveLength(1);
  });
});
