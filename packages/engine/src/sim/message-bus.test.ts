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
      expect(second[0]).toBe(first[0]); // same reference — deliverable not cleared
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
      // drain to confirm first message is deliverable
      expect(bus.drain()).toHaveLength(1);

      bus.send(makeMsg({ ontology: "second" }), 1);
      bus.flush(); // swap: second batch now deliverable, old inflight cleared

      const result = bus.drain();
      expect(result).toHaveLength(1);
      expect(result[0]!.ontology).toBe("second");
    });

    it("flush clears the old inflight (not accumulated)", () => {
      const bus = new MessageBus();
      bus.send(makeMsg({ ontology: "a" }), 0);
      bus.send(makeMsg({ ontology: "b" }), 0);
      bus.flush();
      // Now send two more but flush again — old inflight (a,b) now deliverable, new empty inflight cleared
      bus.flush();
      // Deliverable should now be the new (empty) inflight that was just promoted
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
      // Handler should be called exactly twice (only for matching ontology)
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
