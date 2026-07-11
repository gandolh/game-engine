/**
 * Citadel 30 — influence-radius territory + build-gating.
 *
 * Unit-level over the pure derived pass (recomputeTerritory / tileClaimedBy /
 * canBuildAt), spawning buildings directly so the assertions don't depend on
 * random terrain. Build-gating being OFF by default is proven by the headless
 * determinism re-proof (solo output byte-identical), not re-asserted here.
 */
import { describe, it, expect } from "vitest";
import { bootstrapSim } from "../sim-bootstrap";
import { localPlayer, makePlayerState } from "../sim-state";
import { recomputeTerritory, canBuildAt, tileClaimedBy } from "./territory";

function boot() {
  return bootstrapSim({ seed: 1, ticksPerDay: 20, worldWidth: 64, worldHeight: 64 });
}

describe("Citadel 30 — territory", () => {
  it("grows as an influence radius around owned buildings", () => {
    const sim = boot();
    const lp = localPlayer(sim.state);
    const W = sim.state.width;
    expect(lp.territory.size).toBe(0);

    sim.world.spawn({ building: { type: "town-hall", x: 30, y: 30, w: 3, h: 3, ownerId: 0 } });
    recomputeTerritory(sim.state, 5);

    const cx = 31, cy = 31; // center of the 3×3 footprint at (30,30)
    expect(lp.territory.size).toBeGreaterThan(0);
    expect(lp.territory.has(cy * W + cx)).toBe(true);        // center
    expect(lp.territory.has((cy + 4) * W + cx)).toBe(true);  // within radius 5
    expect(lp.territory.has((cy + 20) * W + cx)).toBe(false); // far outside
  });

  it("is recomputed (auto-grows) when a second building is added", () => {
    const sim = boot();
    const lp = localPlayer(sim.state);
    sim.world.spawn({ building: { type: "town-hall", x: 10, y: 10, w: 3, h: 3, ownerId: 0 } });
    recomputeTerritory(sim.state, 5);
    const after1 = lp.territory.size;
    sim.world.spawn({ building: { type: "house", x: 30, y: 30, w: 2, h: 2, ownerId: 0 } });
    recomputeTerritory(sim.state, 5);
    expect(lp.territory.size).toBeGreaterThan(after1); // a disjoint claim around the new building
  });

  it("keeps each player's claim distinct (lowest id wins overlap)", () => {
    const sim = boot();
    sim.state.players.push(makePlayerState(1));
    const W = sim.state.width;
    sim.world.spawn({ building: { type: "town-hall", x: 10, y: 10, w: 3, h: 3, ownerId: 0 } });
    sim.world.spawn({ building: { type: "town-hall", x: 40, y: 40, w: 3, h: 3, ownerId: 1 } });
    recomputeTerritory(sim.state, 5);
    expect(tileClaimedBy(sim.state, 11 * W + 11)).toBe(0);
    expect(tileClaimedBy(sim.state, 41 * W + 41)).toBe(1);
    expect(tileClaimedBy(sim.state, 0)).toBe(-1); // unclaimed corner
  });

  it("canBuildAt: anchor anywhere unclaimed; then territory ∪ adjacent; never a rival's", () => {
    const sim = boot();
    const p0 = localPlayer(sim.state);

    // Anchor: empty territory → any in-bounds unclaimed tile is OK.
    expect(canBuildAt(sim.state, p0, 30, 30, 3, 3)).toBe(true);

    sim.world.spawn({ building: { type: "town-hall", x: 30, y: 30, w: 3, h: 3, ownerId: 0 } });
    recomputeTerritory(sim.state, 5);

    expect(canBuildAt(sim.state, p0, 31, 31, 1, 1)).toBe(true);   // inside own territory
    expect(canBuildAt(sim.state, p0, 55, 55, 1, 1)).toBe(false);  // far outside → rejected
    expect(canBuildAt(sim.state, p0, -1, 31, 1, 1)).toBe(false);  // out of bounds

    // A rival claims tiles around (45,45).
    sim.state.players.push(makePlayerState(1));
    sim.world.spawn({ building: { type: "town-hall", x: 44, y: 44, w: 3, h: 3, ownerId: 1 } });
    recomputeTerritory(sim.state, 5);
    expect(canBuildAt(sim.state, p0, 45, 45, 1, 1)).toBe(false);  // a rival's claim → blocked
  });
});
