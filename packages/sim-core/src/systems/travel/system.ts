/**
 * TravelSystem — moves farmers tile-by-tile along WASM-pathfinder routes between regions.
 * Split from travel.ts.
 *
 * Per tick:
 *  - If the front intent in a farmer's queue is `{ kind: 'travel', data: { targetRegionId } }`
 *    and the farmer has no active `path`, compute one with the pathfinder.
 *    Empty result → drop intent + console.warn.
 *  - If a path is set, count down `ticksUntilStep`. When it hits 0, advance to
 *    the next waypoint and reset the counter to STEP_TICKS.
 *  - On arrival (nextIndex >= waypoints.length), update currentRegion via
 *    regionAt, clear the path, pop the travel intent, and emit ONT_TRAVEL.ARRIVED.
 *  - Same-region (path of length ≤ 1) resolves as instant arrival.
 */

import type {
  SimContext,
  System,
  World,
  MessageBus,
  Pathfinder,
  PathfinderGrid,
} from "@engine/core";
import type { GameEntity } from "../../components";
import { getRegion, regionAt, type RegionId } from "../../world/regions";
import { ONT_TRAVEL, type TravelArrivedBody } from "../../protocols/travel";
import { PERFORMATIVE } from "../../protocols/performatives";
import { STEP_TICKS, smoothPath } from "./path";

export class TravelSystem implements System {
  readonly name = "TravelSystem";

  constructor(
    private readonly world: World<GameEntity>,
    private readonly pathfinder: Pathfinder,
    private readonly grid: PathfinderGrid,
    private readonly bus: MessageBus,
    /** Boat grid (water lanes dock→reef); used when farmer.aboard. Optional; absent = no boat movement. */
    private readonly boatGrid?: PathfinderGrid,
  ) {}

  private gridFor(entity: GameEntity): PathfinderGrid {
    if (entity.farmer?.aboard && this.boatGrid) return this.boatGrid;
    return this.grid;
  }

  run(ctx: SimContext): void {
    for (const entity of this.world.query("farmer", "transform", "intentions")) {
      this.stepFarmer(entity, ctx.tick);
    }
  }

  private stepFarmer(entity: GameEntity, tick: number): void {
    const farmer = entity.farmer;
    const transform = entity.transform;
    const intentions = entity.intentions;
    if (!farmer || !transform || !intentions) return;

    const front = intentions.queue[0];
    const hasTravelIntent = front !== undefined && front.kind === "travel";
    const grid = this.gridFor(entity);

    // Phase 1: start a new path if needed.
    if (hasTravelIntent && !farmer.path) {
      const targetRegionId = front.data.targetRegionId as RegionId | undefined;
      // Tile target (targetTile) wins over regionId when both are present; used for adjacency-gated acts.
      const targetTile = front.data.targetTile as
        | { x: number; y: number }
        | undefined;

      let dest: { x: number; y: number };
      if (targetTile) {
        const reachable = this.resolveReachableTile(grid, targetTile.x, targetTile.y);
        if (!reachable) {
          console.warn(
            `[travel] farmer ${entity.id} target tile (${targetTile.x},${targetTile.y}) has no reachable adjacent walkable tile; dropping`,
          );
          intentions.queue.shift();
          return;
        }
        dest = reachable;
      } else if (targetRegionId) {
        dest = getRegion(targetRegionId).center;
      } else {
        console.warn(
          `[travel] farmer ${entity.id} has travel intent without targetRegionId or targetTile; dropping`,
        );
        intentions.queue.shift();
        return;
      }
      const targetCenter = dest;
      const start = { x: transform.x, y: transform.y };
      const destLabel = targetTile
        ? `tile (${targetTile.x},${targetTile.y})${front.data.tavernGather ? " [tavern-gather]" : ""}`
        : `region '${targetRegionId}'`;
      // Defensive catch: post-fix this should never fire. If it does, it is a new bug
      // class (not the allocator leak fixed in brief 10) — escalate loudly so it is
      // not silently swallowed. Drop the intent to avoid a stuck farmer, but log as error.
      let path: { x: number; y: number }[];
      try {
        path = this.pathfinder.findPath(grid, start, targetCenter);
      } catch (err) {
        console.error(
          `[travel] pathfinder fault (unexpected — allocator bug was fixed in brief 10) ` +
          `from (${start.x},${start.y}) to ${destLabel} for farmer ${entity.id}; dropping intent`,
          err,
        );
        intentions.queue.shift();
        return;
      }

      if (path.length === 0) {
        console.warn(
          `[travel] no path from (${start.x},${start.y}) to ${destLabel} for farmer ${entity.id}; dropping intent`,
        );
        intentions.queue.shift();
        return;
      }

      if (path.length <= 1) {
        this.arrive(entity, tick);
        return;
      }

      const smoothed = smoothPath(path, (x, y) => this.isWalkable(grid, x, y));

      farmer.path = {
        waypoints: smoothed,
        nextIndex: 1,
        ticksUntilStep: STEP_TICKS,
      };
      return;
    }

    if (farmer.path) {
      const mutablePath = farmer.path as {
        waypoints: ReadonlyArray<{ x: number; y: number }>;
        nextIndex: number;
        ticksUntilStep: number;
      };
      mutablePath.ticksUntilStep -= 1;

      // Sub-tile render glide: farmer.renderPos interpolates toward the next waypoint each tick.
      // RENDER-ONLY — never mutates transform. Sim, AP, regions, determinism unchanged.
      const from = mutablePath.waypoints[mutablePath.nextIndex - 1];
      const next = mutablePath.waypoints[mutablePath.nextIndex];
      if (from && next) {
        const frac = (STEP_TICKS - mutablePath.ticksUntilStep) / STEP_TICKS;
        farmer.renderPos = {
          x: from.x + (next.x - from.x) * frac,
          y: from.y + (next.y - from.y) * frac,
        };
      }

      if (mutablePath.ticksUntilStep <= 0) {
        if (next) {
          transform.x = next.x;
          transform.y = next.y;
          farmer.renderPos = { x: next.x, y: next.y };
        }
        mutablePath.nextIndex += 1;
        mutablePath.ticksUntilStep = STEP_TICKS;

        if (mutablePath.nextIndex >= mutablePath.waypoints.length) {
          this.arrive(entity, tick);
        }
      }
    }
  }

  private isWalkable(grid: PathfinderGrid, x: number, y: number): boolean {
    const { width, height, cells } = grid;
    if (x < 0 || y < 0 || x >= width || y >= height) return false;
    return cells[y * width + x] === 0;
  }

  /** Walkable tile adjacent to (tileX, tileY); fixed scan order (N/E/S/W then diagonals) for determinism. */
  private resolveReachableTile(
    grid: PathfinderGrid,
    tileX: number,
    tileY: number,
  ): { x: number; y: number } | undefined {
    if (this.isWalkable(grid, tileX, tileY)) return { x: tileX, y: tileY };
    const offsets = [
      [0, -1], [1, 0], [0, 1], [-1, 0],
      [1, -1], [1, 1], [-1, 1], [-1, -1],
    ] as const;
    for (const [dx, dy] of offsets) {
      const nx = tileX + dx;
      const ny = tileY + dy;
      if (this.isWalkable(grid, nx, ny)) return { x: nx, y: ny };
    }
    return undefined;
  }

  private arrive(entity: GameEntity, tick: number): void {
    const farmer = entity.farmer;
    const transform = entity.transform;
    const intentions = entity.intentions;
    if (!farmer || !transform || !intentions || entity.id === undefined) return;

    const arrivedRegion = regionAt(transform.x, transform.y);
    if (arrivedRegion) {
      farmer.currentRegion = arrivedRegion;
    }
    farmer.path = undefined;
    farmer.renderPos = undefined;
    if (intentions.queue[0]?.kind === "travel") {
      intentions.queue.shift();
    }

    if (arrivedRegion) {
      const body: TravelArrivedBody = {
        farmerId: entity.id,
        regionId: arrivedRegion,
      };
      this.bus.send(
        {
          performative: PERFORMATIVE.INFORM,
          ontology: ONT_TRAVEL.ARRIVED,
          sender: entity.id,
          recipient: "broadcast",
          body: body as unknown as Record<string, unknown>,
        },
        tick,
      );
    }
  }
}
