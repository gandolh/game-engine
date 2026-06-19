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
 * Ignition chance per wooden building per day:
 *   base = 0.04
 *   raised by: nearby wooden buildings (density bonus up to +0.12)
 *   lowered by: Well in range (×0.2 reduction, multiplicative)
 *
 * Spread: burning building ignites nearby wooden buildings (Manhattan ≤ 3)
 *   each day, unless separated by a stone building or road gap.
 *   Spread chance = 0.6 base, reduced if target has Well nearby (×0.3 reduction)
 *
 * Burning buildings stop producing (workerCount forced to 0 while burning).
 * After BURN_TICKS ticks they are destroyed (despawned from buildingWorld).
 *
 * Stage: "hazards" (after needs/happiness, before immigration).
 * Ordering comment: runs AFTER NeedsHappinessSystem so it can read current
 * happiness (used as minor modifier), BEFORE ImmigrationSystem so deaths/
 * destroyed buildings are seen by population logic.
 */
import type { System, SimContext } from "@engine/core";
import type { SimState, BuildingFireState } from "../sim-state";
import { pushEvent } from "../sim-state";
import { getProductionDef, SERVICE_RADII, effectiveHousingCapacity } from "../entities/building";
import type { Rng } from "@engine/core";

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
  private readonly rng: Rng;

  constructor(private readonly state: SimState) {
    // Fork ONCE in constructor, never per-tick.
    this.rng = state.rng.fork("fire");
  }

  run(ctx: SimContext): void {
    // Advance burn timers every tick.
    this._tickBurning(ctx.tick);
    // Daily: ignition + spread checks.
    if (this.state.day === this.lastDay) return;
    this.lastDay = this.state.day;
    this._spreadFire();
    this._checkIgnition();
  }

  /** Advance burn timers; destroy buildings when timer expires. */
  private _tickBurning(tick: number): void {
    const state = this.state;
    // Collect buildings to destroy (can't despawn while iterating).
    const toDestroy: number[] = [];
    for (const entity of state.buildingWorld.query("building")) {
      const id = entity.id;
      if (id === undefined) continue;
      const fs = state.fireState.get(id);
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
      this._destroyBuilding(id, tick);
    }
  }

  /** Spread fire from burning buildings to nearby wooden neighbors (daily). */
  private _spreadFire(): void {
    const state = this.state;
    // Collect currently burning buildings first (snapshot to avoid mutation during loop).
    const burningIds: number[] = [];
    for (const entity of state.buildingWorld.query("building")) {
      const id = entity.id;
      if (id === undefined) continue;
      const fs = state.fireState.get(id);
      if (fs?.burning === true) burningIds.push(id);
    }
    if (burningIds.length === 0) return;

    // For each burning building, try to ignite neighbors.
    for (const srcId of burningIds) {
      const srcEntity = this._entityById(srcId);
      if (srcEntity === null) continue;
      const sb = srcEntity;

      for (const entity of state.buildingWorld.query("building")) {
        const id = entity.id;
        if (id === undefined || id === srcId) continue;
        const fs = state.fireState.get(id);
        if (fs?.burning === true || fs?.destroyed === true) continue;
        const b = entity.building;
        if (!WOODEN_TYPES.has(b.type)) continue;

        // Manhattan distance between footprint centers.
        const scx = sb.x + Math.floor(sb.w / 2);
        const scy = sb.y + Math.floor(sb.h / 2);
        const tcx = b.x + Math.floor(b.w / 2);
        const tcy = b.y + Math.floor(b.h / 2);
        const dist = Math.abs(scx - tcx) + Math.abs(scy - tcy);

        // Spread range: adjacent footprints within 3 tiles center-to-center.
        if (dist > 3) continue;

        // Check firebreak: if a stone building or road tile lies between them, skip.
        if (this._hasFirebreak(scx, scy, tcx, tcy)) continue;

        // Spread chance.
        let spreadChance = 0.6;
        const wellNear = this._hasWellNear(tcx, tcy);
        if (wellNear) spreadChance *= 0.3;

        if (this.rng.nextFloat() < spreadChance) {
          this._igniteBuilding(id, b.type, "spread");
        }
      }
    }
  }

  /** Check ignition for non-burning wooden buildings (daily). */
  private _checkIgnition(): void {
    const state = this.state;
    for (const entity of state.buildingWorld.query("building")) {
      const id = entity.id;
      if (id === undefined) continue;
      const fs = state.fireState.get(id);
      if (fs?.burning === true || fs?.destroyed === true) continue;
      const b = entity.building;
      if (!WOODEN_TYPES.has(b.type)) continue;

      const cx = b.x + Math.floor(b.w / 2);
      const cy = b.y + Math.floor(b.h / 2);

      // Density bonus: count nearby wooden buildings (within 4 tiles).
      const nearbyWooden = this._nearbyWoodenCount(cx, cy, id, 4);

      // Fire only becomes a risk in DENSE wooden districts (≥ 3 neighbors).
      // Base chance: 0.20 per neighbor above the threshold, capped at 0.70.
      // This ensures dense districts (5+ wooden neighbors) ignite reliably
      // within 10-20 days, while sparse layouts (< 3 neighbors) are safe.
      // A Well nearby cuts this by 80% (×0.2), demonstrating clear mitigation.
      if (nearbyWooden < 3) continue;
      let chance = (nearbyWooden - 2) * 0.20;
      chance = Math.min(0.70, chance);

      // Well mitigation: 80% reduction in ignition chance.
      if (this._hasWellNear(cx, cy)) chance *= 0.2;

      if (this.rng.nextFloat() < chance) {
        this._igniteBuilding(id, b.type, "ignition");
      }
    }
  }

  private _igniteBuilding(id: number, type: string, cause: "ignition" | "spread"): void {
    const state = this.state;
    let fs = state.fireState.get(id);
    if (fs === undefined) {
      fs = { burning: false, burnTicksLeft: 0, destroyed: false };
      state.fireState.set(id, fs);
    }
    if (fs.burning || fs.destroyed) return;
    fs.burning = true;
    fs.burnTicksLeft = BURN_TICKS;
    const msg = cause === "ignition"
      ? `Day ${state.day}: a ${type} caught fire!`
      : `Day ${state.day}: fire spread to a ${type}!`;
    pushEvent(state, msg);
  }

  private _destroyBuilding(id: number, _tick: number): void {
    const state = this.state;
    for (const entity of state.buildingWorld.query("building")) {
      if (entity.id !== id) continue;
      const b = entity.building;
      pushEvent(state, `Day ${state.day}: a ${b.type} burned down.`);
      // Release occupancy, roads, housing, etc.
      const prod = getProductionDef(b.type);
      if (prod?.isGate !== true) {
        state.occupancy.remove({ x: b.x, y: b.y, w: b.w, h: b.h });
      }
      // Remove from buildingTiles.
      for (let dy = 0; dy < b.h; dy++) {
        for (let dx = 0; dx < b.w; dx++) {
          state.buildingTiles.delete((b.y + dy) * state.width + (b.x + dx));
        }
      }
      if (prod?.isRoad === true) state.roadGrid[b.y * state.width + b.x] = 0;
      if (prod?.isHousing === true && prod.housingCapacity !== undefined) {
        // Subtract the building's level-effective capacity (read level before rs is deleted).
        const rs = entity.id !== undefined ? state.buildingState.get(entity.id) : undefined;
        state.popCap = Math.max(0, state.popCap - effectiveHousingCapacity(prod, rs?.level ?? 1));
      }
      if (prod?.isGate === true) state.gateTiles.delete(b.y * state.width + b.x);
      if (prod?.isWall === true) state.wallTiles.delete(b.y * state.width + b.x);
      if (prod?.isKeep === true) state.keepPosition = null;
      if (entity.id !== undefined) state.buildingState.delete(entity.id);
      state.buildingWorld.despawn(entity);
      // Mark connectivity dirty — RoadConnectivitySystem rebuilds walkable next tick.
      state.connectivityDirty = true;
      break;
    }
  }

  /** Check if there's a firebreak (stone building or road tile) on the line between two centers. */
  private _hasFirebreak(ax: number, ay: number, bx: number, by: number): boolean {
    const state = this.state;
    // Sample a few points along the line.
    const steps = Math.max(Math.abs(bx - ax), Math.abs(by - ay));
    if (steps <= 1) return false;
    for (let i = 1; i < steps; i++) {
      const tx = Math.round(ax + (bx - ax) * i / steps);
      const ty = Math.round(ay + (by - ay) * i / steps);
      const idx = ty * state.width + tx;
      // Road tile = firebreak.
      if (state.roadGrid[idx] === 1) return true;
      // Stone building = firebreak.
      for (const entity of state.buildingWorld.query("building")) {
        const eb = entity.building;
        if (tx >= eb.x && tx < eb.x + eb.w && ty >= eb.y && ty < eb.y + eb.h) {
          if (STONE_TYPES.has(eb.type)) return true;
        }
      }
    }
    return false;
  }

  /** Count wooden buildings near (cx, cy) within `range` tiles (excluding self by id). */
  private _nearbyWoodenCount(cx: number, cy: number, selfId: number, range: number): number {
    let count = 0;
    for (const entity of this.state.buildingWorld.query("building")) {
      if (entity.id === selfId) continue;
      const b = entity.building;
      if (!WOODEN_TYPES.has(b.type)) continue;
      const ox = b.x + Math.floor(b.w / 2);
      const oy = b.y + Math.floor(b.h / 2);
      if (Math.abs(cx - ox) + Math.abs(cy - oy) <= range) count++;
    }
    return count;
  }

  /** Check if a Well is within its service radius of position (cx, cy). */
  private _hasWellNear(cx: number, cy: number): boolean {
    const wellRadius = SERVICE_RADII["well"] ?? 5;
    for (const entity of this.state.buildingWorld.query("building")) {
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

/** Public helper: count currently burning buildings. */
export function countActiveFires(state: SimState): number {
  let count = 0;
  for (const [, fs] of state.fireState) {
    if (fs.burning) count++;
  }
  return count;
}
