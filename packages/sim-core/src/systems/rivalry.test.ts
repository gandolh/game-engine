/**
 * rivalry.test.ts — unit tests for RivalrySystem (trust-axis LABELER).
 *
 * RivalrySystem no longer accumulates adverse events; rivalry/alliance are
 * DERIVED each tick from the directional `trust` map. Tests set trust values
 * directly and call rivalry.run().
 *
 *   rivalry  : DIRECTIONAL — from→to trust < RIVAL_CUTOFF (0.25).
 *   hysteresis: fresh fires once on crossing down; re-arms only above RIVAL_REARM (0.40).
 *   alliance : undirected mutual trust >= ALLIANCE_TRUST_THRESHOLD (0.8).
 */

import { describe, it, expect, beforeEach } from "vitest";
import { World } from "@engine/core";
import type { GameEntity } from "../components";
import {
  RivalrySystem,
  RIVAL_CUTOFF,
  RIVAL_REARM,
  ALLIANCE_TRUST_THRESHOLD,
} from "./rivalry";

// ---- helpers ---------------------------------------------------------------

function makeFarmer(world: World<GameEntity>, name: string): GameEntity {
  return world.spawn({
    farmer: { name, currentRegion: "village" },
    inbox: { messages: [] },
    trust: { byId: new Map<number, number>() },
  });
}

function setTrust(from: GameEntity, to: GameEntity, value: number): void {
  from.trust!.byId.set(to.id!, value);
}

// ---- tests -----------------------------------------------------------------

describe("RivalrySystem — directional rivalry labeling", () => {
  let world: World<GameEntity>;
  let rivalry: RivalrySystem;

  beforeEach(() => {
    world = new World<GameEntity>();
    rivalry = new RivalrySystem(world);
  });

  it("no rivalry at baseline trust (0.5)", () => {
    makeFarmer(world, "Alice");
    makeFarmer(world, "Bob");
    rivalry.run({ tick: 0 });
    expect(rivalry.activeRivalries()).toHaveLength(0);
  });

  it("no rivalry just above the cutoff", () => {
    const alice = makeFarmer(world, "Alice");
    const bob = makeFarmer(world, "Bob");
    setTrust(alice, bob, RIVAL_CUTOFF + 0.01);
    rivalry.run({ tick: 0 });
    expect(rivalry.activeRivalries()).toHaveLength(0);
  });

  it("labels a one-sided rivalry when my trust drops below the cutoff", () => {
    const alice = makeFarmer(world, "Alice");
    const bob = makeFarmer(world, "Bob");
    setTrust(alice, bob, RIVAL_CUTOFF - 0.05); // Alice resents Bob; Bob is neutral
    rivalry.run({ tick: 0 });

    const rivalries = rivalry.activeRivalries();
    expect(rivalries).toHaveLength(1); // directional: only Alice→Bob
    expect(rivalries[0]!.aId).toBe(alice.id);
    expect(rivalries[0]!.bId).toBe(bob.id);
    expect(rivalries[0]!.score).toBeLessThan(RIVAL_CUTOFF);
  });

  it("can label both directions independently (mutual grudge)", () => {
    const alice = makeFarmer(world, "Alice");
    const bob = makeFarmer(world, "Bob");
    setTrust(alice, bob, 0.1);
    setTrust(bob, alice, 0.2);
    rivalry.run({ tick: 0 });
    expect(rivalry.activeRivalries()).toHaveLength(2);
  });

  it("freshlyFormedThisTick fires on the crossing tick, once", () => {
    const alice = makeFarmer(world, "Alice");
    const bob = makeFarmer(world, "Bob");

    // Above cutoff first → nothing fresh.
    setTrust(alice, bob, 0.5);
    rivalry.run({ tick: 0 });
    expect(rivalry.freshlyFormedThisTick()).toHaveLength(0);

    // Cross down → fresh fires.
    setTrust(alice, bob, 0.1);
    rivalry.run({ tick: 1 });
    const fresh = rivalry.freshlyFormedThisTick();
    expect(fresh).toHaveLength(1);
    expect(fresh[0]!.kind).toBe("rivalry");

    // Still below, but latched → no re-fire.
    rivalry.run({ tick: 2 });
    expect(rivalry.freshlyFormedThisTick()).toHaveLength(0);
  });

  it("hysteresis: re-arms only after trust climbs above RIVAL_REARM", () => {
    const alice = makeFarmer(world, "Alice");
    const bob = makeFarmer(world, "Bob");

    setTrust(alice, bob, 0.1);
    rivalry.run({ tick: 0 });
    expect(rivalry.freshlyFormedThisTick()).toHaveLength(1);

    // Recover into the hysteresis band (between cutoff and re-arm): still latched.
    setTrust(alice, bob, (RIVAL_CUTOFF + RIVAL_REARM) / 2);
    rivalry.run({ tick: 1 });
    // Drop again — must NOT re-fire (never re-armed).
    setTrust(alice, bob, 0.1);
    rivalry.run({ tick: 2 });
    expect(rivalry.freshlyFormedThisTick()).toHaveLength(0);

    // Now recover fully past the re-arm mark, then drop → fresh fires again.
    setTrust(alice, bob, RIVAL_REARM + 0.05);
    rivalry.run({ tick: 3 });
    setTrust(alice, bob, 0.1);
    rivalry.run({ tick: 4 });
    expect(rivalry.freshlyFormedThisTick()).toHaveLength(1);
  });
});

describe("RivalrySystem — determinism", () => {
  it("same trust state produces identical rivalries across two instances", () => {
    function buildScenario(): RivalrySystem {
      const w = new World<GameEntity>();
      const r = new RivalrySystem(w);
      const alice = makeFarmer(w, "Alice");
      const bob = makeFarmer(w, "Bob");
      setTrust(alice, bob, 0.1);
      setTrust(bob, alice, 0.15);
      r.run({ tick: 0 });
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
