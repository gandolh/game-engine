/**
 * Regression coverage for `createChronicle`/`countByOntology` (promoted to
 * `@hollow/sim-core/observe` by chunk hollow-10a) — drives a real
 * `MessageBus` directly (send → flush → notifySubscribers, the same
 * sequence the sim host runs each tick) rather than a full
 * `bootstrapHollowSim()`, since chronicle capture is pure dispatch-order
 * bookkeeping and doesn't need a live world.
 */
import { describe, it, expect } from "vitest";
import { MessageBus } from "@engine/core";
import { ONT_FAMILY, ONT_SOCIAL } from "../protocols";
import type { RationalizerDecision } from "../rationalize";
import { createChronicle, countByOntology, CHRONICLE_CAP, ONT_RATIONALIZE } from "./chronicle";

/** A hand-built `RationalizerDecision` (chunk hollow-13) — no seam, no sim
 *  boot, matching this file's own hand-built-fixture pattern. */
function makeDecision(overrides: Partial<RationalizerDecision> = {}): RationalizerDecision {
  return {
    tick: 10,
    agentId: 1,
    requestTick: 8,
    provider: "stub",
    outcome: "adopted",
    reason: null,
    rationale: "agent 1 at tick 8: stealing looked better than trading",
    bdiKind: "trade",
    chosenKind: "steal",
    ...overrides,
  };
}

function dispatchTick(bus: MessageBus): void {
  bus.flush();
  bus.notifySubscribers();
}

/** Sends+dispatches one `ONT_SOCIAL.GIFT` event at `tick`, tagged with
 *  `seq` (in the `from` field) so eviction order is easy to assert on. */
function sendGift(bus: MessageBus, tick: number, seq: number): void {
  bus.send(
    { performative: "inform", ontology: ONT_SOCIAL.GIFT, sender: seq, recipient: "broadcast", body: { tick, from: seq, to: seq + 1 } },
    tick,
  );
  dispatchTick(bus);
}

describe("createChronicle", () => {
  it("captures a family event with tick read from the body, flattened", () => {
    const bus = new MessageBus();
    const chronicle = createChronicle(bus);

    bus.send(
      { performative: "inform", ontology: ONT_FAMILY.BIRTH, sender: "world", recipient: "broadcast", body: { tick: 12, childId: 9, parentAId: 1, parentBId: 2 } },
      12,
    );
    dispatchTick(bus);

    expect(chronicle.events()).toEqual([
      { tick: 12, ontology: ONT_FAMILY.BIRTH, childId: 9, parentAId: 1, parentBId: 2 },
    ]);
  });

  it("tallies deaths by cause and leaves other ontologies out of the tally", () => {
    const bus = new MessageBus();
    const chronicle = createChronicle(bus);

    bus.send(
      { performative: "inform", ontology: ONT_FAMILY.DEATH, sender: "world", recipient: "broadcast", body: { tick: 1, agentId: 1, cause: "oldAge" } },
      1,
    );
    bus.send(
      { performative: "inform", ontology: ONT_FAMILY.DEATH, sender: "world", recipient: "broadcast", body: { tick: 1, agentId: 2, cause: "starvation" } },
      1,
    );
    bus.send(
      { performative: "inform", ontology: ONT_SOCIAL.GIFT, sender: 3, recipient: "broadcast", body: { tick: 1, from: 3, to: 4 } },
      1,
    );
    dispatchTick(bus);

    expect(chronicle.deathsByCause()).toEqual({ oldAge: 1, starvation: 1, violence: 0, disease: 0 });
    expect(chronicle.events().length).toBe(3); // 2 deaths + 1 gift
  });

  it("countByOntology counts only matching events", () => {
    const bus = new MessageBus();
    const chronicle = createChronicle(bus);

    bus.send(
      { performative: "inform", ontology: ONT_FAMILY.BIRTH, sender: "world", recipient: "broadcast", body: { tick: 1, childId: 1, parentAId: 2, parentBId: 3 } },
      1,
    );
    bus.send(
      { performative: "inform", ontology: ONT_FAMILY.BIRTH, sender: "world", recipient: "broadcast", body: { tick: 2, childId: 4, parentAId: 2, parentBId: 3 } },
      2,
    );
    bus.send(
      { performative: "inform", ontology: ONT_FAMILY.DEATH, sender: "world", recipient: "broadcast", body: { tick: 3, agentId: 1, cause: "oldAge" } },
      3,
    );
    dispatchTick(bus);

    expect(countByOntology(chronicle.events(), ONT_FAMILY.BIRTH)).toBe(2);
    expect(countByOntology(chronicle.events(), ONT_FAMILY.DEATH)).toBe(1);
  });

  it("exports CHRONICLE_CAP as the default cap (audit-12) — generous, not the DOM's 300", () => {
    expect(CHRONICLE_CAP).toBeGreaterThanOrEqual(10_000);
  });

  it("below the cap, nothing is dropped and droppedCount is 0", () => {
    const bus = new MessageBus();
    const chronicle = createChronicle(bus, 5);

    for (let i = 0; i < 5; i++) sendGift(bus, i, i);

    expect(chronicle.events().length).toBe(5);
    expect(chronicle.droppedCount()).toBe(0);
  });

  it("past the cap, retention is bounded, oldest events are dropped, newest are kept, and the tally is exact", () => {
    const bus = new MessageBus();
    const cap = 5;
    const chronicle = createChronicle(bus, cap);

    // Push 12 events (seq 0..11) through a 5-slot chronicle — 7 should be
    // evicted (the oldest 7, seq 0..6), leaving exactly the newest 5 (seq
    // 7..11) retained.
    const totalPushed = 12;
    for (let i = 0; i < totalPushed; i++) sendGift(bus, i, i);

    const events = chronicle.events();
    expect(events.length).toBe(cap); // bounded — never exceeds cap
    expect(chronicle.droppedCount()).toBe(totalPushed - cap); // exact tally

    // Oldest retained is the (totalPushed - cap)-th pushed event; newest
    // retained is the very last one pushed — confirms oldest-evicted /
    // newest-kept ordering, not just a count.
    expect(events[0]!["from"]).toBe(totalPushed - cap);
    expect(events[cap - 1]!["from"]).toBe(totalPushed - 1);
    expect(events.map((e) => e["from"])).toEqual([7, 8, 9, 10, 11]);
  });

  it("continues evicting correctly across many pushes past the cap (ring wraps more than once)", () => {
    const bus = new MessageBus();
    const cap = 4;
    const chronicle = createChronicle(bus, cap);

    const totalPushed = 23; // well past several full wraps of a 4-slot ring
    for (let i = 0; i < totalPushed; i++) sendGift(bus, i, i);

    expect(chronicle.events().length).toBe(cap);
    expect(chronicle.droppedCount()).toBe(totalPushed - cap);
    expect(chronicle.events().map((e) => e["from"])).toEqual([19, 20, 21, 22]);
  });

  it("deathsByCause stays exact even once the event cap is exceeded (a running counter, not a stored event)", () => {
    const bus = new MessageBus();
    const chronicle = createChronicle(bus, 2);

    for (let i = 0; i < 6; i++) sendGift(bus, i, i); // fills + overflows the 2-slot cap
    bus.send(
      { performative: "inform", ontology: ONT_FAMILY.DEATH, sender: "world", recipient: "broadcast", body: { tick: 6, agentId: 1, cause: "oldAge" } },
      6,
    );
    dispatchTick(bus);

    expect(chronicle.deathsByCause()).toEqual({ oldAge: 1, starvation: 0, violence: 0, disease: 0 });
  });

  it("captureRationalizerDecisions flattens a decision into a rationalize.decision event carrying both bdiKind and chosenKind", () => {
    const bus = new MessageBus();
    const chronicle = createChronicle(bus);

    chronicle.captureRationalizerDecisions([makeDecision()]);

    expect(chronicle.events()).toEqual([
      {
        tick: 10,
        ontology: ONT_RATIONALIZE.DECISION,
        agentId: 1,
        requestTick: 8,
        provider: "stub",
        outcome: "adopted",
        reason: null,
        rationale: "agent 1 at tick 8: stealing looked better than trading",
        bdiKind: "trade",
        chosenKind: "steal",
      },
    ]);
  });

  it("interleaves rationalizer decisions with bus-sourced events in the same buffer, unaffected by ontology", () => {
    const bus = new MessageBus();
    const chronicle = createChronicle(bus);

    bus.send(
      { performative: "inform", ontology: ONT_FAMILY.BIRTH, sender: "world", recipient: "broadcast", body: { tick: 1, childId: 1, parentAId: 2, parentBId: 3 } },
      1,
    );
    dispatchTick(bus);
    chronicle.captureRationalizerDecisions([makeDecision({ tick: 2 })]);
    bus.send(
      { performative: "inform", ontology: ONT_FAMILY.BIRTH, sender: "world", recipient: "broadcast", body: { tick: 3, childId: 4, parentAId: 2, parentBId: 3 } },
      3,
    );
    dispatchTick(bus);

    const events = chronicle.events();
    expect(events.length).toBe(3);
    expect(events.map((e) => e.ontology)).toEqual([ONT_FAMILY.BIRTH, ONT_RATIONALIZE.DECISION, ONT_FAMILY.BIRTH]);
    expect(countByOntology(events, ONT_RATIONALIZE.DECISION)).toBe(1);
  });

  it("a rejected decision's empty rationale round-trips as '', not dropped or altered", () => {
    const bus = new MessageBus();
    const chronicle = createChronicle(bus);

    chronicle.captureRationalizerDecisions([
      makeDecision({ outcome: "rejected", reason: "stale-candidates", rationale: "", bdiKind: "gift", chosenKind: "gift" }),
    ]);

    const [event] = chronicle.events();
    expect(event!["outcome"]).toBe("rejected");
    expect(event!["reason"]).toBe("stale-candidates");
    expect(event!["rationale"]).toBe("");
  });

  it("defensively re-clamps an oversized rationale to RATIONALE_MAX_CHARS rather than trusting the caller", () => {
    const bus = new MessageBus();
    const chronicle = createChronicle(bus);
    const overlong = "x".repeat(1000);

    chronicle.captureRationalizerDecisions([makeDecision({ rationale: overlong })]);

    const [event] = chronicle.events();
    expect((event!["rationale"] as string).length).toBe(400);
  });

  it("rationalizer decisions count toward the cap/eviction/droppedCount accounting exactly like bus events (audit-32 honesty holds)", () => {
    const bus = new MessageBus();
    const cap = 4;
    const chronicle = createChronicle(bus, cap);

    // 3 bus-sourced gifts + 3 rationalizer decisions = 6 pushes through a
    // 4-slot ring: 2 should be evicted (the oldest 2), regardless of which
    // ontology they came from.
    sendGift(bus, 0, 0);
    sendGift(bus, 1, 1);
    chronicle.captureRationalizerDecisions([makeDecision({ tick: 2, agentId: 100 })]);
    chronicle.captureRationalizerDecisions([makeDecision({ tick: 3, agentId: 101 })]);
    sendGift(bus, 4, 4);
    chronicle.captureRationalizerDecisions([makeDecision({ tick: 5, agentId: 102 })]);

    const events = chronicle.events();
    expect(events.length).toBe(cap);
    expect(chronicle.droppedCount()).toBe(2); // 6 pushed - 4 cap
    // Newest 4 retained, oldest-first: the two oldest pushes (the gifts at
    // tick 0, 1) are evicted; the two decisions at tick 2/3, the gift at
    // tick 4, and the decision at tick 5 survive, in push order.
    expect(events.map((e) => e.tick)).toEqual([2, 3, 4, 5]);
    expect(events.map((e) => e.ontology)).toEqual([
      ONT_RATIONALIZE.DECISION,
      ONT_RATIONALIZE.DECISION,
      ONT_SOCIAL.GIFT,
      ONT_RATIONALIZE.DECISION,
    ]);
  });
});
