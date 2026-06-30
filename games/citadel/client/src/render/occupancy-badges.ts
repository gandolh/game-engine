/**
 * Per-building occupancy badges — in-canvas via `@engine/ui`.
 *
 * Floats a small headcount chip over every building that currently has people
 * AT it — idle residents over their house, workers over their farm/workshop/
 * service. The count comes from the snapshot's read-only `BuildingSnapshot.
 * occupancy` (tallied sim-side: stationary villagers attributed to their home /
 * workplace; travelling villagers are on the road, not counted here). So the sum
 * of all badges + the villagers drawn on roads equals the population.
 *
 * Rendered as pooled `@engine/ui` panel nodes (each a small panel containing a
 * label), one per occupied owned building. The host lays out and renders the
 * active chips each frame inside its existing `surface.begin()/end()` block.
 * Surplus pooled nodes are held hidden (opacity 0) and reused the next frame —
 * same pooling idiom as the old DOM version, but with `@engine/ui` nodes instead
 * of `<div>`s. Render-only: reads snapshots + the camera transform, never the sim.
 */
import { EDG } from "@engine/core";
import { panel, label } from "@engine/ui";
import type { ContainerNode, LabelNode } from "@engine/ui";
import type { BuildingSnapshot } from "@citadel/sim-core";

/** Projects a tile (tx,ty) to a CSS-px point relative to the viewport. */
export type TileToCss = (tx: number, ty: number) => { x: number; y: number };

/** Infrastructure types that never receive an occupancy badge. */
const INFRA_TYPES = new Set(["road", "wall", "bridge", "gate"]);

/** Tight padding around the headcount digit (px). */
const CHIP_PADDING = { top: 2, bottom: 2, left: 5, right: 5 };

/** A pooled chip: the panel node + its label child. */
interface PooledChip {
  readonly container: ContainerNode;
  readonly lbl: LabelNode;
}

/** A chip that is active this frame, with its computed screen position. */
export interface ActiveChip {
  /** The `@engine/ui` panel node — pass to `computeLayout(node, x, y)`. */
  readonly node: ContainerNode;
  /** Screen-px x anchor (left edge for computeLayout). */
  readonly x: number;
  /** Screen-px y anchor (top edge for computeLayout). */
  readonly y: number;
}

/**
 * Manages in-canvas occupancy headcount chips. Call `update` each frame with the
 * current building list; then drive rendering by iterating `activeChips` and
 * calling `computeLayout(chip.node, chip.x, chip.y)` + `renderTree(surface, chip.node)`
 * for each inside an existing `surface.begin()/end()` block.
 */
export class OccupancyBadgeLayer {
  /** Pooled chip nodes grown on demand; reused across frames. */
  private readonly pool: PooledChip[] = [];
  /** Active chips built by the most recent `update` call. */
  private active: ActiveChip[] = [];

  /**
   * Recompute which buildings get a chip for the current frame.
   *
   * `ownerId` scopes to the local player's buildings (MP opponents are skipped).
   * Only buildings with `occupancy > 0` get a chip; infrastructure (road/wall/
   * bridge/gate) is always excluded. `tileToCss` projects the building's top-
   * centre tile to screen CSS-px to anchor the chip over the roof.
   */
  update(
    buildings: readonly BuildingSnapshot[],
    ownerId: number,
    tileToCss: TileToCss,
  ): void {
    let i = 0;
    for (const b of buildings) {
      if (b.ownerId !== ownerId) continue;
      if (b.occupancy <= 0) continue;
      if (INFRA_TYPES.has(b.type)) continue;

      // Anchor at the footprint's top-centre tile so the chip floats over the
      // roof rather than the ground diamond's far corner.
      const cxTile = b.x + b.w / 2;
      const topTile = b.y;
      const p = tileToCss(cxTile, topTile);

      const chip = this.chipAt(i++);
      chip.lbl.text = String(b.occupancy);
      // Chips are always fully opaque when active.
      chip.container.opacity = 1;

      this.active[i - 1] = {
        node: chip.container,
        x: Math.round(p.x),
        y: Math.round(p.y),
      };
    }

    // Hide any pooled chips beyond the active count.
    const activeCount = i;
    for (let j = activeCount; j < this.pool.length; j++) {
      this.pool[j]!.container.opacity = 0;
    }

    // Trim the active array to the used length.
    this.active.length = activeCount;
  }

  /**
   * The active chips for this frame. For each entry, call:
   *   `computeLayout(chip.node, chip.x, chip.y, theme)`
   *   `renderTree(surface, chip.node, theme)`
   * inside the host's `surface.begin()/end()` block.
   */
  get activeChips(): readonly ActiveChip[] {
    return this.active;
  }

  /** Hide all badges (e.g. on game over / disconnect). */
  clear(): void {
    for (const chip of this.pool) chip.container.opacity = 0;
    this.active.length = 0;
  }

  /** Grow / fetch a pooled chip node at index `i`. */
  private chipAt(i: number): PooledChip {
    let chip = this.pool[i];
    if (chip === undefined) {
      const lbl = label("0", {
        color: EDG.yellow,
        layout: {},
      });
      const container = panel(
        { direction: "row", padding: CHIP_PADDING, align: "center" },
        [lbl],
      );
      chip = { container, lbl };
      this.pool[i] = chip;
      // Pre-extend the active array slot.
      this.active.push({ node: container, x: 0, y: 0 });
    }
    return chip;
  }
}
