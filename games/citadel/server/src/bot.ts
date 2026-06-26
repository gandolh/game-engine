/**
 * CitadelBot (Citadel 37) — a seeded NPC that joins a room as a peer and plays
 * through the SAME command surface as a human (no privileged path). Its commands
 * flow into the authoritative log, so a bot-filled match stays deterministic +
 * replayable from its seed. Decisions come from a named `Rng.fork` (never
 * Math.random/Date.now).
 *
 * Thin driver (not full BDI): place a town-hall anchor in its quadrant, then
 * build outward (houses/farms) on a seeded cadence. Enough to populate a lobby
 * and exercise the multi-writer netcode deterministically.
 */
import { createRng } from "@engine/core";
import type { Rng } from "@engine/core";
import { TerrainType } from "@citadel/sim-core/world/terrain";
import type { TerrainGrid } from "@citadel/sim-core/world/terrain";
import type { CitadelCommand } from "@citadel/sim-core/snapshot";
import type { CitadelSimHost, Peer } from "./sim-host";

const BUILD_TYPES = ["house", "farm", "house", "woodcutter"] as const;

export class CitadelBot {
  private readonly rng: Rng;
  private anchor: { x: number; y: number } | null = null;
  private placedAnchor = false;
  private updates = 0;

  constructor(
    private readonly host: CitadelSimHost,
    private readonly peer: Peer,
    seed: number,
  ) {
    this.rng = createRng(seed).fork(`citadel-bot-${peer.playerId}`);
  }

  /** Called once per host tick (before the sim advances) — may submit commands. */
  update(): void {
    const sim = this.host.simResult;
    if (sim === null) return;
    this.updates += 1;

    if (!this.placedAnchor) {
      // citadel-38 P3#18: spread anchors over a grid of cells keyed by playerId so
      // bots 4/5+ don't collide on the same 4 quadrants. A √-sized grid keeps cells
      // roughly square; cell centres stay inside the world margins.
      const { width, height } = sim.state;
      const id = this.peer.playerId;
      const cols = Math.max(2, Math.ceil(Math.sqrt(id + 1)));
      const cx = id % cols;
      const cy = Math.floor(id / cols);
      const rows = Math.max(2, cy + 1);
      const qx = Math.floor((width * (cx + 0.5)) / cols);
      const qy = Math.floor((height * (cy + 0.5)) / rows);
      const spot = this.findGrass(sim.terrain, 3, 3, qx, qy);
      this.anchor = { x: spot.x, y: spot.y };
      this.submit({ type: "placeBuilding", payload: { buildingType: "town-hall", x: spot.x, y: spot.y } });
      this.placedAnchor = true;
      return;
    }

    // Build outward on a seeded cadence (a few tiles from the anchor).
    if (this.anchor !== null && this.rng.nextFloat() < 0.25) {
      const t = BUILD_TYPES[this.rng.int(0, BUILD_TYPES.length)]!;
      const dx = this.rng.int(-4, 5);
      const dy = this.rng.int(-4, 5);
      const x = this.anchor.x + dx;
      const y = this.anchor.y + dy;
      this.submit({ type: "placeBuilding", payload: { buildingType: t, x, y } });
    }
  }

  private submit(command: CitadelCommand): void {
    this.host.handleInbound(this.peer, { type: "command", command });
  }

  private findGrass(t: TerrainGrid, w: number, h: number, sx: number, sy: number): { x: number; y: number } {
    for (let r = 0; r < 40; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const x = sx + dx;
          const y = sy + dy;
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
}
