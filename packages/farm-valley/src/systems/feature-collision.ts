import type { SimContext, System, World, PathfinderGrid } from "@engine/core";
import type { GameEntity } from "./../components";

/**
 * FeatureCollisionSystem — keeps the pathfinder's walkable grid in sync with the
 * dynamic tree/stone features so neither the AI farmers (who path over this
 * grid) nor anything else routes *through* a tree or stone. Trees/stones only
 * spawn on otherwise-walkable region tiles and are removed when chopped/mined,
 * so a feature tile's base walkability is always "walkable" — we just OR a
 * blocked overlay onto the base each time the feature set changes.
 *
 * Runs after TileFeatureSystem (daily spawns) and HarvestSystem, and before
 * DeliberateSystem/TravelSystem, so a path computed this tick already avoids
 * the current features. Deterministic: depends only on the live feature
 * entities, never on wall-clock or RNG.
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
    // Clear last tick's feature blocks back to their base walkability.
    for (const i of this.blocked) cells[i] = this.base[i]!;
    this.blocked.length = 0;

    // Re-block every current tree/stone tile.
    for (const e of this.world.query("tileFeature")) {
      const { tileX, tileY } = e.tileFeature;
      if (tileX < 0 || tileY < 0 || tileX >= width || tileY >= height) continue;
      const i = tileY * width + tileX;
      cells[i] = 1;
      this.blocked.push(i);
    }
  }
}
