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

      // Smooth the 4-connected route into a diagonal-cutting dense path so the
      // farmer walks corners instead of staircasing. Still one tile per step,
      // so STEP_TICKS pacing and determinism are unchanged.
      const smoothed = smoothPath(path, (x, y) => this.isWalkable(x, y));

      farmer.path = {
        waypoints: smoothed,
        // Path includes the start tile as [0]; the next step is [1].
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

      // Sub-tile render glide (RENDER-ONLY — never touches the authoritative
      // transform). The logical position still steps one whole tile per
      // STEP_TICKS exactly as before (so the sim, AP, regions, pathing and
      // determinism are byte-for-byte unchanged). But the worker posts one
      // snapshot per tick, so for the 7 in-between ticks the transform is
      // identical and the render interpolation has nothing to lerp — the farmer
      // sits still, then jumps a full tile on the 8th tick (the "teleport
      // between cell centers" chunkiness).
      //
      // To fix that we compute where the farmer *visually* is partway through
      // the current step and stash it on farmer.renderPos. The snapshot builder
      // prefers renderPos over transform for farmer sprites, so each snapshot
      // carries a position that has advanced ~1/STEP_TICKS of a tile, and the
      // main-thread lerp now sees continuous motion every tick.
      const from = mutablePath.waypoints[mutablePath.nextIndex - 1];
      const next = mutablePath.waypoints[mutablePath.nextIndex];
      if (from && next) {
        // progress in [0, 1]: 0 just after the previous commit, 1 at the boundary.
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
          // Land the render glide exactly on the integer waypoint too.
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
    // Drop the render glide so a stopped farmer renders at its true tile (and
    // the snapshot builder falls back to transform until the next path starts).
    farmer.renderPos = undefined;
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
