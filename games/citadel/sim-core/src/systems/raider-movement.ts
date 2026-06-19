/**
 * RaiderMovementSystem — advances active raiders along their BFS path.
 *
 * Stage: "siege-move" (after spawn). Raiders are slower than villagers: one
 * tile every MOVE_INTERVAL ticks. When a raider exhausts its path it tries to
 * recompute a route toward the current target (the keep may have been placed,
 * or walls demolished). If still no route exists the raider is walled off and
 * waits in place.
 */
import type { System, SimContext } from "@engine/core";
import type { SimState } from "../sim-state";
import type { TerrainGrid } from "../world/terrain";
import { computeRaiderPath, findRaiderTarget } from "./raid-spawn";

const MOVE_INTERVAL = 3; // one tile every 3 ticks

export class RaiderMovementSystem implements System {
  readonly name = "RaiderMovementSystem";

  constructor(private readonly state: SimState, private readonly terrain: TerrainGrid) {}

  run(ctx: SimContext): void {
    if (ctx.tick % MOVE_INTERVAL !== 0) return;

    // Citadel 28: per-player raiders, marching on their target player's keep
    // through that player's walls. Stable player-id order.
    for (const p of this.state.players) {
      for (const raider of p.raiders) {
        if (raider.resolved) continue;

        if (raider.pathStep < raider.path.length) {
          const next = raider.path[raider.pathStep]!;
          raider.tileX = next.x;
          raider.tileY = next.y;
          raider.x = next.x;
          raider.y = next.y;
          raider.pathStep++;
        } else {
          // Reached end of path (or never had one) — recompute toward target.
          const target = findRaiderTarget(this.state, p);
          const newPath = computeRaiderPath(
            raider.tileX,
            raider.tileY,
            target.x,
            target.y,
            this.state,
            p,
            this.terrain,
          );
          if (newPath !== null && newPath.length > 0) {
            raider.path = newPath;
            raider.pathStep = 0;
          }
          // If still no path, the raider is fully walled off — wait in place.
        }
      }
    }
  }
}
