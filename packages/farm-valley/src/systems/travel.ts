import type {
  SimContext,
  System,
  World,
  MessageBus,
  Pathfinder,
  PathfinderGrid,
} from "@engine/core";
import type { GameEntity } from "../components";
import { getRegion, regionAt, type RegionId } from "../world/regions";
import { ONT_TRAVEL, type TravelArrivedBody } from "../protocols/travel";
import { PERFORMATIVE } from "../protocols/performatives";

/** Ticks spent on each waypoint before stepping. 8 ticks @ 20Hz = 2.5 tiles/sec.
 *  Slower than before — walking is visually clear and takes meaningful time. */
export const STEP_TICKS = 8;

/**
 * Moves farmers tile-by-tile along WASM-pathfinder routes between regions.
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
export class TravelSystem implements System {
  readonly name = "TravelSystem";

  constructor(
    private readonly world: World<GameEntity>,
    private readonly pathfinder: Pathfinder,
    private readonly grid: PathfinderGrid,
    private readonly bus: MessageBus,
  ) {}

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

    // Phase 1: start a new path if needed.
    if (hasTravelIntent && !farmer.path) {
      const targetRegionId = front.data.targetRegionId as RegionId | undefined;
      // brief (proximity) — a travel intent may target a specific TILE (to stand
      // adjacent to a plot/tree/stone/fountain before acting) instead of a whole
      // region. Tile targets win when both are present.
      const targetTile = front.data.targetTile as
        | { x: number; y: number }
        | undefined;

      let dest: { x: number; y: number };
      if (targetTile) {
        const reachable = this.resolveReachableTile(targetTile.x, targetTile.y);
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
      // The WASM pathfinder's allocator can intermittently trap
      // (RuntimeError: unreachable) under heavy churn. Isolate it so a single
      // failed path drops this farmer's intent instead of killing the whole
      // tick — the farmer re-deliberates and can re-path next tick.
      let path: { x: number; y: number }[];
      try {
        path = this.pathfinder.findPath(this.grid, start, targetCenter);
      } catch (err) {
        console.warn(
          `[travel] pathfinder fault from (${start.x},${start.y}) to '${targetRegionId}' for farmer ${entity.id}; dropping intent`,
          err,
        );
        intentions.queue.shift();
        return;
      }

      if (path.length === 0) {
        console.warn(
          `[travel] no path from (${start.x},${start.y}) to region '${targetRegionId}' for farmer ${entity.id}; dropping intent`,
        );
        intentions.queue.shift();
        return;
      }

      if (path.length <= 1) {
        // Already at / overlaps the destination tile — resolve instantly.
        this.arrive(entity, tick);
        return;
      }

      farmer.path = {
        waypoints: path,
        // Pathfinder includes the start tile as path[0]; the next step is path[1].
        nextIndex: 1,
        ticksUntilStep: STEP_TICKS,
      };
      return;
    }

    // Phase 2: advance along an active path.
    if (farmer.path) {
      const mutablePath = farmer.path as {
        waypoints: ReadonlyArray<{ x: number; y: number }>;
        nextIndex: number;
        ticksUntilStep: number;
      };
      mutablePath.ticksUntilStep -= 1;
      if (mutablePath.ticksUntilStep <= 0) {
        const next = mutablePath.waypoints[mutablePath.nextIndex];
        if (next) {
          transform.x = next.x;
          transform.y = next.y;
        }
        mutablePath.nextIndex += 1;
        mutablePath.ticksUntilStep = STEP_TICKS;

        if (mutablePath.nextIndex >= mutablePath.waypoints.length) {
          this.arrive(entity, tick);
        }
      }
    }
  }

  /** Walkable iff in-bounds and the grid cell is 0 (matches the pathfinder). */
  private isWalkable(x: number, y: number): boolean {
    const { width, height, cells } = this.grid;
    if (x < 0 || y < 0 || x >= width || y >= height) return false;
    return cells[y * width + x] === 0;
  }

  /**
   * Resolve the tile a farmer should stand on to be "at" a target tile: the
   * target itself if walkable (e.g. a soil plot), otherwise the nearest walkable
   * 8-neighbour. Neighbours are scanned in a FIXED order so the chosen standing
   * tile is deterministic. Returns undefined if neither the tile nor any
   * neighbour is walkable.
   */
  private resolveReachableTile(
    tileX: number,
    tileY: number,
  ): { x: number; y: number } | undefined {
    if (this.isWalkable(tileX, tileY)) return { x: tileX, y: tileY };
    // Fixed scan order (N, E, S, W, then diagonals) for determinism.
    const offsets = [
      [0, -1], [1, 0], [0, 1], [-1, 0],
      [1, -1], [1, 1], [-1, 1], [-1, -1],
    ] as const;
    for (const [dx, dy] of offsets) {
      const nx = tileX + dx;
      const ny = tileY + dy;
      if (this.isWalkable(nx, ny)) return { x: nx, y: ny };
    }
    return undefined;
  }

  /**
   * Final-arrival handling: update currentRegion, clear path, pop the front
   * travel intent, and emit ARRIVED on the bus.
   */
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
    // Pop the travel intent.
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
