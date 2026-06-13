

import type { SimContext, System, World, Intention } from "@engine/core";
import type { GameEntity, ItemRef } from "../../components";
import { regionAt, isWalkable, isFishingIsle, type RegionId } from "../../world/regions";
import { isDockTile } from "../../world/coral";
import { isPortDockTile, isPortLaneTile } from "../../world/ports";
import { DIR_DELTA, PLAYER_STEP_TICKS } from "./hotbar";
import { defaultItemSlots, syncItemSlots } from "./items";

export const PLAYER_SPEED = 1 / PLAYER_STEP_TICKS;

const AABB_HALF = 0.3; 

export class PlayerControlSystem implements System {
  readonly name = "PlayerControlSystem";

  constructor(private readonly world: World<GameEntity>) {}

  run(_ctx: SimContext): void {
    for (const entity of this.world.query("player", "transform", "farmer", "intentions")) {
      const player = entity.player!;
      const transform = entity.transform!;
      const farmer = entity.farmer!;

      farmer.movedThisTick = false;
      farmer.renderPos = undefined; 

      if (player.itemSlots === undefined) player.itemSlots = defaultItemSlots();
      if (entity.inventory) syncItemSlots(player.itemSlots, entity.inventory, entity.resources);

      const mx = player.pendingMoveX;
      const my = player.pendingMoveY;

      if (mx !== null || my !== null) {
        player.facing = mx ?? my!; 

        const vx = mx === "left" ? -PLAYER_SPEED : mx === "right" ? PLAYER_SPEED : 0;
        const vy = my === "up"   ? -PLAYER_SPEED : my === "down"  ? PLAYER_SPEED : 0;

        const aboard = farmer.aboard === true;

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

          const clickedTile = player.pendingActionTile;
          player.pendingActionTile = null; 

          const px = Math.round(transform.x);
          const py = Math.round(transform.y);

          const faceDx = clickedTile.x - px;
          const faceDy = clickedTile.y - py;
          if (Math.abs(faceDx) >= Math.abs(faceDy)) {
            player.facing = faceDx >= 0 ? "right" : "left";
          } else {
            player.facing = faceDy >= 0 ? "down" : "up";
          }

          const reachable = Math.max(Math.abs(clickedTile.x - px), Math.abs(clickedTile.y - py)) <= 1;
          if (!reachable) {

            continue;
          }
          tx = clickedTile.x;
          ty = clickedTile.y;
        } else {

          const { dx, dy } = DIR_DELTA[player.facing]!;
          tx = Math.round(transform.x) + dx;
          ty = Math.round(transform.y) + dy;
        }

        const targetFarmer = this.farmerAt(tx, ty, entity.id);

        const ref = player.itemSlots[player.selectedSlot] ?? null;
        const itemIntent = ref ? this.refIntent(entity, ref, tx, ty) : null;

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

        if (vx > 0) x = Math.min(x, tx - 0.5 - AABB_HALF);        
        else if (vx < 0) x = Math.max(x, tx + 0.5 + AABB_HALF); 
        if (vy > 0) y = Math.min(y, ty - 0.5 - AABB_HALF);        
        else if (vy < 0) y = Math.max(y, ty + 0.5 + AABB_HALF); 
      }
    }

    return { x, y };
  }

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

    if (ref.kind !== "seed") return null; 
    const plot = this.ownedPlotAt(entity, tx, ty); 
    if (plot && plot.state.kind !== "planted" && (entity.inventory?.seeds[ref.crop] ?? 0) > 0) {
      return { kind: "plant", data: { crop: ref.crop, tileX: tx, tileY: ty }, priority: 0 };
    }
    return null;
  }

  private bushAt(tx: number, ty: number): boolean {
    for (const f of this.world.query("tileFeature")) {
      if (f.tileFeature.tileX === tx && f.tileFeature.tileY === ty) {
        return f.tileFeature.kind === "bush";
      }
    }
    return false;
  }

  private farmerAt(tx: number, ty: number, selfId: number | undefined): number | undefined {
    for (const f of this.world.query("farmer", "transform")) {
      if (f.id === undefined || f.id === selfId || f.player) continue;
      if (Math.round(f.transform.x) === tx && Math.round(f.transform.y) === ty) return f.id;
    }
    return undefined;
  }

  private featureAt(tx: number, ty: number): boolean {
    for (const f of this.world.query("tileFeature")) {
      if (f.tileFeature.tileX === tx && f.tileFeature.tileY === ty) return true;
    }
    for (const s of this.world.query("solid")) {
      if (s.solid.tileX === tx && s.solid.tileY === ty) return true;
    }
    return false;
  }

  private canStand(tx: number, ty: number, aboard: boolean): boolean {
    if (aboard) {
      return isPortLaneTile(tx, ty) || isPortDockTile(tx, ty) || isDockTile(tx, ty);
    }
    return isWalkable(tx, ty) && !this.featureAt(tx, ty);
  }

  private ownedPlotAt(entity: GameEntity, tx: number, ty: number): GameEntity["plot"] | null {
    for (const p of this.world.query("plot")) {
      if (p.plot.tileX === tx && p.plot.tileY === ty && p.plot.ownerId === entity.id) {
        return p.plot;
      }
    }
    return null;
  }
}
