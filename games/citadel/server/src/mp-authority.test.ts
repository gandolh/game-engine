/**
 * Citadel 38 — MP command authority (server host).
 *
 * P0#3: a peer must not be able to inject a `setActivePlayer` routing marker — the
 *       host drops it (and stamps its own trusted marker for real commands).
 * P0#4: room control (pause / resume / speed) is host-only; a non-host peer can't
 *       freeze or fast-forward the shared sim. Host migrates if the host leaves.
 */
import { describe, it, expect } from "vitest";
import { CitadelSimHost } from "./sim-host";
import type { WorkerOutbound, RenderSnapshot } from "@citadel/sim-core/snapshot";
import type { TerrainGrid } from "@citadel/sim-core/world/terrain";
import { TerrainType } from "@citadel/sim-core/world/terrain";

/** The last snapshot a peer received (authoritative fanned-out view). */
function lastSnapshot(msgs: WorkerOutbound[]): RenderSnapshot | undefined {
  for (let i = msgs.length - 1; i >= 0; i--) {
    const m = msgs[i]!;
    if (m.type === "snapshot") return m.snapshot;
  }
  return undefined;
}

function findGrass(t: TerrainGrid, w: number, h: number, sx: number, sy: number): { x: number; y: number } {
  for (let r = 0; r < 40; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const x = sx + dx, y = sy + dy;
        if (x < 0 || y < 0 || x + w > t.width || y + h > t.height) continue;
        let ok = true;
        for (let yy = 0; yy < h && ok; yy++)
          for (let xx = 0; xx < w; xx++)
            if (t.cells[(y + yy) * t.width + (x + xx)] !== TerrainType.Grass) { ok = false; break; }
        if (ok) return { x, y };
      }
    }
  }
  return { x: sx, y: sy };
}

describe("Citadel 38 P0#3 — host drops client-injected setActivePlayer", () => {
  it("a forged routing marker never enters the command stream; real commands still route", () => {
    const host = new CitadelSimHost({ worldWidth: 96, worldHeight: 96, enforceTerritory: false });
    const peer0 = host.attach(() => {});
    const peer1 = host.attach(() => {});
    host.handleInbound(peer0, { type: "init", seed: 1, ticksPerDay: 20 });

    // Forged marker from a client → dropped, nothing enqueued.
    host.handleInbound(peer1, { type: "command", command: { type: "setActivePlayer", payload: { id: 0 } } });
    host.step();
    expect(host.simResult!.state.commandLog.length).toBe(0);

    // A legit command from peer1 IS routed — the host stamps a trusted setActivePlayer{1}.
    const s = findGrass(host.simResult!.terrain, 3, 3, 24, 24);
    host.handleInbound(peer1, { type: "command", command: { type: "placeBuilding", payload: { buildingType: "town-hall", x: s.x, y: s.y } } });
    host.step();

    const log = host.simResult!.state.commandLog;
    expect(log.some((e) => e.command.type === "setActivePlayer" && e.command.payload.id === 1)).toBe(true);
    expect(log.some((e) => e.command.type === "placeBuilding")).toBe(true);
    // The forged "route to player 0" marker never made it in.
    expect(log.some((e) => e.command.type === "setActivePlayer" && e.command.payload.id === 0)).toBe(false);
  });
});

describe("Citadel 38 P0#4 — room control is host-only", () => {
  it("ignores pause/speed from a non-host peer, honors the host, and migrates on host leave", () => {
    const host = new CitadelSimHost({ worldWidth: 96, worldHeight: 96, enforceTerritory: false });
    const peer0 = host.attach(() => {}); // first attach → host
    const peer1 = host.attach(() => {}); // non-host
    host.handleInbound(peer0, { type: "init", seed: 1, ticksPerDay: 20 });
    expect(host.hostPlayerId).toBe(0);

    // Non-host control messages are ignored.
    host.handleInbound(peer1, { type: "pause" });
    expect(host.isPaused).toBe(false);
    host.handleInbound(peer1, { type: "speed", multiplier: 4 });
    expect(host.speedMultiplier).toBe(1);

    // Host control messages take effect.
    host.handleInbound(peer0, { type: "pause" });
    expect(host.isPaused).toBe(true);
    host.handleInbound(peer0, { type: "speed", multiplier: 3 });
    expect(host.speedMultiplier).toBe(3);

    // Host leaves → control migrates to the next-remaining peer.
    host.detach(peer0);
    expect(host.hostPlayerId).toBe(1);
    host.handleInbound(peer1, { type: "resume" });
    expect(host.isPaused).toBe(false);
  });
});

describe("Citadel 97/13 — snapshot carries authoritative paused/speed/isHost per peer", () => {
  it("fans out the host-authoritative pacing, greys non-host, and re-broadcasts on control change", () => {
    const p0msgs: WorkerOutbound[] = [];
    const p1msgs: WorkerOutbound[] = [];
    const host = new CitadelSimHost({ worldWidth: 96, worldHeight: 96, enforceTerritory: false });
    const peer0 = host.attach((m) => p0msgs.push(m)); // first attach → host
    const peer1 = host.attach((m) => p1msgs.push(m)); // non-host
    host.handleInbound(peer0, { type: "init", seed: 1, ticksPerDay: 20 });
    host.step();

    // isHost is per-peer: the host sees true, the non-host sees false.
    expect(lastSnapshot(p0msgs)?.isHost).toBe(true);
    expect(lastSnapshot(p1msgs)?.isHost).toBe(false);
    // Defaults before any control change.
    expect(lastSnapshot(p0msgs)?.paused).toBe(false);
    expect(lastSnapshot(p0msgs)?.speed).toBe(1);

    // A host pause re-broadcasts at once (crucial: no tick runs while paused), so BOTH peers
    // learn paused=true from the authoritative snapshot without waiting for a tick.
    host.handleInbound(peer0, { type: "pause" });
    expect(lastSnapshot(p0msgs)?.paused).toBe(true);
    expect(lastSnapshot(p1msgs)?.paused).toBe(true);

    // A host speed change also re-broadcasts the new multiplier to every peer.
    host.handleInbound(peer0, { type: "speed", multiplier: 4 });
    expect(lastSnapshot(p0msgs)?.speed).toBe(4);
    expect(lastSnapshot(p1msgs)?.speed).toBe(4);

    // A non-host pause is dropped AND leaves the authoritative state untouched — the peer's own
    // snapshot never reports the change it tried to make (no lying optimistic toggle).
    host.handleInbound(peer0, { type: "resume" });
    host.handleInbound(peer1, { type: "pause" });
    expect(host.isPaused).toBe(false);
    expect(lastSnapshot(p1msgs)?.paused).toBe(false);

    // Host migration re-stamps isHost immediately (even paused): peer1 becomes host.
    host.detach(peer0);
    expect(lastSnapshot(p1msgs)?.isHost).toBe(true);
  });
});
