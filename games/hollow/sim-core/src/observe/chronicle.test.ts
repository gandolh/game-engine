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
import { createChronicle, countByOntology } from "./chronicle";

function dispatchTick(bus: MessageBus): void {
  bus.flush();
  bus.notifySubscribers();
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
});
