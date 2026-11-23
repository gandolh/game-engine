import type { World, Query, With } from "@engine/core";
import type { GameEntity } from "../components";

type FeatureEntity = With<GameEntity, "tileFeature">;

// Tiles can be any integer, including off-grid ones the old scans also matched.
const OFFSET = 1 << 15;
const STRIDE = 1 << 16;

function keyOf(tx: number, ty: number): number {
  return (ty + OFFSET) * STRIDE + (tx + OFFSET);
}

/**
 * Per-tile index of the tile features (rocks, trees, bushes) and `solid` footprints.
 *
 * It keeps, for each tile, the FIRST `tileFeature` entity in query order (the entity, so its `kind` is
 * read live) and whether a `solid` stands there. It rebuilds lazily, at read time, when the `tileFeature`
 * or `solid` query's `version` moved since the last build, so a feature added or removed earlier in the
 * same tick by another system is always seen. Features never move in place after setup (nothing writes
 * `tileFeature.tileX/Y` or `solid.tileX/Y`), so membership is the only thing that can change a tile.
 */
export class FeatureCells {
  private readonly features: Query<GameEntity, "tileFeature">;
  private readonly solids: Query<GameEntity, "solid">;
  private featureVersion = -1;
  private solidVersion = -1;
  private readonly firstFeature = new Map<number, FeatureEntity>();
  private readonly solidTiles = new Set<number>();
  private rebuilds = 0;

  constructor(world: World<GameEntity>) {
    this.features = world.query("tileFeature");
    this.solids = world.query("solid");
  }

  /** How many times the index has been rebuilt. A reader that cached something from the index compares this. */
  get revision(): number {
    this.refresh();
    return this.rebuilds;
  }

  /** The first tile feature on the tile in query order, or undefined. */
  featureAt(tx: number, ty: number): FeatureEntity | undefined {
    this.refresh();
    return this.firstFeature.get(keyOf(tx, ty));
  }

  /** True if any tile feature or solid stands on the tile. */
  blockedAt(tx: number, ty: number): boolean {
    this.refresh();
    const k = keyOf(tx, ty);
    return this.firstFeature.has(k) || this.solidTiles.has(k);
  }

  private refresh(): void {
    if (this.features.version === this.featureVersion && this.solids.version === this.solidVersion) return;
    this.featureVersion = this.features.version;
    this.solidVersion = this.solids.version;
    this.rebuilds++;
    this.firstFeature.clear();
    this.solidTiles.clear();
    for (const f of this.features.entities) {
      const k = keyOf(f.tileFeature.tileX, f.tileFeature.tileY);
      if (!this.firstFeature.has(k)) this.firstFeature.set(k, f);
    }
    for (const s of this.solids.entities) this.solidTiles.add(keyOf(s.solid.tileX, s.solid.tileY));
  }
}
