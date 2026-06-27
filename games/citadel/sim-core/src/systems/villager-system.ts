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
import { villagerWalkable, playerById } from "../sim-state";
import { bfsPath } from "../world/pathfinder";

/** Ticks a villager spends "working" before hauling output to a store. */
const WORK_TICKS = 5;

/**
 * Max replans drained per tick. Bounds the per-tick BFS cost so a siege-time
 * mass road-break can't spike a single frame; over-budget villagers stay queued
 * and retry on a later tick. Measured comfortable at Town tier — bump if Town's
 * hauler count grows substantially.
 */
const REPLAN_BUDGET_PER_TICK = 8;

export class VillagerSystem implements System {
  readonly name = "VillagerSystem";

  /**
   * Ids of villagers whose immediate next path tile became non-walkable (road
   * demolished/burned mid-haul). Drained FIFO-by-id (sorted ascending) at the
   * end of run() — NOT in ECS query order — which is the load-bearing
   * determinism rule. Instance state (not serialized): loadFromSave replays the
   * command log through a fresh bootstrap, reconstructing this set identically.
   */
  private readonly pendingReplan = new Set<number>();

  constructor(private readonly state: SimState) {}

  run(ctx: SimContext): void {
    const state = this.state;
    for (const entity of state.villagerWorld.query("villager")) {
      this.step(entity.villager, ctx);
    }
    this.drainReplans();
  }

  /**
   * Recompute paths for villagers flagged by next-step detection. Drains the
   * pending set in ascending villager-id order (deterministic, independent of
   * ECS iteration order) up to REPLAN_BUDGET_PER_TICK per tick. A successful
   * replan installs the new path and removes the villager from the queue; a
   * no-route result leaves the villager in place (it HOLDS — never teleports)
   * and stays queued to retry when a road may be rebuilt.
   */
  private drainReplans(): void {
    if (this.pendingReplan.size === 0) return;
    // Map id -> villager for the ids currently queued.
    const byId = new Map<number, VillagerComponent>();
    for (const entity of this.state.villagerWorld.query("villager")) {
      if (this.pendingReplan.has(entity.villager.id)) byId.set(entity.villager.id, entity.villager);
    }
    // Drop any queued ids that no longer correspond to a living villager.
    for (const id of [...this.pendingReplan]) {
      if (!byId.has(id)) this.pendingReplan.delete(id);
    }
    const sortedIds = [...this.pendingReplan].sort((a, b) => a - b);
    let budget = REPLAN_BUDGET_PER_TICK;
    for (const id of sortedIds) {
      if (budget <= 0) break;
      const v = byId.get(id);
      if (v === undefined) {
        this.pendingReplan.delete(id);
        continue;
      }
      budget--;
      const target = this.fsmTarget(v);
      if (target === null) {
        // No meaningful target for the current FSM state — stop tracking.
        this.pendingReplan.delete(id);
        continue;
      }
      const pos = villagerPos(v);
      const route = this.replanRoute(pos.x, pos.y, target.x, target.y);
      if (route === null) {
        // Disconnected: HOLD in place (keep cargo), stay queued, retry later.
        continue;
      }
      // Prepend the current tile so villagerPos stays continuous (pathStep=1
      // points at the current position, not a stale home/work fallback) and the
      // next advance() peeks the first new route tile. bfsPath excludes the
      // start, so route[0] is already one tile away from pos.
      v.pathX = [pos.x, ...route.x];
      v.pathY = [pos.y, ...route.y];
      v.pathStep = 1;
      this.pendingReplan.delete(id);
    }
  }

  /** The destination tile for the villager's current movement FSM state, or null. */
  private fsmTarget(v: VillagerComponent): { x: number; y: number } | null {
    switch (v.fsm) {
      case "walkToWork":
        return { x: v.workX, y: v.workY };
      case "haulToStore":
        return { x: v.storeX, y: v.storeY };
      case "walkHome":
        return { x: v.homeX, y: v.homeY };
      default:
        return null;
    }
  }

  /** Compute a BFS route; returns parallel arrays, or null if no route exists. */
  private replanRoute(
    fromX: number,
    fromY: number,
    toX: number,
    toY: number,
  ): { x: number[]; y: number[] } | null {
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
    if (path === null || path.length === 0) return null;
    return { x: path.map((p) => p.x), y: path.map((p) => p.y) };
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
          // Deposit carried goods into the OWNER's stockpile (Citadel 28). This
          // is the load-bearing step — goods only enter the economy via this
          // deposit.
          if (v.carryGood !== null && v.carryAmount > 0) {
            const owner = playerById(this.state, v.ownerId);
            if (owner !== undefined) owner.stockpiles[v.carryGood] += v.carryAmount;
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
   * Assignment priority (nearest within each tier wins). The TOP discriminator
   * is whether a building produces/converts GOODS (a farm, mill, bakery,
   * woodcutter, refiner) versus a pure SERVICE (chapel/market/watchpost/tower/…,
   * which have a worker slot but no inputGood/outputGood): the goods chain — the
   * town's food supply — must be fully staffed before a villager mans a service,
   * or with limited population the services siphon labour off the bread chain and
   * the town starves into a death-spiral (playtest P1/P2). Within each goods/
   * service group: primary producers first, then converters, then 2nd+ workers —
   * so each type gets its first worker before any type gets a second.
   *   1. goods, primary, type unstaffed        5. service, primary, type unstaffed
   *   2. goods, converter, type unstaffed       6. service, converter, type unstaffed
   *   3. goods, primary, open slot              7. service, primary, open slot
   *   4. goods, converter, open slot            8. service, converter, open slot
   */
  private assign(v: VillagerComponent): void {
    const state = this.state;

    // Pre-compute which building types have at least one worker.
    // Citadel 38 P1#5: scope to the villager's OWN buildings — in MP a player's
    // assignment priority must not be perturbed by a rival's staffing, and a
    // villager must never assign to / haul into a rival workplace. Solo no-op.
    const staffedTypes = new Set<string>();
    for (const entity of state.buildingWorld.query("building")) {
      if (entity.building.ownerId !== v.ownerId) continue;
      const id = entity.id;
      if (id === undefined) continue;
      const rs = state.buildingState.get(id);
      if (rs !== undefined && rs.workerCount > 0) staffedTypes.add(entity.building.type);
    }

    // Tiers defined by [wantGoods, wantPrimary, wantUnstaffedType]. Goods-first
    // so the food/production chain always out-prioritises pure services.
    const tiers: Array<[boolean, boolean, boolean]> = [
      [true, true, true],    // goods, primary, type not yet staffed
      [true, false, true],   // goods, converter, type not yet staffed
      [true, true, false],   // goods, primary, type already has workers
      [true, false, false],  // goods, converter, type already has workers
      [false, true, true],   // service, primary, type not yet staffed
      [false, false, true],  // service, converter, type not yet staffed
      [false, true, false],  // service, primary, type already has workers
      [false, false, false], // service, converter, type already has workers
    ];

    for (const [wantGoods, wantPrimary, wantUnstaffedType] of tiers) {
      let best: BuildingEntity | null = null;
      let bestDist = Infinity;
      for (const entity of state.buildingWorld.query("building")) {
        // Citadel 38 P1#5: a villager only staffs its OWN player's buildings. Solo no-op.
        if (entity.building.ownerId !== v.ownerId) continue;
        const id = entity.id;
        if (id === undefined) continue;
        const rs = state.buildingState.get(id);
        if (rs === undefined || !rs.connected) continue;
        const def = getProductionDef(entity.building.type);
        if (def === undefined || def.workerSlots <= 0) continue;
        if (rs.workerCount >= def.workerSlots) continue;
        const producesGoods = def.outputGood !== undefined || def.inputGood !== undefined;
        if (wantGoods !== producesGoods) continue;
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
        const store = this.firstStore(v.ownerId);
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

  private firstStore(ownerId: number): { x: number; y: number } | null {
    for (const entity of this.state.buildingWorld.query("building")) {
      // Citadel 38 P1#5: haul only to your OWN storehouse (MP). Solo no-op.
      if (entity.building.ownerId !== ownerId) continue;
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

  /**
   * Advance one step along the path. Returns true when the path is exhausted.
   *
   * Before stepping, peek the immediate next tile (O(1)). If it became
   * non-walkable mid-haul (road demolished/burned), do NOT advance: flag the
   * villager for a bounded deterministic replan (drained at end of run()) and
   * stay in place this tick. The final tile of a path is the target itself
   * (a building footprint or the goal): bfsPath treats the goal as always
   * enterable, so we exempt the final step from the walkability gate to keep
   * arrivals at building tiles identical to pre-existing behavior.
   */
  private advance(v: VillagerComponent): boolean {
    if (v.pathStep >= v.pathX.length) return true;
    const nextX = v.pathX[v.pathStep]!;
    const nextY = v.pathY[v.pathStep]!;
    const isFinalStep = v.pathStep === v.pathX.length - 1;
    if (!isFinalStep && !villagerWalkable(this.state, nextX, nextY)) {
      // Next tile is blocked and is not the destination — request a replan and
      // hold position this tick (do not walk through the now-blocked tile).
      this.pendingReplan.add(v.id);
      return false;
    }
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
