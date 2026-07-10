/**
 * Citadel 38 — MP command authority (sim-core handlers).
 *
 * The multi-writer host stamps `setActivePlayer{peerId}` before every command, so
 * a handler's "sender" is `localPlayer(state)`. These tests prove the destructive
 * handlers refuse to act on a building the sender does NOT own:
 *  - P0#1 demolish — a rival can't raze your town-hall (= instant elimination).
 *  - P0#2 upgradeBuilding — a rival can't drain your stockpiles upgrading your building.
 *  - #13 keepPresent — the town-hall (isKeep) counts as a keep in the snapshot.
 *
 * Solo is single-owner, so every guard is always-true there → byte-identical.
 */
import { describe, it, expect } from "vitest";
import { bootstrapSim } from "../sim-bootstrap";
import { makePlayerState } from "../sim-state";
import type { CitadelSimResult } from "../sim-bootstrap";
import type { TerrainGrid } from "../world/terrain";
import { TerrainType } from "../world/terrain";

const TPD = 20;

/** Find an all-grass w×h footprint near (sx, sy) (placement needs buildable land). */
function findGrass(t: TerrainGrid, w: number, h: number, sx: number, sy: number): { x: number; y: number } {
  for (let r = 0; r < 50; r++) {
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
  throw new Error("no grass footprint found");
}

/** Route the next command to player `id` (as the host's marker does), then run it. */
function asPlayer(sim: CitadelSimResult, id: number, cmd: Parameters<typeof sim.commands.enqueue>[0], tick: number): void {
  sim.commands.enqueue({ type: "setActivePlayer", payload: { id } });
  sim.commands.enqueue(cmd);
  sim.scheduler.tick({ tick });
}

function boot2(): CitadelSimResult {
  const sim = bootstrapSim({ seed: 1, ticksPerDay: TPD, maxDays: 5, worldWidth: 64, worldHeight: 64, multiplayer: true });
  sim.state.players.push(makePlayerState(1));
  return sim;
}

function hallAt(sim: CitadelSimResult, x: number, y: number): boolean {
  return [...sim.world.query("building")].some(
    (e) => e.building.type === "town-hall" && e.building.x === x && e.building.y === y,
  );
}

describe("Citadel 38 P0#1 — demolish ownership", () => {
  it("a rival cannot raze your town-hall; the owner can", () => {
    const sim = boot2();
    const s = findGrass(sim.terrain, 3, 3, 20, 20);
    asPlayer(sim, 0, { type: "placeBuilding", payload: { buildingType: "town-hall", x: s.x, y: s.y } }, 0);
    expect(hallAt(sim, s.x, s.y)).toBe(true);

    // Player 1 (not the owner) tries to demolish player 0's hall → blocked.
    asPlayer(sim, 1, { type: "demolish", payload: { x: s.x, y: s.y } }, 1);
    expect(hallAt(sim, s.x, s.y)).toBe(true);

    // The owner (player 0) can demolish their own hall.
    asPlayer(sim, 0, { type: "demolish", payload: { x: s.x, y: s.y } }, 2);
    expect(hallAt(sim, s.x, s.y)).toBe(false);
  });
});

describe("Citadel 38 P0#2 — upgradeBuilding ownership", () => {
  it("a rival cannot upgrade (and drain the cost of) your building; the owner can", () => {
    const sim = boot2();
    const s = findGrass(sim.terrain, 2, 2, 20, 20);
    asPlayer(sim, 0, { type: "placeBuilding", payload: { buildingType: "house", x: s.x, y: s.y } }, 0);

    // Give player 0 the tier + materials to upgrade to L2 (planks:4, stone:4).
    const p0 = sim.state.players[0]!;
    p0.tier = "Village";
    p0.stockpiles.planks = 4;
    p0.stockpiles.stone = 4;

    const houseId = [...sim.world.query("building")].find((e) => e.building.type === "house")!.id!;
    const levelOf = (): number => sim.state.buildingState.get(houseId)!.level;

    // Player 1 (not the owner) tries to upgrade → blocked: no level change, no drain.
    asPlayer(sim, 1, { type: "upgradeBuilding", payload: { x: s.x, y: s.y } }, 1);
    expect(levelOf()).toBe(1);
    expect(p0.stockpiles.planks).toBe(4);
    expect(p0.stockpiles.stone).toBe(4);

    // The owner upgrades → level rises and the cost is charged to the owner.
    asPlayer(sim, 0, { type: "upgradeBuilding", payload: { x: s.x, y: s.y } }, 2);
    expect(levelOf()).toBe(2);
    expect(p0.stockpiles.planks).toBe(0);
    expect(p0.stockpiles.stone).toBe(0);
  });
});

describe("Citadel 38 #13 — keepPresent counts the town-hall (isKeep)", () => {
  it("a placed town-hall makes the owner's snapshot report keepPresent", () => {
    const sim = boot2();
    const s = findGrass(sim.terrain, 3, 3, 20, 20);
    asPlayer(sim, 0, { type: "placeBuilding", payload: { buildingType: "town-hall", x: s.x, y: s.y } }, 0);
    // setActivePlayer{0} above left localId=0, so the snapshot is player 0's view.
    expect(sim.getSnapshot(1).keepPresent).toBe(true);
  });
});
