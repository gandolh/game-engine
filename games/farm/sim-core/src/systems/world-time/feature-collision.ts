import type { SimContext, System, World, PathfinderGrid } from "@engine/core";
import type { GameEntity } from "../../components";
import { FeatureCells } from "../../world/feature-cells";

export class FeatureCollisionSystem implements System {
  private readonly world: World<GameEntity>;
  private readonly grid: PathfinderGrid;

  readonly name = "FeatureCollisionSystem";

  private readonly base: Uint8Array;

  private blocked: number[] = [];

  private readonly cells: FeatureCells;
  private stampedRevision = -1;

  constructor(world: World<GameEntity>, grid: PathfinderGrid, cells: FeatureCells = new FeatureCells(world)) {
    this.world = world;
    this.grid = grid;
    this.cells = cells;

    this.base = Uint8Array.from(grid.cells);
  }

  run(_ctx: SimContext): void {
    // Features and solids change only when one is chopped, mined, built or regrown (never moved in
    // place), so the stamp is redone only when the index was rebuilt since the last one.
    const revision = this.cells.revision;
    if (revision === this.stampedRevision) return;
    this.stampedRevision = revision;

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
