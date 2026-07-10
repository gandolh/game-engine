/**
 * Citadel 29 — configurable world size + town-hall anchor.
 *
 * Drives bootstrapSim() directly (no Worker). Verifies the world dimensions are
 * read from config (default 96×96; a configured 256×256 sizes every grid-backed
 * allocation + the pathfinder + snapshot), and the town-hall's keep-anchor split:
 * a placeable, non-tier-locked CIVIC building in solo (no keep anchor), the MP
 * match anchor (sets keepPosition) when the sim is bootstrapped `multiplayer`.
 */
import { describe, it, expect } from "vitest";
import { bootstrapSim } from "../sim-bootstrap";
import { localPlayer, makePlayerState } from "../sim-state";
import { WORLD_WIDTH, WORLD_HEIGHT, TerrainType } from "../world/terrain";
import type { TerrainGrid } from "../world/terrain";
import { bfsPath } from "../world/pathfinder";

const TICKS_PER_DAY = 20;

/** Find an all-grass w×h footprint near (sx, sy), scanning outward. */
function findGrass(terrain: TerrainGrid, w: number, h: number, sx: number, sy: number): { x: number; y: number } {
  for (let r = 0; r < 60; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const x = sx + dx;
        const y = sy + dy;
        if (x < 0 || y < 0 || x + w > terrain.width || y + h > terrain.height) continue;
        let ok = true;
        for (let yy = 0; yy < h && ok; yy++)
          for (let xx = 0; xx < w; xx++) {
            if (terrain.cells[(y + yy) * terrain.width + (x + xx)] !== TerrainType.Grass) { ok = false; break; }
          }
        if (ok) return { x, y };
      }
    }
  }
  return { x: sx, y: sy };
}

describe("Citadel 29 — configurable world + town-hall", () => {
  it("defaults to the engine 96×96 world", () => {
    const sim = bootstrapSim({ seed: 1, ticksPerDay: TICKS_PER_DAY, maxDays: 5 });
    expect(sim.state.width).toBe(WORLD_WIDTH);
    expect(sim.state.height).toBe(WORLD_HEIGHT);
    expect(sim.terrain.width).toBe(96);
    expect(sim.terrain.height).toBe(96);
    expect(sim.terrain.cells.length).toBe(96 * 96);
    expect(sim.roadGrid.length).toBe(96 * 96);
  });

  it("sizes every grid-backed allocation + the pathfinder to a configured 256×256 world", () => {
    const W = 256, H = 256;
    const sim = bootstrapSim({ seed: 1, ticksPerDay: TICKS_PER_DAY, maxDays: 5, worldWidth: W, worldHeight: H });
    expect(sim.state.width).toBe(W);
    expect(sim.state.height).toBe(H);
    expect(sim.terrain.width).toBe(W);
    expect(sim.terrain.height).toBe(H);
    expect(sim.terrain.cells.length).toBe(W * H);
    expect(sim.roadGrid.length).toBe(W * H);
    expect(sim.walkable.length).toBe(W * H);

    // The pathfinder operates over the configured 256² extents (proven on a
    // connected grass strip — a corner-to-corner path can be legitimately blocked
    // by the river that bisects the map, which is not what this asserts).
    const passable = (x: number, y: number): boolean =>
      x >= 0 && y >= 0 && x < W && y < H &&
      sim.terrain.cells[y * W + x] !== TerrainType.Water &&
      sim.terrain.cells[y * W + x] !== TerrainType.Rough;
    const strip = findGrass(sim.terrain, 4, 1, Math.floor(W / 2), Math.floor(H / 2));
    const path = bfsPath(strip.x, strip.y, strip.x + 3, strip.y, passable, W, H);
    expect(path).not.toBeNull();
    expect(path!.length).toBeGreaterThan(0);

    // The sim advances several days on the large world without error.
    for (let t = 0; t < TICKS_PER_DAY * 3; t++) sim.scheduler.tick({ tick: t });
    expect(sim.getSnapshot(TICKS_PER_DAY * 3)).toBeDefined();
  });

  it("town-hall is a non-tier-locked CIVIC building in solo — placeable, NO keep anchor", () => {
    const W = 256, H = 256;
    const sim = bootstrapSim({ seed: 1, ticksPerDay: TICKS_PER_DAY, maxDays: 5, worldWidth: W, worldHeight: H });
    const lp = localPlayer(sim.state);
    // Solo: one player, Hamlet tier, no anchor yet.
    expect(sim.state.players.length).toBe(1);
    expect(lp.tier).toBe("Hamlet");
    expect(lp.keepPosition).toBeNull();

    // Place the town-hall on a clear tile (a Town-locked keep would be rejected
    // here — the town-hall must NOT be tier-locked, so a player can place it early).
    const spot = findGrass(sim.terrain, 3, 3, Math.floor(W / 2), Math.floor(H / 2));
    sim.commands.enqueue({ type: "placeBuilding", payload: { buildingType: "town-hall", x: spot.x, y: spot.y } });
    sim.scheduler.tick({ tick: 0 });

    const halls = [...sim.world.query("building")].filter((e) => e.building.type === "town-hall");
    expect(halls.length).toBe(1);
    expect(halls[0]!.building.ownerId).toBe(0);
    // Cozy-pivot: in SOLO the town-hall is civic-only — it does NOT become the keep/raid
    // anchor, so no keepPosition is set and the siege clock never starts (raid-spawn gates
    // on keepPosition). The solo siege anchor stays the `keep` building.
    expect(lp.keepPosition).toBeNull();
  });

  it("town-hall sets the owner's keep anchor in MULTIPLAYER (the match anchor)", () => {
    const W = 256, H = 256;
    const sim = bootstrapSim({ seed: 1, ticksPerDay: TICKS_PER_DAY, maxDays: 5, worldWidth: W, worldHeight: H, multiplayer: true });
    sim.state.players.push(makePlayerState(1));
    const lp = localPlayer(sim.state);
    expect(lp.keepPosition).toBeNull();

    const spot = findGrass(sim.terrain, 3, 3, Math.floor(W / 2), Math.floor(H / 2));
    sim.commands.enqueue({ type: "placeBuilding", payload: { buildingType: "town-hall", x: spot.x, y: spot.y } });
    sim.scheduler.tick({ tick: 0 });

    // MP: the town-hall IS each player's match anchor (raiders target it; sacking it ends
    // the player's run), so keepPosition is set to the 3×3 footprint centre.
    expect(lp.keepPosition).not.toBeNull();
    expect(lp.keepPosition!.x).toBe(spot.x + 1);
    expect(lp.keepPosition!.y).toBe(spot.y + 1);
  });

  it("regression: the peer who FOUNDS an MP room anchors its hall while still alone", () => {
    // Brief 108, found live: a real room is founded by one peer and grows. The anchor used to
    // be gated on `players.length > 1`, but `keepPosition` is assigned once, at placement — so
    // the founder's hall never anchored, and raid-spawn (which gates entirely on keepPosition)
    // never scheduled a raid against them. Meanwhile the snapshot's `keepPresent` re-evaluated
    // the same predicate every tick, so it flipped to true the moment a second peer joined:
    // the founder was told "Keep: standing" while being permanently raid-immune.
    const W = 256, H = 256;
    const sim = bootstrapSim({ seed: 1, ticksPerDay: TICKS_PER_DAY, maxDays: 5, worldWidth: W, worldHeight: H, multiplayer: true });
    const lp = localPlayer(sim.state);
    expect(sim.state.players.length).toBe(1); // the founding peer, alone

    const spot = findGrass(sim.terrain, 3, 3, Math.floor(W / 2), Math.floor(H / 2));
    sim.commands.enqueue({ type: "placeBuilding", payload: { buildingType: "town-hall", x: spot.x, y: spot.y } });
    sim.scheduler.tick({ tick: 0 });

    expect(lp.keepPosition).not.toBeNull();
    expect(lp.keepPosition!.x).toBe(spot.x + 1);

    // The anchor and the HUD's readout must agree, before AND after a second peer arrives —
    // that disagreement was the visible symptom.
    expect(sim.getSnapshot(1).keepPresent).toBe(true);
    sim.state.players.push(makePlayerState(1));
    expect(sim.getSnapshot(1).keepPresent).toBe(true);
    expect(lp.keepPosition).not.toBeNull();
  });
});
