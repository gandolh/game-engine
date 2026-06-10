import { describe, it, expect } from "vitest";
import { World } from "@engine/core";
import type { GameEntity } from "../components";
import { TavernSystem, pickGossip } from "./tavern";
import type { EventEntry, EventFeedSystem } from "./event-feed";
import { ONT_SIMULATION } from "../protocols";
import { PERFORMATIVE } from "../protocols/performatives";

function entry(partial: Partial<EventEntry> & Pick<EventEntry, "text" | "drama">): EventEntry {
  return {
    tick: partial.tick ?? 0,
    day: partial.day ?? 0,
    text: partial.text,
    key: partial.key ?? partial.text,
    drama: partial.drama,
    farmerId: null,
  };
}

/** Minimal EventFeedSystem stand-in exposing recent(). */
function feedStub(entries: EventEntry[]): EventFeedSystem {
  return { recent: () => entries } as unknown as EventFeedSystem;
}

describe("pickGossip", () => {
  it("returns undefined for an empty feed", () => {
    expect(pickGossip([])).toBeUndefined();
  });

  it("picks the highest-drama recent entry", () => {
    const feed = [
      entry({ text: "minor trade", drama: 0.2, tick: 1 }),
      entry({ text: "Drought! Cora lost 3 crops", drama: 0.9, tick: 2 }),
      entry({ text: "another trade", drama: 0.3, tick: 3 }),
    ];
    expect(pickGossip(feed)).toBe('"Drought! Cora lost 3 crops," says the barkeep.');
  });

  it("ties broken by newest tick then stable key (deterministic)", () => {
    const feed = [
      entry({ text: "alpha", drama: 0.5, tick: 5, key: "a" }),
      entry({ text: "beta", drama: 0.5, tick: 9, key: "b" }),
      entry({ text: "gamma", drama: 0.5, tick: 9, key: "c" }),
    ];
    // Both beta/gamma are newest (tick 9) and tie on drama; key "b" < "c" wins.
    expect(pickGossip(feed)).toBe('"beta," says the barkeep.');
  });
});

describe("TavernSystem", () => {
  it("stamps a deterministic gossip line on the tavern at day-start", () => {
    const world = new World<GameEntity>();
    const tavern = world.spawn({
      tavern: { isTavern: true },
      inbox: { messages: [] },
    });
    const feed = feedStub([
      entry({ text: "Atticus won the golden bean at 120g", drama: 0.8, tick: 4 }),
      entry({ text: "a small trade", drama: 0.1, tick: 5 }),
    ]);
    const sys = new TavernSystem(world, feed);

    tavern.inbox!.messages.push({
      performative: PERFORMATIVE.INFORM,
      ontology: ONT_SIMULATION.DAY_START,
      sender: "world",
      body: { day: 1 } as Record<string, unknown>,
      tickIssued: 0,
    });
    sys.run({ tick: 20 } as never);

    expect(tavern.tavern!.gossip).toBe('"Atticus won the golden bean at 120g," says the barkeep.');
    expect(tavern.tavern!.gossipDay).toBe(1);
  });

  it("falls back to a quiet line when the feed is empty", () => {
    const world = new World<GameEntity>();
    const tavern = world.spawn({ tavern: { isTavern: true }, inbox: { messages: [] } });
    const sys = new TavernSystem(world, feedStub([]));
    tavern.inbox!.messages.push({
      performative: PERFORMATIVE.INFORM,
      ontology: ONT_SIMULATION.DAY_START,
      sender: "world",
      body: { day: 1 } as Record<string, unknown>,
      tickIssued: 0,
    });
    sys.run({ tick: 20 } as never);
    expect(tavern.tavern!.gossip).toBe("The valley is quiet today.");
  });
});
