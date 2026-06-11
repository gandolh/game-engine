import type { SimContext, System, World, PathfinderGrid } from "@engine/core";
import type { GameEntity } from "./../components";

/** Keeps the pathfinder grid in sync with dynamic tree/stone features and static solids.
 *  Runs after TileFeatureSystem/HarvestSystem and before DeliberateSystem/TravelSystem.
 */
export class FeatureCollisionSystem implements System {
  readonly name = "FeatureCollisionSystem";

  /** Immutable base walkability (regions + roads), captured at construction. */
  private readonly base: Uint8Array;
  /** Tile indices currently blocked by a feature, so we can clear them next tick. */
  private blocked: number[] = [];

  constructor(
    private readonly world: World<GameEntity>,
    private readonly grid: PathfinderGrid,
  ) {
    this.base = Uint8Array.from(grid.cells);
  }

  run(_ctx: SimContext): void {
    const { cells, width, height } = this.grid;
    for (const i of this.blocked) cells[i] = this.base[i]!;
    this.blocked.length = 0;

    for (const e of this.world.query("tileFeature")) {
      const { tileX, tileY } = e.tileFeature;
      if (tileX < 0 || tileY < 0 || tileX >= width || tileY >= height) continue;
      const i = tileY * width + tileX;
      cells[i] = 1;
      this.blocked.push(i);
    }

    for (const e of this.world.query("solid")) {
      const { tileX, tileY } = e.solid;
      if (tileX < 0 || tileY < 0 || tileX >= width || tileY >= height) continue;
      const i = tileY * width + tileX;
      cells[i] = 1;
      this.blocked.push(i);
    }
  }
}
