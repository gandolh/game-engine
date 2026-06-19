/**
 * VillagerSystem — drives villager movement + worker assignment via a per-tick
 * FSM. Villagers are the visible labor layer; they assign themselves to open
 * connected workplaces (incrementing the building's workerCount), walk there
 * along roads/building tiles, "work", periodically haul the workplace's output
 * buffer to a storehouse, and return.
 *
 * Movement is one tile per tick along a precomputed BFS path. All decisions are
 * deterministic (fixed iteration order, no RNG, no wall-clock).
 *
 * Stage: "villagers" (after economy).
 */
import type { System, SimContext } from "@engine/core";
import { getProductionDef } from "../entities/building";
import type { BuildingEntity } from "../entities/building";
import type { VillagerComponent } from "../entities/villager";
import type { SimState } from "../sim-state";
import { villagerWalkable } from "../sim-state";
import { bfsPath } from "../world/pathfinder";

/** Ticks a villager spends "working" before hauling output home to a store. */
const WORK_TICKS = 20;

export class VillagerSystem implements System {
  readonly name = "VillagerSystem";

  constructor(private readonly state: SimState) {}

  run(ctx: SimContext): void {
    const state = this.state;
    for (const entity of state.villagerWorld.query("villager")) {
      this.step(entity.villager, ctx);
    }
  }

  private step(v: VillagerComponent, ctx: SimContext): void {
    switch (v.fsm) {
      case "idle":
        this.assign(v);
        break;
      case "walkToWork":
        if (this.advance(v)) {
          v.fsm = "work";
          v.ticksAtWork = 0;
        }
        break;
      case "work":
        v.ticksAtWork++;
        if (v.ticksAtWork >= WORK_TICKS) {
          // Haul the workplace's accumulated output buffer to the store.
          const wb = this.buildingAt(v.workX, v.workY);
          if (wb !== null) {
            const rs = this.state.buildingState.get(wb.id ?? -1);
            const def = getProductionDef(wb.building.type);
            if (rs !== undefined && def?.outputGood !== undefined && rs.outputBuffer > 0) {
              v.carryGood = def.outputGood;
              v.carryAmount = rs.outputBuffer;
              rs.outputBuffer = 0;
            }
          }
          this.planPath(v, v.workX, v.workY, v.storeX, v.storeY);
          v.fsm = "haulToStore";
        }
        break;
      case "haulToStore":
        if (this.advance(v)) {
          // Goods are already in the global pool (production deposits directly);
          // hauling clears the carried flavor amount on arrival.
          v.carryGood = null;
          v.carryAmount = 0;
          this.planPath(v, v.storeX, v.storeY, v.workX, v.workY);
          v.fsm = "walkToWork";
        }
        break;
      case "walkHome":
        if (this.advance(v)) {
          v.fsm = "idle";
        }
        break;
    }
    void ctx;
  }

  /** Try to assign an idle villager to the nearest open connected workplace. */
  private assign(v: VillagerComponent): void {
    const state = this.state;
    let best: BuildingEntity | null = null;
    let bestDist = Infinity;
    for (const entity of state.buildingWorld.query("building")) {
      const id = entity.id;
      if (id === undefined) continue;
      const rs = state.buildingState.get(id);
      if (rs === undefined || !rs.connected) continue;
      const def = getProductionDef(entity.building.type);
      if (def === undefined || def.workerSlots <= 0) continue;
      if (rs.workerCount >= def.workerSlots) continue;
      const b = entity.building;
      const cx = b.x + Math.floor(b.w / 2);
      const cy = b.y + Math.floor(b.h / 2);
      const d = Math.abs(cx - v.homeX) + Math.abs(cy - v.homeY);
      // Tie-break on id (deterministic) via the dist-only comparison + iteration order.
      if (d < bestDist) {
        bestDist = d;
        best = entity;
      }
    }
    if (best === null) return;
    const id = best.id;
    if (id === undefined) return;
    const rs = state.buildingState.get(id);
    if (rs === undefined) return;
    rs.workerCount++;
    const b = best.building;
    v.workX = b.x + Math.floor(b.w / 2);
    v.workY = b.y + Math.floor(b.h / 2);
    // Find a store (first connected storehouse) to haul to.
    const store = this.firstStore();
    if (store !== null) {
      v.storeX = store.x;
      v.storeY = store.y;
    } else {
      v.storeX = v.workX;
      v.storeY = v.workY;
    }
    this.planPath(v, v.homeX, v.homeY, v.workX, v.workY);
    v.fsm = "walkToWork";
  }

  private firstStore(): { x: number; y: number } | null {
    for (const entity of this.state.buildingWorld.query("building")) {
      const def = getProductionDef(entity.building.type);
      if (def?.isStorage === true) {
        const b = entity.building;
        return { x: b.x + Math.floor(b.w / 2), y: b.y + Math.floor(b.h / 2) };
      }
    }
    return null;
  }

  private buildingAt(tx: number, ty: number): BuildingEntity | null {
    for (const entity of this.state.buildingWorld.query("building")) {
      const b = entity.building;
      if (tx >= b.x && tx < b.x + b.w && ty >= b.y && ty < b.y + b.h) return entity;
    }
    return null;
  }

  /** Compute a BFS path and load it into the villager. Falls back to teleport. */
  private planPath(v: VillagerComponent, fromX: number, fromY: number, toX: number, toY: number): void {
    const state = this.state;
    const path = bfsPath(
      fromX,
      fromY,
      toX,
      toY,
      (tx, ty) => villagerWalkable(state, tx, ty),
      state.width,
      state.height,
    );
    v.pathStep = 0;
    if (path === null || path.length === 0) {
      // No road route — snap directly (degenerate path of one step at target).
      v.pathX = [toX];
      v.pathY = [toY];
      return;
    }
    v.pathX = path.map((p) => p.x);
    v.pathY = path.map((p) => p.y);
  }

  /** Advance one step along the path. Returns true when the path is exhausted. */
  private advance(v: VillagerComponent): boolean {
    if (v.pathStep >= v.pathX.length) return true;
    v.pathStep++;
    return v.pathStep >= v.pathX.length;
  }
}

/** Current villager position (last reached path tile, else home). */
export function villagerPos(v: VillagerComponent): { x: number; y: number } {
  if (v.pathStep > 0 && v.pathStep <= v.pathX.length) {
    return { x: v.pathX[v.pathStep - 1]!, y: v.pathY[v.pathStep - 1]! };
  }
  if (v.fsm === "idle" || v.fsm === "walkToWork") {
    return { x: v.homeX, y: v.homeY };
  }
  return { x: v.workX, y: v.workY };
}
