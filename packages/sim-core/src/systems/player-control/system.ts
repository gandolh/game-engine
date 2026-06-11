// Turns buffered keyboard input into Pip's movement + hotbar action intentions,
// using the same Intention shapes AI farmers emit so ActSystem runs them identically.
// Movement: velocity-based float position, PLAYER_SPEED = 1/PLAYER_STEP_TICKS tiles/tick.
// Collision: AABB_HALF = 0.3 tiles, axes resolved independently for wall-slide.
// Diagonal: axis-independent (no sqrt2 normalization — determinism requirement).
// Consumers needing tile index: Math.round(transform.x/y).

import type { SimContext, System, World, Intention } from "@engine/core";
import type { GameEntity } from "../../components";
import { regionAt, isWalkable, isFishingIsle, type RegionId } from "../../world/regions";
import { DIR_DELTA, PLAYER_STEP_TICKS, HOTBAR_SLOTS, type HotbarSlot } from "./hotbar";

/** Pip's movement speed: 1/PLAYER_STEP_TICKS tiles/tick. Exported for tests. */
export const PLAYER_SPEED = 1 / PLAYER_STEP_TICKS;

const AABB_HALF = 0.3; // 0.6×0.6 tile AABB; inset from 0.5 to avoid corner snag

export class PlayerControlSystem implements System {
  readonly name = "PlayerControlSystem";

  constructor(private readonly world: World<GameEntity>) {}

  run(_ctx: SimContext): void {
    for (const entity of this.world.query("player", "transform", "farmer", "intentions")) {
      const player = entity.player!;
      const transform = entity.transform!;
      const farmer = entity.farmer!;

      farmer.movedThisTick = false;
      farmer.renderPos = undefined; // transform IS the position; no residual renderPos needed

      const mx = player.pendingMoveX;
      const my = player.pendingMoveY;

      if (mx !== null || my !== null) {
        player.facing = mx ?? my!; // horizontal wins on diagonal (side profile reads best)

        const vx = mx === "left" ? -PLAYER_SPEED : mx === "right" ? PLAYER_SPEED : 0;
        const vy = my === "up"   ? -PLAYER_SPEED : my === "down"  ? PLAYER_SPEED : 0;

        // Resolve X then Y independently for wall-slide.
        const newX = this.resolveAxis(transform.x, transform.y, vx, 0).x;
        const newY = this.resolveAxis(newX,          transform.y, 0,  vy).y;

        const moved = newX !== transform.x || newY !== transform.y;
        transform.x = newX;
        transform.y = newY;

        if (moved) {
          farmer.movedThisTick = true;
          const region = regionAt(Math.round(transform.x), Math.round(transform.y));
          if (region !== null) farmer.currentRegion = region;
        }
      }

      if (player.pendingAction) {
        player.pendingAction = false;

        let tx: number;
        let ty: number;

        if (player.pendingActionTile !== null) {
          // Click-to-act path: use the clicked tile with a Chebyshev-≤1 reach guard.
          const clickedTile = player.pendingActionTile;
          player.pendingActionTile = null; // always clear, whether reachable or not

          const px = Math.round(transform.x);
          const py = Math.round(transform.y);

          // Orient Pip toward the clicked tile for sprite readability.
          const faceDx = clickedTile.x - px;
          const faceDy = clickedTile.y - py;
          if (Math.abs(faceDx) >= Math.abs(faceDy)) {
            player.facing = faceDx >= 0 ? "right" : "left";
          } else {
            player.facing = faceDy >= 0 ? "down" : "up";
          }

          const reachable = Math.max(Math.abs(clickedTile.x - px), Math.abs(clickedTile.y - py)) <= 1;
          if (!reachable) {
            // Out of reach — skip action entirely (facing was updated above for readability).
            continue;
          }
          tx = clickedTile.x;
          ty = clickedTile.y;
        } else {
          // E-key path: use the tile in front of Pip (unchanged behavior).
          const { dx, dy } = DIR_DELTA[player.facing]!;
          tx = Math.round(transform.x) + dx;
          ty = Math.round(transform.y) + dy;
        }

        const slot = HOTBAR_SLOTS[player.selectedSlot];
        const intent = slot ? this.slotIntent(entity, slot, tx, ty) : null;
        if (intent !== null) {
          entity.intentions!.queue = [intent];
          entity.fsm!.current = "ACT";
        }
      }
    }
  }

  /** Resolve one axis with AABB collision; only one of vx/vy should be non-zero per call. */
  private resolveAxis(
    cx: number,
    cy: number,
    vx: number,
    vy: number,
  ): { x: number; y: number } {
    if (vx === 0 && vy === 0) return { x: cx, y: cy };

    const nx = cx + vx;
    const ny = cy + vy;

    // Position convention (see header): an INTEGER coordinate is the CENTER of that tile, so tile
    // cell N spans world coords [N-0.5, N+0.5) and the cell index for a coord v is Math.round(v).
    // Shift by +0.5 so the floor-based span math operates in tile-corner space; the push-out below
    // shifts back by the same 0.5. (Without this, the AABB is offset half a tile from the sprite —
    // Pip's center drifts onto ocean tiles at island right/bottom edges, "walking on water".)
    // EPS prevents an AABB edge exactly on a tile boundary from counting as overlapping.
    const EPS = 1e-6;
    const minTX = Math.floor(nx + 0.5 - AABB_HALF + EPS);
    const maxTX = Math.floor(nx + 0.5 + AABB_HALF - EPS);
    const minTY = Math.floor(ny + 0.5 - AABB_HALF + EPS);
    const maxTY = Math.floor(ny + 0.5 + AABB_HALF - EPS);

    let x = nx;
    let y = ny;

    for (let tx = minTX; tx <= maxTX; tx++) {
      for (let ty = minTY; ty <= maxTY; ty++) {
        if (this.canStand(tx, ty)) continue;

        if (vx > 0) x = Math.min(x, tx - 0.5 - AABB_HALF);        // moving right: push left
        else if (vx < 0) x = Math.max(x, tx + 0.5 + AABB_HALF); // moving left: push right
        if (vy > 0) y = Math.min(y, ty - 0.5 - AABB_HALF);        // moving down: push up
        else if (vy < 0) y = Math.max(y, ty + 0.5 + AABB_HALF); // moving up: push down
      }
    }

    return { x, y };
  }

  /** Build the intention for the selected hotbar slot on the faced tile, or null. */
  private slotIntent(
    entity: GameEntity,
    slot: HotbarSlot,
    tx: number,
    ty: number,
  ): Intention | null {
    if (slot.kind === "tool") {
      switch (slot.tool) {
        case "axe":
        case "pickaxe": {
          const wantKind = slot.tool === "axe" ? "tree" : "stone";
          for (const f of this.world.query("tileFeature")) {
            if (f.tileFeature.tileX !== tx || f.tileFeature.tileY !== ty) continue;
            if (f.tileFeature.kind !== wantKind) return null;
            const kind = slot.tool === "axe" ? "chop-tree" : "mine-stone";
            return { kind, data: { tileX: tx, tileY: ty }, priority: 0 };
          }
          return null;
        }
        case "can": {
          const plot = this.ownedPlotAt(entity, tx, ty);
          if (plot && plot.state.kind === "planted" && plot.state.wateredToday !== true) {
            return { kind: "water", data: { tileX: tx, tileY: ty }, priority: 0 };
          }
          return null;
        }
        case "fishing-rod": {
          // Face open water (non-walkable) while on the fishing isle; ActSystem re-checks rarity.
          const onIsle = isFishingIsle(entity.farmer?.currentRegion ?? null);
          if (onIsle && !isWalkable(tx, ty)) {
            return { kind: "fish", data: { tileX: tx, tileY: ty }, priority: 0 };
          }
          return null;
        }
        case "hoe": {
          if (this.ownedPlotAt(entity, tx, ty) !== null) return null;
          const homeRegion = entity.farmer?.homeRegion;
          const region = regionAt(tx, ty);
          if (region !== null && region === homeRegion) {
            return {
              kind: "till",
              data: { tileX: tx, tileY: ty, regionId: homeRegion as RegionId },
              priority: 0,
            };
          }
          return null;
        }
      }
    }

    const plot = this.ownedPlotAt(entity, tx, ty); // seed slot: plant on empty owned plot
    if (plot && plot.state.kind !== "planted" && (entity.inventory?.seeds[slot.crop] ?? 0) > 0) {
      return { kind: "plant", data: { crop: slot.crop, tileX: tx, tileY: ty }, priority: 0 };
    }
    return null;
  }

  /** True if a tileFeature (tree/stone) or solid obstacle occupies the tile. */
  private featureAt(tx: number, ty: number): boolean {
    for (const f of this.world.query("tileFeature")) {
      if (f.tileFeature.tileX === tx && f.tileFeature.tileY === ty) return true;
    }
    for (const s of this.world.query("solid")) {
      if (s.solid.tileX === tx && s.solid.tileY === ty) return true;
    }
    return false;
  }

  /** A tile is steppable iff walkable and free of a feature/solid obstacle. */
  private canStand(tx: number, ty: number): boolean {
    return isWalkable(tx, ty) && !this.featureAt(tx, ty);
  }

  /** The plot owned by `entity` at the given tile, or null. */
  private ownedPlotAt(entity: GameEntity, tx: number, ty: number): GameEntity["plot"] | null {
    for (const p of this.world.query("plot")) {
      if (p.plot.tileX === tx && p.plot.tileY === ty && p.plot.ownerId === entity.id) {
        return p.plot;
      }
    }
    return null;
  }
}
