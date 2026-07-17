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
import type { SimState, PlayerState } from "../sim-state";
import { pushEvent } from "../sim-state";
import type { TerrainGrid } from "../world/terrain";
import { SERVICE_RADII } from "../entities/building";
import { computeRaiderPath, findRaiderTarget } from "./raid-spawn";
import { scaleTicks } from "../pacing";

/**
 * Raider march cadence: one tile every MOVE_INTERVAL ticks, authored at
 * BASELINE_TICKS_PER_DAY. Re-denominated per {@link scaleTicks} at the sim's
 * ticksPerDay so raiders cover the SAME tiles-per-DAY at any day length — the
 * spawn→impact approach still takes ~days (the reaction window the scout lead +
 * garrison sorties are balanced against), instead of collapsing to an instant
 * rush when the day is longer. (Unlike villagers, whose 1-tile/tick glide is left
 * unscaled, a raider's days-to-cross is a balance/telegraph property.)
 */
const MOVE_INTERVAL = 3;
/** Fraction of strength a garrison sortie shaves off an intercepted raider. */
const INTERCEPT_SHAVE = 0.25;

export class RaiderMovementSystem implements System {
  readonly name = "RaiderMovementSystem";

  constructor(private readonly state: SimState, private readonly terrain: TerrainGrid) {}

  run(ctx: SimContext): void {
    if (ctx.tick % scaleTicks(MOVE_INTERVAL, this.state.ticksPerDay) !== 0) return;

    // Citadel 28: per-player raiders, marching on their target player's keep
    // through that player's walls. Stable player-id order.
    for (const p of this.state.players) {
      // Pre-collect this player's garrison sortie points (centre + radius).
      const garrisons = this.garrisonsOf(p);
      for (const raider of p.raiders) {
        if (raider.resolved) continue;

        // Counterplay: a garrison whose coverage includes the raider's tile sends
        // interceptors that shave raider strength — once per raider (a sortie).
        // Siting a garrison on the likely approach is now a real decision.
        // Brief 113: a `leaving` raider is departing, not besieging — no sortie.
        if (garrisons.length > 0 && raider.intercepted !== true && raider.leaving !== true) {
          for (const g of garrisons) {
            const d = Math.abs(raider.tileX - g.cx) + Math.abs(raider.tileY - g.cy);
            if (d <= g.radius) {
              const shave = Math.max(1, Math.round(raider.strength * INTERCEPT_SHAVE));
              raider.strength = Math.max(1, raider.strength - shave);
              raider.intercepted = true;
              pushEvent(
                this.state,
                `Day ${this.state.day + 1}: Garrison interceptors harried Raid ${raider.id} (strength −${shave}).`,
              );
              break;
            }
          }
        }

        if (raider.pathStep < raider.path.length) {
          const next = raider.path[raider.pathStep]!;
          raider.tileX = next.x;
          raider.tileY = next.y;
          raider.x = next.x;
          raider.y = next.y;
          raider.pathStep++;
        } else if (raider.leaving === true) {
          // Brief 113: a departing raider that has exhausted its reversed
          // path has walked itself back off the map — despawn it (never
          // re-route a `leaving` raider toward the target). SiegeResolutionSystem's
          // existing `if (raider.resolved) toRemove` sweep removes it next tick.
          raider.resolved = true;
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

  /** Player `p`'s garrison sortie points (footprint centre + service radius). */
  private garrisonsOf(p: PlayerState): Array<{ cx: number; cy: number; radius: number }> {
    const out: Array<{ cx: number; cy: number; radius: number }> = [];
    for (const entity of this.state.buildingWorld.query("building")) {
      if (entity.building.ownerId !== p.id) continue;
      if (entity.building.type !== "garrison") continue;
      const b = entity.building;
      out.push({
        cx: b.x + Math.floor(b.w / 2),
        cy: b.y + Math.floor(b.h / 2),
        radius: SERVICE_RADII["garrison"] ?? 8,
      });
    }
    return out;
  }
}
