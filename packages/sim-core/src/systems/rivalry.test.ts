/**
 * rivalry.test.ts — unit tests for RivalrySystem.
 *
 * Tests drive the accumulator logic directly by spawning farmer entities,
 * placing DECLINE messages in their inboxes, and calling rivalry.run().
 * This mirrors how event-feed.test.ts exercises EventFeedSystem.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { World } from "@engine/core";
import type { GameEntity } from "../components";
import { RivalrySystem, RIVALRY_THRESHOLD, ALLIANCE_TRUST_THRESHOLD } from "./rivalry";
import { ONT_ENCOUNTER } from "../protocols/encounter";
import { PERFORMATIVE } from "../protocols";

// ---- helpers ---------------------------------------------------------------

function makeFarmer(world: World<GameEntity>, name: string): GameEntity {
  return world.spawn({
    farmer: { name, currentRegion: "village" },
    inbox: { messages: [] },
  });
}

function pushDecline(
  entity: GameEntity,
  senderFarmer: GameEntity,
): void {
  entity.inbox!.messages.push({
    performative: PERFORMATIVE.INFORM,
    ontology: ONT_ENCOUNTER.DECLINE,
    sender: senderFarmer.id!,
    body: { offerId: `offer-${Math.random()}` },
    tickIssued: 0,
  });
}

// ---- tests -----------------------------------------------------------------

describe("RivalrySystem — rivalry accumulation", () => {
  let world: World<GameEntity>;
  let rivalry: RivalrySystem;

  beforeEach(() => {
    world = new World<GameEntity>();
    rivalry = new RivalrySystem(world);
  });

  it("does not form a rivalry below threshold", () => {
    const alice = makeFarmer(world, "Alice");
    const bob = makeFarmer(world, "Bob");

    // Push fewer declines than threshold.
    for (let i = 0; i < RIVALRY_THRESHOLD - 1; i++) {
      pushDecline(alice, bob); // alice received a DECLINE from bob
      rivalry.run({ tick: i });
      alice.inbox!.messages.length = 0;
    }

    expect(rivalry.activeRivalries()).toHaveLength(0);
  });

  it("forms a rivalry when adverse events reach RIVALRY_THRESHOLD", () => {
    const alice = makeFarmer(world, "Alice");
    const bob = makeFarmer(world, "Bob");

    for (let i = 0; i < RIVALRY_THRESHOLD; i++) {
      pushDecline(alice, bob);
      rivalry.run({ tick: i });
      alice.inbox!.messages.length = 0;
    }

    const rivalries = rivalry.activeRivalries();
    expect(rivalries).toHaveLength(1);
    expect(rivalries[0]!.score).toBeGreaterThanOrEqual(RIVALRY_THRESHOLD);
    // Ordered pair: aId < bId
    expect(rivalries[0]!.aId).toBeLessThan(rivalries[0]!.bId);
  });

  it("pair key is ordered (aId < bId) regardless of message direction", () => {
    const alice = makeFarmer(world, "Alice");
    const bob = makeFarmer(world, "Bob");

    // Declines in both directions accumulate to the same ordered pair.
    for (let i = 0; i < RIVALRY_THRESHOLD; i++) {
      if (i % 2 === 0) {
        pushDecline(alice, bob); // alice inbox, sender=bob
      } else {
        pushDecline(bob, alice); // bob inbox, sender=alice
      }
      rivalry.run({ tick: i });
      alice.inbox!.messages.length = 0;
      bob.inbox!.messages.length = 0;
    }

    const rivalries = rivalry.activeRivalries();
    expect(rivalries).toHaveLength(1);
    // Exactly one unique ordered pair.
    expect(rivalries[0]!.aId).toBeLessThan(rivalries[0]!.bId);
  });

  it("freshlyFormedThisTick returns the new rivalry on the crossing tick", () => {
    const alice = makeFarmer(world, "Alice");
    const bob = makeFarmer(world, "Bob");

    // Warm up to threshold - 1.
    for (let i = 0; i < RIVALRY_THRESHOLD - 1; i++) {
      pushDecline(alice, bob);
      rivalry.run({ tick: i });
      alice.inbox!.messages.length = 0;
      // Nothing fresh yet.
      expect(rivalry.freshlyFormedThisTick()).toHaveLength(0);
    }

    // The crossing tick.
    pushDecline(alice, bob);
    rivalry.run({ tick: RIVALRY_THRESHOLD });
    alice.inbox!.messages.length = 0;

    const fresh = rivalry.freshlyFormedThisTick();
    expect(fresh).toHaveLength(1);
    expect(fresh[0]!.kind).toBe("rivalry");
  });

  it("does not re-announce an already-active rivalry on subsequent ticks", () => {
    const alice = makeFarmer(world, "Alice");
    const bob = makeFarmer(world, "Bob");

    for (let i = 0; i < RIVALRY_THRESHOLD; i++) {
      pushDecline(alice, bob);
      rivalry.run({ tick: i });
      alice.inbox!.messages.length = 0;
    }

    // After crossing, another decline should not re-fire freshlyFormed.
    pushDecline(alice, bob);
    rivalry.run({ tick: 99 });
    expect(rivalry.freshlyFormedThisTick()).toHaveLength(0);
  });
});

describe("RivalrySystem — determinism", () => {
  it("same adverse event sequence produces identical rivalries across two instances", () => {
    function buildScenario(): RivalrySystem {
      const w = new World<GameEntity>();
      const r = new RivalrySystem(w);
      const alice = makeFarmer(w, "Alice");
      const bob = makeFarmer(w, "Bob");
      for (let i = 0; i < RIVALRY_THRESHOLD; i++) {
        pushDecline(alice, bob);
        r.run({ tick: i });
        alice.inbox!.messages.length = 0;
      }
      return r;
    }

    const r1 = buildScenario();
    const r2 = buildScenario();

    expect(r1.activeRivalries()).toEqual(r2.activeRivalries());
  });
});

describe("RivalrySystem — alliances", () => {
  it("detects an alliance when both farmers trust each other above threshold", () => {
    const world2 = new World<GameEntity>();
    const rivalry2 = new RivalrySystem(world2);

    const alice = world2.spawn({
      farmer: { name: "Alice", currentRegion: "village" },
      inbox: { messages: [] },
      trust: { byId: new Map() },
    });
    const bob = world2.spawn({
      farmer: { name: "Bob", currentRegion: "village" },
      inbox: { messages: [] },
      trust: { byId: new Map() },
    });

    // Set mutual trust above threshold.
    alice.trust!.byId.set(bob.id!, ALLIANCE_TRUST_THRESHOLD + 0.01);
    bob.trust!.byId.set(alice.id!, ALLIANCE_TRUST_THRESHOLD + 0.01);

    rivalry2.run({ tick: 0 });

    const alliances = rivalry2.activeAlliances();
    expect(alliances).toHaveLength(1);
    expect(alliances[0]!.aId).toBeLessThan(alliances[0]!.bId);
  });

  it("does not detect an alliance when only one side trusts the other", () => {
    const world2 = new World<GameEntity>();
    const rivalry2 = new RivalrySystem(world2);

    const alice = world2.spawn({
      farmer: { name: "Alice", currentRegion: "village" },
      inbox: { messages: [] },
      trust: { byId: new Map() },
    });
    const bob = world2.spawn({
      farmer: { name: "Bob", currentRegion: "village" },
      inbox: { messages: [] },
      trust: { byId: new Map() },
    });

    // Only Alice trusts Bob.
    alice.trust!.byId.set(bob.id!, ALLIANCE_TRUST_THRESHOLD + 0.01);
    // Bob trusts Alice at baseline (0.5).

    rivalry2.run({ tick: 0 });

    expect(rivalry2.activeAlliances()).toHaveLength(0);
  });

  it("freshlyFormedThisTick includes alliance kind on first detection", () => {
    const world2 = new World<GameEntity>();
    const rivalry2 = new RivalrySystem(world2);

    const alice = world2.spawn({
      farmer: { name: "Alice", currentRegion: "village" },
      inbox: { messages: [] },
      trust: { byId: new Map() },
    });
    const bob = world2.spawn({
      farmer: { name: "Bob", currentRegion: "village" },
      inbox: { messages: [] },
      trust: { byId: new Map() },
    });

    alice.trust!.byId.set(bob.id!, ALLIANCE_TRUST_THRESHOLD + 0.05);
    bob.trust!.byId.set(alice.id!, ALLIANCE_TRUST_THRESHOLD + 0.05);

    rivalry2.run({ tick: 0 });

    const fresh = rivalry2.freshlyFormedThisTick();
    const allianceFresh = fresh.filter((f) => f.kind === "alliance");
    expect(allianceFresh).toHaveLength(1);

    // Second tick: should NOT re-announce.
    rivalry2.run({ tick: 1 });
    const fresh2 = rivalry2.freshlyFormedThisTick().filter((f) => f.kind === "alliance");
    expect(fresh2).toHaveLength(0);
  });
});
