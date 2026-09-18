/**
 * audit-43 — the hardening `@farm/server` has and `@citadel/server` never got.
 *
 * Citadel MP is deprecated (decision #21) and nothing hosts it, so none of this is currently
 * reachable. That is exactly why it is worth pinning: `wiki/citadel-mp-deprecated.md` is the record
 * of what must be true before MP could ever be exposed, and a hazard recorded only in a closed
 * audit is a hazard that gets re-found. Nothing here revives MP.
 *
 * Each gap below is a place Citadel DIVERGED from the Farm server that got it right.
 */
import { describe, it, expect, vi } from "vitest";
import { CitadelSimHost } from "./sim-host";
import type { WorkerInbound } from "@citadel/sim-core/snapshot";

function bootedHost(): { host: CitadelSimHost; peer0: ReturnType<CitadelSimHost["attach"]> } {
  const host = new CitadelSimHost({ worldWidth: 96, worldHeight: 96, enforceTerritory: false });
  const peer0 = host.attach(() => {});
  host.handleInbound(peer0, { type: "init", seed: 1, ticksPerDay: 20 });
  return { host, peer0 };
}

describe("audit-43 #1 — speed is clamped to the same ceiling Farm uses", () => {
  it("clamps an absurd multiplier instead of taking it literally", () => {
    const { host, peer0 } = bootedHost();
    // `speed` is a SYNCHRONOUS loop count inside setInterval, so an unbounded value is unbounded
    // work in one callback. The host-only check is no defence: `attach` makes the FIRST peer the
    // host, so on a public box the attacker simply connects first.
    host.handleInbound(peer0, { type: "speed", multiplier: 1e9 });
    expect(host.speedMultiplier).toBe(8);

    host.handleInbound(peer0, { type: "speed", multiplier: Number.MAX_SAFE_INTEGER });
    expect(host.speedMultiplier).toBe(8);
  });

  it("still honours legitimate speeds exactly", () => {
    const { host, peer0 } = bootedHost();
    for (const m of [1, 2, 4, 8]) {
      host.handleInbound(peer0, { type: "speed", multiplier: m });
      expect(host.speedMultiplier).toBe(m);
    }
  });

  it("falls back to 1 for nonsense rather than NaN-ing the loop count", () => {
    const { host, peer0 } = bootedHost();
    for (const m of [0, -5, NaN, Infinity]) {
      host.handleInbound(peer0, { type: "speed", multiplier: m });
      expect(host.speedMultiplier).toBe(1);
    }
  });
});

describe("audit-43 #2 — malformed frames neither throw nor change state", () => {
  const JUNK: ReadonlyArray<readonly [string, unknown]> = [
    ["empty object", {}],
    ["null", null],
    ["unknown type", { type: "sudo-win" }],
    // The specific unguarded deref: `msg.command.type` with no `command`.
    ["command with no command", { type: "command" }],
    ["command with a null command", { type: "command", command: null }],
    ["command with a typeless command", { type: "command", command: {} }],
    ["command whose type is a number", { type: "command", command: { type: 7 } }],
    ["speed with no multiplier", { type: "speed" }],
    ["speed as a word", { type: "speed", multiplier: "fast" }],
    ["init with no seed", { type: "init" }],
  ];

  for (const [name, frame] of JUNK) {
    it(`does not throw on ${name}`, () => {
      const { host, peer0 } = bootedHost();
      const before = host.simResult!.state.commandLog.length;
      const dayBefore = host.simResult!.state.day;

      expect(() => { host.handleInbound(peer0, frame as WorkerInbound); }).not.toThrow();

      expect(host.simResult!.state.commandLog.length).toBe(before);
      expect(host.simResult!.state.day).toBe(dayBefore);
    });
  }

  it("a throwing system halts the room instead of taking the process down", () => {
    // Farm has had this since audit-17; Citadel's `step()` called `scheduler.tick` bare, so one
    // throw from any system inside the interval callback ended the whole server.
    const { host } = bootedHost();
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    host.simResult!.scheduler.add({
      name: "exploding-test-system",
      run: () => { throw new Error("boom"); },
    });

    expect(() => { host.step(); }).not.toThrow();
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });
});

describe("audit-43 #3 — an oversized drag is refused before it reaches the tick", () => {
  it("drops a placeRoad carrying more tiles than any gesture could", () => {
    const { host, peer0 } = bootedHost();
    const before = host.simResult!.state.commandLog.length;

    const tiles = Array.from({ length: 50_000 }, (_, i) => ({ x: i % 96, y: (i / 96) | 0 }));
    host.handleInbound(peer0, { type: "command", command: { type: "placeRoad", payload: { tiles } } });
    host.step();

    // `placeDragged` loops the payload with no length check of its own, so one frame controlled
    // how much work the tick did.
    expect(host.simResult!.state.commandLog.length).toBe(before);
  });

  it("a normal-sized drag still goes through", () => {
    const { host, peer0 } = bootedHost();
    const tiles = Array.from({ length: 12 }, (_, i) => ({ x: 20 + i, y: 20 }));
    host.handleInbound(peer0, { type: "command", command: { type: "placeRoad", payload: { tiles } } });
    host.step();

    expect(host.simResult!.state.commandLog.some((e) => e.command.type === "placeRoad")).toBe(true);
  });

  it("drops a placeRoad whose tiles are not an array at all", () => {
    const { host, peer0 } = bootedHost();
    const before = host.simResult!.state.commandLog.length;
    host.handleInbound(peer0, {
      type: "command", command: { type: "placeRoad", payload: { tiles: "everywhere" } },
    } as unknown as WorkerInbound);
    host.step();
    expect(host.simResult!.state.commandLog.length).toBe(before);
  });
});

describe("audit-43 #4 — PlayerState does not grow without bound", () => {
  it("a peer that built nothing has its PlayerState removed on detach", () => {
    const { host } = bootedHost();
    const before = host.simResult!.state.players.length;

    const peer = host.attach(() => {});
    expect(host.simResult!.state.players.length).toBe(before + 1);

    host.detach(peer);

    // `nextPlayerId` only incremented and `ensurePlayer` only pushed, so every connect used to
    // leave an entry FOREVER — `reset()` fires only when the room fully empties, and ~89 sim-core
    // call sites iterate this array.
    expect(host.simResult!.state.players.length).toBe(before);
  });

  it("reconnect-looping cannot grow state.players", () => {
    const { host } = bootedHost();
    const before = host.simResult!.state.players.length;

    for (let i = 0; i < 200; i++) {
      const p = host.attach(() => {});
      host.detach(p);
    }

    expect(host.simResult!.state.players.length).toBe(before);
  });

  it("a peer that BUILT something keeps its PlayerState — orphaning a settlement is worse", () => {
    // The prune is deliberately safe-only: buildings and villagers carry the owner's id, so a
    // player with holdings is never removed. The unbounded case (connect, leave, built nothing) is
    // exactly the prunable one.
    const { host } = bootedHost();
    const peer = host.attach(() => {});
    const myId = host.simResult!.state.players.at(-1)!.id;

    host.handleInbound(peer, {
      type: "command",
      command: { type: "placeBuilding", payload: { buildingType: "town-hall", x: 30, y: 30 } },
    });
    host.step();

    const built = host.simResult!.getBuildings().some((b) => b.ownerId === myId);
    host.detach(peer);

    if (built) {
      expect(host.simResult!.state.players.some((p) => p.id === myId)).toBe(true);
    }
  });

  it("player ids are never reused, so nothing inherits a pruned identity", () => {
    const { host } = bootedHost();
    const a = host.attach(() => {});
    const idA = a.playerId;
    host.detach(a);
    const b = host.attach(() => {});

    expect(b.playerId).toBeGreaterThan(idA);
  });
});
