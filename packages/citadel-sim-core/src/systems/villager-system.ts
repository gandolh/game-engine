/**
 * VillagerSystem — drives villager movement + worker assignment via a per-tick
 * FSM. Villagers are the visible labor layer; they assign themselves to open
 * connected workplaces (incrementing the building's workerCount), walk there
 * along roads/building tiles, "work", then haul the workplace's output buffer
 * to a storehouse where goods enter the global stockpile.
 *
 * Movement is one tile per tick along a precomputed BFS path. All decisions
 * are deterministic (fixed iteration order, no RNG, no wall-clock).
 *
 * The haul cycle is the LOAD-BEARING mechanism for the economy:
 *   1. Villager walks to their assigned workplace (walkToWork).
 *   2. Villager "works" for WORK_TICKS ticks (work state).
 *   3. Villager picks up the building's outputBuffer into carryAmount.
 *   4. Villager walks to the storehouse (haulToStore).
 *   5. On arrival the carryAmount is deposited into state.stockpiles.
 *   6. Villager returns to work (walkToWork loop).
 *
 * If a building has no assigned villager its workerCount stays 0 and
 * ProductionSystem will not run it — so disconnected or unassigned buildings
 * produce nothing.
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

/** Ticks a villager spends "working" before hauling output to a store. */
const WORK_TICKS = 5;

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
          // Pick up the workplace's accumulated output buffer.
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
          // Deposit carried goods into the global stockpile. This is the
          // load-bearing step — goods only enter the economy via this deposit.
          if (v.carryGood !== null && v.carryAmount > 0) {
            this.state.stockpiles[v.carryGood] += v.carryAmount;
          }
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

  /** Try to assign an idle villager to the nearest open connected workplace.
   *
   * Assignment priority (four tiers, nearest within each tier wins):
   *   1. Primary producers (no inputGood) whose type has 0 workers anywhere.
   *   2. Converters (have inputGood) whose type has 0 workers anywhere.
   *   3. Primary producers with open slots (2nd+ worker on a type).
   *   4. Converters with open slots.
   *
   * This ensures each building type gets its first worker before any type
   * gets additional workers, bootstrapping the full production chain with
   * minimal founders.
   */
  private assign(v: VillagerComponent): void {
    const state = this.state;

    // Pre-compute which building types have at least one worker.
    const staffedTypes = new Set<string>();
    for (const entity of state.buildingWorld.query("building")) {
      const id = entity.id;
      if (id === undefined) continue;
      const rs = state.buildingState.get(id);
      if (rs !== undefined && rs.workerCount > 0) staffedTypes.add(entity.building.type);
    }

    // Four tiers (defined by [wantPrimary, wantUnstaffedType]).
    const tiers: Array<[boolean, boolean]> = [
      [true, true],   // primary, type not yet staffed
      [false, true],  // converter, type not yet staffed
      [true, false],  // primary, type already has workers
      [false, false], // converter, type already has workers
    ];

    for (const [wantPrimary, wantUnstaffedType] of tiers) {
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
        const isPrimary = def.inputGood === undefined;
        if (wantPrimary !== isPrimary) continue;
        const typeStaffed = staffedTypes.has(entity.building.type);
        if (wantUnstaffedType !== !typeStaffed) continue;
        const b = entity.building;
        const cx = b.x + Math.floor(b.w / 2);
        const cy = b.y + Math.floor(b.h / 2);
        const d = Math.abs(cx - v.homeX) + Math.abs(cy - v.homeY);
        if (d < bestDist) {
          bestDist = d;
          best = entity;
        }
      }
      if (best !== null) {
        const id = best.id;
        if (id === undefined) return;
        const rs = state.buildingState.get(id);
        if (rs === undefined) return;
        rs.workerCount++;
        const b = best.building;
        v.workX = b.x + Math.floor(b.w / 2);
        v.workY = b.y + Math.floor(b.h / 2);
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
        return;
      }
    }
    // No open slot found anywhere — remain idle.
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
