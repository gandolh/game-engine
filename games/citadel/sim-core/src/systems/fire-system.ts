/**
 * FireSystem — daily fire ignition, spread, and building destruction.
 *
 * Fire is a spatial hazard that rewards deliberate layout: spacing, firebreaks
 * (stone buildings, roads, gaps), and Wells reduce ignition and spread.
 *
 * Wooden buildings: house, farm, mill, bakery, woodcutter, storehouse,
 *   chapel, market, watchpost, tradingpost, garrison (wood frame)
 * Stone buildings (fireproof): quarry, sawmill, smith, mine, wall, gate,
 *   tower, keep
 * Roads also act as partial firebreaks (thin, non-flammable).
 *
 * Citadel 28: fire is a per-player hazard — it ignites/spreads within a player's
 * own buildings and updates that player's fireState/popCap/walls/keep. Single
 * player is the 1-player case (byte-identical). One shared "fire" RNG, pulled in
 * stable player-id order.
 *
 * Stage: "hazards" (after needs/happiness, before immigration).
 */
import type { System, SimContext } from "@engine/core";
import type { SimState, PlayerState } from "../sim-state";
import { pushEvent } from "../sim-state";
import { getProductionDef, SERVICE_RADII, effectiveHousingCapacity } from "../entities/building";
import type { Rng } from "@engine/core";
import { createRng } from "@engine/core";

/** Building types that are wooden (can burn). Stone/defensive types cannot. */
const WOODEN_TYPES = new Set([
  "house", "farm", "mill", "bakery", "woodcutter", "storehouse",
  "chapel", "market", "watchpost", "tradingpost", "garrison",
]);

/** Building types that are stone/fireproof (act as firebreaks). */
const STONE_TYPES = new Set([
  "quarry", "sawmill", "smith", "mine", "wall", "gate", "tower", "keep",
]);

/** Ticks a building burns before being destroyed (at ticksPerDay=20 → 3 days). */
const BURN_TICKS = 60;

export class FireSystem implements System {
  readonly name = "FireSystem";

  private lastDay = -1;
  private readonly baseRng: Rng;
  private readonly rivalBase: Rng;
  private readonly perPlayerRng = new Map<number, Rng>();

  constructor(private readonly state: SimState) {
    // Fork the base RNG ONCE in constructor, never per-tick.
    this.baseRng = state.rng.fork("fire");
    // Citadel 33: rival hazard streams come from a separate createRng tree so
    // deriving them never consumes state.rng (keeps solo byte-identical).
    this.rivalBase = createRng(state.rng.snapshot().seed).fork("fire-rivals");
  }

  /** Citadel 33: per-player hazard RNG (player 0 = legacy stream → solo unchanged). */
  private rngFor(p: PlayerState): Rng {
    let r = this.perPlayerRng.get(p.id);
    if (r === undefined) {
      r = p.id === 0 ? this.baseRng : this.rivalBase.fork(`p${p.id}`);
      this.perPlayerRng.set(p.id, r);
    }
    return r;
  }

  run(ctx: SimContext): void {
    // Advance burn timers every tick (per player).
    for (const p of this.state.players) this._tickBurning(p, ctx.tick);
    // Daily: ignition + spread checks (per player, stable id order).
    if (this.state.day === this.lastDay) return;
    this.lastDay = this.state.day;
    for (const p of this.state.players) {
      this._spreadFire(p);
      this._checkIgnition(p);
    }
  }

  /** Advance burn timers; destroy buildings when timer expires. */
  private _tickBurning(p: PlayerState, tick: number): void {
    const state = this.state;
    const toDestroy: number[] = [];
    for (const entity of state.buildingWorld.query("building")) {
      if (entity.building.ownerId !== p.id) continue;
      const id = entity.id;
      if (id === undefined) continue;
      const fs = p.fireState.get(id);
      if (fs === undefined || !fs.burning) continue;
      // Suppress production while burning.
      const rs = state.buildingState.get(id);
      if (rs !== undefined) rs.workerCount = 0;
      fs.burnTicksLeft = Math.max(0, fs.burnTicksLeft - 1);
      if (fs.burnTicksLeft === 0) {
        fs.destroyed = true;
        toDestroy.push(id);
      }
    }
    for (const id of toDestroy) {
      this._destroyBuilding(p, id, tick);
    }
  }

  /** Spread fire from burning buildings to nearby wooden neighbors (daily). */
  private _spreadFire(p: PlayerState): void {
    const state = this.state;
    const burningIds: number[] = [];
    for (const entity of state.buildingWorld.query("building")) {
      if (entity.building.ownerId !== p.id) continue;
      const id = entity.id;
      if (id === undefined) continue;
      const fs = p.fireState.get(id);
      if (fs?.burning === true) burningIds.push(id);
    }
    if (burningIds.length === 0) return;

    for (const srcId of burningIds) {
      const srcEntity = this._entityById(srcId);
      if (srcEntity === null) continue;
      const sb = srcEntity;

      for (const entity of state.buildingWorld.query("building")) {
        if (entity.building.ownerId !== p.id) continue;
        const id = entity.id;
        if (id === undefined || id === srcId) continue;
        const fs = p.fireState.get(id);
        if (fs?.burning === true || fs?.destroyed === true) continue;
        const b = entity.building;
        if (!WOODEN_TYPES.has(b.type)) continue;

        const scx = sb.x + Math.floor(sb.w / 2);
        const scy = sb.y + Math.floor(sb.h / 2);
        const tcx = b.x + Math.floor(b.w / 2);
        const tcy = b.y + Math.floor(b.h / 2);
        const dist = Math.abs(scx - tcx) + Math.abs(scy - tcy);

        if (dist > 3) continue;
        if (this._hasFirebreak(p, scx, scy, tcx, tcy)) continue;

        let spreadChance = 0.6;
        const wellNear = this._hasWellNear(p, tcx, tcy);
        if (wellNear) spreadChance *= 0.3;

        if (this.rngFor(p).nextFloat() < spreadChance) {
          this._igniteBuilding(p, id, b.type, "spread");
        }
      }
    }
  }

  /** Check ignition for non-burning wooden buildings (daily). */
  private _checkIgnition(p: PlayerState): void {
    const state = this.state;
    for (const entity of state.buildingWorld.query("building")) {
      if (entity.building.ownerId !== p.id) continue;
      const id = entity.id;
      if (id === undefined) continue;
      const fs = p.fireState.get(id);
      if (fs?.burning === true || fs?.destroyed === true) continue;
      const b = entity.building;
      if (!WOODEN_TYPES.has(b.type)) continue;

      const cx = b.x + Math.floor(b.w / 2);
      const cy = b.y + Math.floor(b.h / 2);

      const nearbyWooden = this._nearbyWoodenCount(p, cx, cy, id, 4);

      if (nearbyWooden < 3) continue;
      let chance = (nearbyWooden - 2) * 0.20;
      chance = Math.min(0.70, chance);

      if (this._hasWellNear(p, cx, cy)) chance *= 0.2;

      if (this.rngFor(p).nextFloat() < chance) {
        this._igniteBuilding(p, id, b.type, "ignition");
      }
    }
  }

  private _igniteBuilding(p: PlayerState, id: number, type: string, cause: "ignition" | "spread"): void {
    const state = this.state;
    let fs = p.fireState.get(id);
    if (fs === undefined) {
      fs = { burning: false, burnTicksLeft: 0, destroyed: false };
      p.fireState.set(id, fs);
    }
    if (fs.burning || fs.destroyed) return;
    fs.burning = true;
    fs.burnTicksLeft = BURN_TICKS;
    const msg = cause === "ignition"
      ? `Day ${state.day}: a ${type} caught fire!`
      : `Day ${state.day}: fire spread to a ${type}!`;
    pushEvent(state, msg);
  }

  private _destroyBuilding(p: PlayerState, id: number, _tick: number): void {
    const state = this.state;
    for (const entity of state.buildingWorld.query("building")) {
      if (entity.id !== id) continue;
      const b = entity.building;
      pushEvent(state, `Day ${state.day}: a ${b.type} burned down.`);
      const prod = getProductionDef(b.type);
      if (prod?.isGate !== true) {
        state.occupancy.remove({ x: b.x, y: b.y, w: b.w, h: b.h });
      }
      for (let dy = 0; dy < b.h; dy++) {
        for (let dx = 0; dx < b.w; dx++) {
          state.buildingTiles.delete((b.y + dy) * state.width + (b.x + dx));
        }
      }
      if (prod?.isRoad === true) state.roadGrid[b.y * state.width + b.x] = 0;
      if (prod?.isHousing === true && prod.housingCapacity !== undefined) {
        const rs = entity.id !== undefined ? state.buildingState.get(entity.id) : undefined;
        p.popCap = Math.max(0, p.popCap - effectiveHousingCapacity(prod, rs?.level ?? 1));
      }
      if (prod?.isGate === true) p.gateTiles.delete(b.y * state.width + b.x);
      if (prod?.isWall === true) p.wallTiles.delete(b.y * state.width + b.x);
      if (prod?.isKeep === true) p.keepPosition = null;
      if (entity.id !== undefined) state.buildingState.delete(entity.id);
      state.buildingWorld.despawn(entity);
      state.connectivityDirty = true;
      break;
    }
  }

  /** Check if there's a firebreak (stone building or road tile) on the line between two centers. */
  private _hasFirebreak(p: PlayerState, ax: number, ay: number, bx: number, by: number): boolean {
    const state = this.state;
    const steps = Math.max(Math.abs(bx - ax), Math.abs(by - ay));
    if (steps <= 1) return false;
    for (let i = 1; i < steps; i++) {
      const tx = Math.round(ax + (bx - ax) * i / steps);
      const ty = Math.round(ay + (by - ay) * i / steps);
      const idx = ty * state.width + tx;
      // Road tile = firebreak (roads are shared infrastructure).
      if (state.roadGrid[idx] === 1) return true;
      // Stone building (owned by p) = firebreak.
      for (const entity of state.buildingWorld.query("building")) {
        if (entity.building.ownerId !== p.id) continue;
        const eb = entity.building;
        if (tx >= eb.x && tx < eb.x + eb.w && ty >= eb.y && ty < eb.y + eb.h) {
          if (STONE_TYPES.has(eb.type)) return true;
        }
      }
    }
    return false;
  }

  /** Count wooden buildings owned by p near (cx, cy) within `range` tiles (excluding self). */
  private _nearbyWoodenCount(p: PlayerState, cx: number, cy: number, selfId: number, range: number): number {
    let count = 0;
    for (const entity of this.state.buildingWorld.query("building")) {
      if (entity.building.ownerId !== p.id) continue;
      if (entity.id === selfId) continue;
      const b = entity.building;
      if (!WOODEN_TYPES.has(b.type)) continue;
      const ox = b.x + Math.floor(b.w / 2);
      const oy = b.y + Math.floor(b.h / 2);
      if (Math.abs(cx - ox) + Math.abs(cy - oy) <= range) count++;
    }
    return count;
  }

  /** Check if a Well owned by p is within its service radius of position (cx, cy). */
  private _hasWellNear(p: PlayerState, cx: number, cy: number): boolean {
    const wellRadius = SERVICE_RADII["well"] ?? 5;
    for (const entity of this.state.buildingWorld.query("building")) {
      if (entity.building.ownerId !== p.id) continue;
      if (entity.building.type !== "well") continue;
      const b = entity.building;
      const wx = b.x + Math.floor(b.w / 2);
      const wy = b.y + Math.floor(b.h / 2);
      if (Math.abs(cx - wx) + Math.abs(cy - wy) <= wellRadius) return true;
    }
    return false;
  }

  /** Look up a building entity's component by ECS id. */
  private _entityById(id: number): { type: string; x: number; y: number; w: number; h: number } | null {
    for (const entity of this.state.buildingWorld.query("building")) {
      if (entity.id === id) return entity.building;
    }
    return null;
  }
}

/** Public helper: count currently burning buildings across all players. */
export function countActiveFires(state: SimState): number {
  let count = 0;
  for (const p of state.players) {
    for (const [, fs] of p.fireState) {
      if (fs.burning) count++;
    }
  }
  return count;
}
