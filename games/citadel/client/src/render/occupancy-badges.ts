/**
 * Per-building occupancy badges (DOM overlay).
 *
 * Floats a small headcount chip over every building that currently has people
 * AT it — idle residents over their house, workers over their farm/workshop/
 * service. The count comes from the snapshot's read-only `BuildingSnapshot.
 * occupancy` (tallied sim-side: stationary villagers attributed to their home /
 * workplace; travelling villagers are on the road, not counted here). So the sum
 * of all badges + the villagers drawn on roads equals the population.
 *
 * Rendered as pooled absolutely-positioned DOM elements (the canvas renderer has
 * no glyph atlas; the HUD is DOM — same idiom as the follow-cam strip + toasts).
 * Render-only: reads snapshots + the camera transform, never the sim. Cheap — one
 * pooled <div> per visible occupied building, repositioned each frame; surplus
 * elements are hidden, not destroyed.
 */
import type { BuildingSnapshot } from "@citadel/sim-core";

/** Projects a tile (tx,ty) to a CSS-px point relative to the viewport. */
export type TileToCss = (tx: number, ty: number) => { x: number; y: number };

export class OccupancyBadgeLayer {
  private readonly root: HTMLElement;
  private readonly pool: HTMLDivElement[] = [];

  constructor(root: HTMLElement) {
    this.root = root;
  }

  /**
   * Reposition/refresh badges for the current frame. `ownerId` scopes to the
   * local player's buildings (so an MP opponent's headcounts aren't shown). Only
   * buildings with `occupancy > 0` get a chip; infrastructure (road/wall/bridge/
   * gate) never does. `tileToCss` projects the building's top-centre tile.
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
      if (b.type === "road" || b.type === "wall" || b.type === "bridge" || b.type === "gate") continue;

      // Anchor at the footprint's top-centre tile so the chip floats over the
      // roof rather than the ground diamond's far corner.
      const cxTile = b.x + b.w / 2;
      const topTile = b.y;
      const p = tileToCss(cxTile, topTile);

      const el = this.elementAt(i++);
      el.textContent = String(b.occupancy);
      el.style.left = `${Math.round(p.x)}px`;
      el.style.top = `${Math.round(p.y)}px`;
      el.style.display = "";
    }
    // Hide any pooled elements not used this frame.
    for (let j = i; j < this.pool.length; j++) this.pool[j]!.style.display = "none";
  }

  /** Hide all badges (e.g. on game over / disconnect). */
  clear(): void {
    for (const el of this.pool) el.style.display = "none";
  }

  /** Grow/fetch a pooled badge element at index `i`. */
  private elementAt(i: number): HTMLDivElement {
    let el = this.pool[i];
    if (el === undefined) {
      el = document.createElement("div");
      el.className = "occupancy-badge";
      this.root.appendChild(el);
      this.pool[i] = el;
    }
    return el;
  }
}
