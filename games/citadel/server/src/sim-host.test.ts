/**
 * Citadel 35 — multi-writer host. Verifies the transport-agnostic core without
 * real sockets: each peer's commands route to its OWN player, snapshots fan out
 * per-peer, and a late joiner gets current state + a player slot.
 */
import { describe, it, expect } from "vitest";
import { CitadelSimHost } from "./sim-host";
import type { WorkerOutbound } from "@citadel/sim-core/snapshot";
import type { TerrainGrid } from "@citadel/sim-core/world/terrain";
import { TerrainType } from "@citadel/sim-core/world/terrain";

/** An all-grass w×h footprint near (sx, sy). */
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

describe("Citadel 35 — CitadelSimHost (multi-writer)", () => {
  it("routes each peer's commands to its own player and fans out per-peer snapshots", () => {
    const host = new CitadelSimHost({ worldWidth: 96, worldHeight: 96, enforceTerritory: false });
    const p0msgs: WorkerOutbound[] = [];
    const p1msgs: WorkerOutbound[] = [];
    const peer0 = host.attach((m) => p0msgs.push(m));
    const peer1 = host.attach((m) => p1msgs.push(m));
    expect(host.peerCount).toBe(2);
    expect(peer0.playerId).toBe(0);
    expect(peer1.playerId).toBe(1);

    host.handleInbound(peer0, { type: "init", seed: 1, ticksPerDay: 20 });
    const terrain = host.simResult!.terrain;
    const s0 = findGrass(terrain, 3, 3, 24, 24);
    const s1 = findGrass(terrain, 3, 3, 70, 70);

    host.handleInbound(peer0, { type: "command", command: { type: "placeBuilding", payload: { buildingType: "town-hall", x: s0.x, y: s0.y } } });
    host.handleInbound(peer1, { type: "command", command: { type: "placeBuilding", payload: { buildingType: "town-hall", x: s1.x, y: s1.y } } });
    host.step();

    const halls = [...host.simResult!.world.query("building")].filter((e) => e.building.type === "town-hall");
    expect(halls.length).toBe(2);
    const owners = new Map(halls.map((h) => [h.building.ownerId, h.building]));
    expect(owners.get(0)).toMatchObject({ x: s0.x, y: s0.y }); // peer 0 → player 0
    expect(owners.get(1)).toMatchObject({ x: s1.x, y: s1.y }); // peer 1 → player 1

    expect(p0msgs.some((m) => m.type === "ready")).toBe(true);
    expect(p1msgs.some((m) => m.type === "ready")).toBe(true);
    expect(p0msgs.some((m) => m.type === "snapshot")).toBe(true);
    expect(p1msgs.some((m) => m.type === "snapshot")).toBe(true);
  });

  it("a late joiner gets a snapshot of the running room and its own player slot", () => {
    const host = new CitadelSimHost({ worldWidth: 96, worldHeight: 96, enforceTerritory: false });
    const peer0 = host.attach(() => {});
    host.handleInbound(peer0, { type: "init", seed: 2, ticksPerDay: 20 });
    host.step();

    const lateMsgs: WorkerOutbound[] = [];
    const peer1 = host.attach((m) => lateMsgs.push(m));
    expect(peer1.playerId).toBe(1);
    expect(host.simResult!.state.players.find((p) => p.id === 1)).toBeDefined();
    expect(lateMsgs.some((m) => m.type === "snapshot")).toBe(true);
    expect(lateMsgs.some((m) => m.type === "ready")).toBe(true);
  });
});
