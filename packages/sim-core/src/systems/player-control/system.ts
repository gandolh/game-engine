// Turns buffered keyboard input into Pip's movement + hotbar action intentions,
// using the same Intention shapes AI farmers emit so ActSystem runs them identically.
// Movement: velocity-based float position, PLAYER_SPEED = 1/PLAYER_STEP_TICKS tiles/tick.
// Collision: AABB_HALF = 0.3 tiles, axes resolved independently for wall-slide.
// Diagonal: axis-independent (no sqrt2 normalization — determinism requirement).
// Consumers needing tile index: Math.round(transform.x/y).

import type { SimContext, System, World, Intention } from "@engine/core";
import type { GameEntity, ItemRef } from "../../components";
import { regionAt, isWalkable, isFishingIsle, type RegionId } from "../../world/regions";
import { isDockTile } from "../../world/coral";
import { isPortDockTile, isPortLaneTile } from "../../world/ports";
import { DIR_DELTA, PLAYER_STEP_TICKS } from "./hotbar";
import { defaultItemSlots, syncItemSlots } from "./items";

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

      // Keep the item-grid layout in sync with current holdings (lazily seeded). Player-only
      // and never read by AI/economy systems, so determinism is unaffected.
      if (player.itemSlots === undefined) player.itemSlots = defaultItemSlots();
      if (entity.inventory) syncItemSlots(player.itemSlots, entity.inventory, entity.resources);

      const mx = player.pendingMoveX;
      const my = player.pendingMoveY;

      if (mx !== null || my !== null) {
        player.facing = mx ?? my!; // horizontal wins on diagonal (side profile reads best)

        const vx = mx === "left" ? -PLAYER_SPEED : mx === "right" ? PLAYER_SPEED : 0;
        const vy = my === "up"   ? -PLAYER_SPEED : my === "down"  ? PLAYER_SPEED : 0;

        // Aboard a boat → Pip steps on the boat lanes (ocean), not land.
        const aboard = farmer.aboard === true;
        // Resolve X then Y independently for wall-slide.
        const newX = this.resolveAxis(transform.x, transform.y, vx, 0, aboard).x;
        const newY = this.resolveAxis(newX,          transform.y, 0,  vy, aboard).y;

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

        // A farmer on the target tile → Pip starts a street fight (player may attack
        // anyone; the bout auto-resolves in CombatSystem). Takes precedence over acts.
        const targetFarmer = this.farmerAt(tx, ty, entity.id);
        // A berry-bush is foraged by hand — collect it on any click, whatever slot is held.
        const ref = player.itemSlots[player.selectedSlot] ?? null;
        const itemIntent = ref ? this.refIntent(entity, ref, tx, ty) : null;
        // Standing on a dock (port or coral) → board / disembark. Lower precedence
        // than a valid held-item action (so a dock that's also a fishing-cast tile
        // still casts when the rod is selected); used when no item action applies.
        const px0 = Math.round(transform.x);
        const py0 = Math.round(transform.y);
        const onDock = isPortDockTile(px0, py0) || isDockTile(px0, py0);
        const intent = targetFarmer !== undefined
          ? { kind: "challenge", data: { peerId: targetFarmer, context: "street" }, priority: 0 }
          : this.bushAt(tx, ty)
          ? { kind: "gather-bush", data: { tileX: tx, tileY: ty }, priority: 0 }
          : itemIntent
          ? itemIntent
          : onDock
          ? { kind: farmer.aboard ? "return-to-shore" : "board-boat", data: {}, priority: 0 }
          : null;
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
    aboard: boolean,
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
        if (this.canStand(tx, ty, aboard)) continue;

        if (vx > 0) x = Math.min(x, tx - 0.5 - AABB_HALF);        // moving right: push left
        else if (vx < 0) x = Math.max(x, tx + 0.5 + AABB_HALF); // moving left: push right
        if (vy > 0) y = Math.min(y, ty - 0.5 - AABB_HALF);        // moving down: push up
        else if (vy < 0) y = Math.max(y, ty + 0.5 + AABB_HALF); // moving up: push down
      }
    }

    return { x, y };
  }

  /** Build the intention for the selected item on the faced tile, or null.
   *  Only tools and seeds dispatch a field action; held crops/fish/resources are inert. */
  private refIntent(
    entity: GameEntity,
    ref: ItemRef,
    tx: number,
    ty: number,
  ): Intention | null {
    if (ref.kind === "tool") {
      switch (ref.tool) {
        case "axe":
        case "pickaxe": {
          const wantKind = ref.tool === "axe" ? "tree" : "stone";
          for (const f of this.world.query("tileFeature")) {
            if (f.tileFeature.tileX !== tx || f.tileFeature.tileY !== ty) continue;
            if (f.tileFeature.kind !== wantKind) return null;
            const kind = ref.tool === "axe" ? "chop-tree" : "mine-stone";
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

    if (ref.kind !== "seed") return null; // held crops/fish/resources are not actionable
    const plot = this.ownedPlotAt(entity, tx, ty); // seed slot: plant on empty owned plot
    if (plot && plot.state.kind !== "planted" && (entity.inventory?.seeds[ref.crop] ?? 0) > 0) {
      return { kind: "plant", data: { crop: ref.crop, tileX: tx, tileY: ty }, priority: 0 };
    }
    return null;
  }

  /** True if a forageable berry-bush occupies the tile. */
  private bushAt(tx: number, ty: number): boolean {
    for (const f of this.world.query("tileFeature")) {
      if (f.tileFeature.tileX === tx && f.tileFeature.tileY === ty) {
        return f.tileFeature.kind === "bush";
      }
    }
    return false;
  }

  /** Id of an AI farmer standing on the tile (excluding `selfId`), else undefined. */
  private farmerAt(tx: number, ty: number, selfId: number | undefined): number | undefined {
    for (const f of this.world.query("farmer", "transform")) {
      if (f.id === undefined || f.id === selfId || f.player) continue;
      if (Math.round(f.transform.x) === tx && Math.round(f.transform.y) === ty) return f.id;
    }
    return undefined;
  }

  /** True if a tileFeature (tree/stone/bush) or solid obstacle occupies the tile. */
  private featureAt(tx: number, ty: number): boolean {
    for (const f of this.world.query("tileFeature")) {
      if (f.tileFeature.tileX === tx && f.tileFeature.tileY === ty) return true;
    }
    for (const s of this.world.query("solid")) {
      if (s.solid.tileX === tx && s.solid.tileY === ty) return true;
    }
    return false;
  }

  /** A tile is steppable. On foot: walkable land free of features. Aboard a boat:
   *  the boat lanes (ocean) plus dock tiles (so Pip can pull back up to a dock). */
  private canStand(tx: number, ty: number, aboard: boolean): boolean {
    if (aboard) {
      return isPortLaneTile(tx, ty) || isPortDockTile(tx, ty) || isDockTile(tx, ty);
    }
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
