/**
 * Citadel 38 P1#7 — room lifecycle / reconnect.
 *
 * The bug: `detach` stopped the tick interval but never nulled `sim`, so after
 * everyone left, a reconnecting peer's `init` took the "already running" branch
 * and received a snapshot of a sim whose interval was dead → frozen, no ticking.
 *
 * The fix mirrors the Farm RunRegistry reap pattern (adapted to Citadel's single
 * room-per-process host): the last departure arms a grace timer; if it fires while
 * still empty the room fully resets (sim → null), so the next `init` starts a clean,
 * ticking sim. A reconnect within the grace window cancels the reap and rejoins the
 * same live sim.
 */
import { describe, it, expect, vi } from "vitest";
import { CitadelSimHost } from "./sim-host";

describe("Citadel 38 P1#7 — room lifecycle / reconnect", () => {
  it("resets after the grace window so a reconnect gets a FRESH ticking sim (not frozen)", () => {
    vi.useFakeTimers();
    const host = new CitadelSimHost({ worldWidth: 96, worldHeight: 96, enforceTerritory: false, reapGraceMs: 100 });

    const peer0 = host.attach(() => {});
    host.handleInbound(peer0, { type: "init", seed: 1, ticksPerDay: 20 });
    host.step();
    const firstSim = host.simResult;
    expect(firstSim).not.toBeNull();

    // Everyone leaves → reap armed, but the sim is still alive during the grace.
    host.detach(peer0);
    expect(host.simResult).not.toBeNull();

    // Grace elapses while still empty → full reset.
    vi.advanceTimersByTime(101);
    expect(host.simResult).toBeNull();
    expect(host.peerCount).toBe(0);
    expect(host.hostPlayerId).toBeNull();

    // Reconnect: a brand-new room is created on init and ticks (the old bug
    // would have reused the frozen sim instead of starting one).
    const peer1 = host.attach(() => {});
    expect(host.simResult).toBeNull(); // not started until init
    host.handleInbound(peer1, { type: "init", seed: 2, ticksPerDay: 20 });
    expect(host.simResult).not.toBeNull();
    expect(host.simResult).not.toBe(firstSim); // a distinct, fresh sim
    expect([...host.simResult!.world.query("building")].length).toBe(0); // clean slate
    expect(() => host.step()).not.toThrow(); // it ticks → not frozen

    vi.useRealTimers();
  });

  it("a reconnect within the grace window keeps the SAME live room (reap canceled)", () => {
    vi.useFakeTimers();
    const host = new CitadelSimHost({ worldWidth: 96, worldHeight: 96, enforceTerritory: false, reapGraceMs: 200 });

    const peer0 = host.attach(() => {});
    host.handleInbound(peer0, { type: "init", seed: 1, ticksPerDay: 20 });
    const liveSim = host.simResult;
    expect(liveSim).not.toBeNull();

    host.detach(peer0); // room empties → reap armed
    const peer1 = host.attach(() => {}); // reconnect before grace → cancels reap
    expect(host.simResult).toBe(liveSim); // same live sim, not reset

    vi.advanceTimersByTime(201); // the original grace would have fired by now
    expect(host.simResult).toBe(liveSim); // still the same room
    expect(host.peerCount).toBe(1);
    expect(host.hostPlayerId).toBe(peer1.playerId); // reconnecting peer is the new host

    vi.useRealTimers();
  });
});
