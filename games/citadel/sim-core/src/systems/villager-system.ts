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
import type { BuildingEntity, GoodType } from "../entities/building";
import type { VillagerComponent } from "../entities/villager";
import type { SimState } from "../sim-state";
import { villagerWalkable, playerById } from "../sim-state";
import { scaleTicks } from "../pacing";

/**
 * Wave 3.5 — the glut threshold, in days-of-supply, above which a producer's OUTPUT
 * good counts as "already abundant". A SECOND worker on such a producer is wasted
 * labour — it piles more of a good the town is drowning in while a scarcer good (bread)
 * goes unproduced. So an arrival is steered PAST a glutted producer toward the scarce
 * bottleneck (an idle bakery). This is what breaks the pop-6-7 attractor: without it a
 * town's arrivals staff a second farm/mill (grain/flour glut to 500+) instead of the
 * second bakery, so bread throughput never rises and every arrival eventually starves
 * (the P1 deadlock — see immigration.ts). Bounded to already-staffed types (bootstrap's
 * first-of-type is never skipped) with a no-skip fallback pass (a villager never idles
 * when every producer is glutted). At pop 7 the threshold is 7×8 = 56, so grain 500 and
 * flour 74 are skipped while bread 0 is not.
 */
const GLUT_WORKER_DAYS = 8;
import { bfsPath } from "../world/pathfinder";

/**
 * Ticks a villager spends "working" before hauling output to a store, authored at
 * BASELINE_TICKS_PER_DAY. Re-denominated per {@link scaleTicks} at the sim's
 * ticksPerDay so the hauler's dwell keeps the SAME fraction of a day — otherwise a
 * longer day would make haulers cycle far more often relative to production,
 * emptying buffers unnaturally and inflating the sustained-service bonus (brief
 * 100). Villager MOVEMENT stays 1 tile/tick (walks just become a smaller slice of
 * the scaled dwell — haulers reach work/store comfortably within a day).
 */
const WORK_TICKS = 5;

/**
 * Max replans drained per tick. Bounds the per-tick BFS cost so a siege-time
 * mass road-break can't spike a single frame; over-budget villagers stay queued
 * and retry on a later tick. Measured comfortable at Town tier — bump if Town's
 * hauler count grows substantially.
 */
const REPLAN_BUDGET_PER_TICK = 8;

/**
 * Audit-09: static per-building classification cached for `assign()`'s
 * candidate scan. Deliberately excludes `workerCount`/`connected` — those
 * stay mutable per-tick facts read LIVE via `state.buildingState.get(id)` at
 * use time, never cached. That is what lets the cache invalidate on a plain
 * building-count watermark (mirrors `FireSystem`'s `FireDailyIndex`, commit
 * 892844e) without also needing a hook at every `workerCount` mutation site
 * (`assign()`'s own `rs.workerCount++` and `removeOneVillager`'s `rs.workerCount--`
 * in sim-state.ts, both outside this file for the increment/decrement to matter):
 * since the count itself is never cached, both sites are already correct by
 * construction. See `getCandidates` for the full invalidation argument.
 */
interface AssignCandidate {
  readonly id: number;
  readonly ownerId: number;
  readonly type: string;
  readonly cx: number;
  readonly cy: number;
  readonly workerSlots: number;
  readonly outputGood: GoodType | undefined;
}

/** The four `[wantGoods, wantPrimary]` buckets `getCandidates()` groups by. */
type TierBucketKey = "GP" | "GC" | "SP" | "SC";

function tierBucketKey(wantGoods: boolean, wantPrimary: boolean): TierBucketKey {
  return wantGoods ? (wantPrimary ? "GP" : "GC") : (wantPrimary ? "SP" : "SC");
}

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

  /**
   * Audit-09: sim day on which an idle villager's most recent `assign()` call
   * FAILED (no open slot found anywhere), keyed by villager id. A villager
   * absent from this map — never yet attempted, or its last attempt
   * SUCCEEDED (the entry is deleted on success below) — always attempts on
   * its very next idle tick, exactly like today: only a REPEAT try after a
   * failure is throttled, to once per sim day, so a permanently-unplaceable
   * villager's ~17-scan search no longer reruns every tick forever. Instance
   * state, not serialized: `loadFromSave` replays the command log through a
   * fresh bootstrap, so this reconstructs identically from the same tick
   * sequence (mirrors `pendingReplan` above).
   */
  private readonly lastFailedAssignDay = new Map<number, number>();

  /**
   * Audit-09 candidate cache (see {@link AssignCandidate}), keyed by the four
   * `[wantGoods, wantPrimary]` buckets. `null` until first built.
   */
  private candidatesCache: Map<TierBucketKey, AssignCandidate[]> | null = null;

  /**
   * The `buildingWorld` "building"-query live entity count as of the last
   * `candidatesCache` rebuild. -1 = never built. See `getCandidates`.
   */
  private buildingCountWatermark = -1;

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
      case "idle": {
        // Audit-09 backoff: skip the retry entirely if this villager already
        // failed to place TODAY — see `lastFailedAssignDay`. A villager whose
        // last (or only) attempt was on an earlier day, or who has never
        // attempted, always proceeds — so a freshly-idled villager (e.g. via
        // `releaseWorkersAt`) is never delayed by a stale entry from a
        // previous idle spell.
        if (this.lastFailedAssignDay.get(v.id) === this.state.day) break;
        if (this.assign(v)) {
          this.lastFailedAssignDay.delete(v.id);
        } else {
          this.lastFailedAssignDay.set(v.id, this.state.day);
        }
        break;
      }
      case "walkToWork":
        if (this.advance(v)) {
          v.fsm = "work";
          v.ticksAtWork = 0;
        }
        break;
      case "work":
        v.ticksAtWork++;
        if (v.ticksAtWork >= scaleTicks(WORK_TICKS, this.state.ticksPerDay)) {
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
  private assign(v: VillagerComponent): boolean {
    const state = this.state;

    // Audit-09: was a full `buildingWorld.query("building")` scan (every road
    // tile included) here PLUS one per tier per pass below — see `getCandidates`.
    const staffedTypes = this.computeStaffedTypes(v.ownerId);

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

    // Wave 3.5: the town's stockpile, for the glut-skip. A SECOND worker is not put on a
    // producer whose output good the town already has in abundance — the arrival is sent
    // to the scarce bottleneck instead (see GLUT_WORKER_DAYS). Two passes: the first
    // skips glutted already-staffed producers; if that leaves the villager unplaced (every
    // candidate was glutted), the second pass ignores the glut so it never idles for it.
    const owner = playerById(state, v.ownerId);
    if (this.tryAssignPass(v, staffedTypes, tiers, owner, true)) return true;
    // No open slot found anywhere — remain idle.
    return this.tryAssignPass(v, staffedTypes, tiers, owner, false);
  }

  /**
   * Audit-09: which of the villager's own building TYPES have at least one
   * worker (`workerCount > 0`). Scans only the cached candidate buckets
   * (buildings with `workerSlots > 0`) instead of every `buildingWorld`
   * entity (which also holds one per road tile). Safe to narrow the scan this
   * way: `workerCount` is only ever incremented here in `tryAssignPass`
   * (gated on `rs.workerCount < def.workerSlots`, so only reachable when
   * `workerSlots >= 1`) or decremented in `sim-state.ts`'s `removeOneVillager`
   * (which only decrements an already-positive count on a building a villager
   * was actually stationed at, i.e. one that was staffed the same way) — no
   * site sets `workerCount` on a `workerSlots <= 0` building (a road, a house,
   * …), so the set of types this can ever add is identical to the original
   * unfiltered scan's. `Set` membership doesn't care about insertion order,
   * so this needs no order-preservation argument (unlike `tryAssignPass`).
   */
  private computeStaffedTypes(ownerId: number): Set<string> {
    const state = this.state;
    const staffed = new Set<string>();
    for (const bucket of this.getCandidates().values()) {
      for (const c of bucket) {
        if (c.ownerId !== ownerId) continue;
        const rs = state.buildingState.get(c.id);
        if (rs !== undefined && rs.workerCount > 0) staffed.add(c.type);
      }
    }
    return staffed;
  }

  /**
   * Audit-09 candidate cache. Builds (or reuses) the static per-building
   * classification `tryAssignPass` scans, bucketed by `[wantGoods,
   * wantPrimary]` — the two top discriminators every tier is keyed on — so a
   * tier pass only iterates buildings that could possibly match instead of
   * re-filtering the whole `buildingWorld` (including every road tile) 8
   * times per pass.
   *
   * Invalidation: a plain watermark on the buildingWorld's live "building"
   * entity count (same technique as `FireSystem`'s `FireDailyIndex`, commit
   * 892844e) — any placement or demolish changes that count and forces a full
   * rebuild on the very next read. This is EXACT here (stronger than
   * FireSystem's documented same-tick-place+despawn gap): the only building
   * facts this cache holds are ones that are fixed for the building's whole
   * lifetime (id, ownerId, type, footprint centre, workerSlots, outputGood —
   * none of these are ever mutated post-placement), so the cache can only go
   * stale by a building appearing or disappearing, which the count watermark
   * catches unconditionally. `workerCount`/`connected` are NEVER cached —
   * every read goes through `state.buildingState.get(id)` live at call time
   * (an O(1) map lookup) — so a worker-slot filling/freeing or a road
   * connecting/breaking is visible immediately, with no invalidation needed
   * for it at all.
   *
   * Order-preservation: each bucket is appended to in the SAME order this
   * function's single `buildingWorld.query("building")` pass encounters
   * entities, filtered only by `[wantGoods, wantPrimary]` plus the
   * `id`/`def`/`workerSlots` checks the original per-tier scan ALSO applied
   * before ever comparing `wantGoods`/`wantPrimary` — so a bucket's contents,
   * in order, are exactly what the original scan would have yielded up to
   * that point for that tier's top two discriminators. `tryAssignPass` below
   * applies the remaining per-tier filters (ownerId, connected, open slot,
   * staffed/glut) as it walks the bucket, in the same order it always did —
   * an AND of independent conditions applied in a different order selects
   * the identical SET, and iterating that set in the bucket's (= the original
   * scan's) order preserves the exact "first-seen wins ties" distance
   * tie-break `tryAssignPass` depends on.
   */
  private getCandidates(): ReadonlyMap<TierBucketKey, readonly AssignCandidate[]> {
    const state = this.state;
    const liveCount = state.buildingWorld.query("building").entities.length;
    if (this.candidatesCache === null || liveCount !== this.buildingCountWatermark) {
      this.buildingCountWatermark = liveCount;
      const cache = new Map<TierBucketKey, AssignCandidate[]>([
        ["GP", []], ["GC", []], ["SP", []], ["SC", []],
      ]);
      for (const entity of state.buildingWorld.query("building")) {
        const id = entity.id;
        if (id === undefined) continue;
        const b = entity.building;
        const def = getProductionDef(b.type);
        if (def === undefined || def.workerSlots <= 0) continue;
        const producesGoods = def.outputGood !== undefined || def.inputGood !== undefined;
        const isPrimary = def.inputGood === undefined;
        const bucket = cache.get(tierBucketKey(producesGoods, isPrimary));
        bucket?.push({
          id,
          ownerId: b.ownerId,
          type: b.type,
          cx: b.x + Math.floor(b.w / 2),
          cy: b.y + Math.floor(b.h / 2),
          workerSlots: def.workerSlots,
          outputGood: def.outputGood,
        });
      }
      this.candidatesCache = cache;
    }
    return this.candidatesCache;
  }

  /**
   * One assignment attempt over the tier ladder. `skipGlut` steers a SECOND worker away
   * from a producer whose output good is already abundant (bounded to already-staffed
   * types so bootstrap is untouched). Returns true iff the villager was assigned.
   *
   * Audit-09: each tier now walks only its `[wantGoods, wantPrimary]` bucket from
   * `getCandidates()` instead of re-filtering the whole `buildingWorld` (including
   * every road tile) — see that method's doc comment for the order-preservation
   * argument this relies on. `workerCount`/`connected` are read LIVE off
   * `state.buildingState.get(c.id)` exactly as before (never cached), so a slot that
   * filled or a road that connected/broke earlier this same tier-pass, or on a
   * previous call, is always seen correctly.
   */
  private tryAssignPass(
    v: VillagerComponent,
    staffedTypes: Set<string>,
    tiers: ReadonlyArray<readonly [boolean, boolean, boolean]>,
    owner: ReturnType<typeof playerById>,
    skipGlut: boolean,
  ): boolean {
    const state = this.state;
    const candidates = this.getCandidates();
    for (const [wantGoods, wantPrimary, wantUnstaffedType] of tiers) {
      const bucket = candidates.get(tierBucketKey(wantGoods, wantPrimary)) ?? [];
      let best: AssignCandidate | null = null;
      let bestDist = Infinity;
      for (const c of bucket) {
        // Citadel 38 P1#5: a villager only staffs its OWN player's buildings. Solo no-op.
        if (c.ownerId !== v.ownerId) continue;
        const rs = state.buildingState.get(c.id);
        if (rs === undefined || !rs.connected) continue;
        if (rs.workerCount >= c.workerSlots) continue;
        const typeStaffed = staffedTypes.has(c.type);
        if (wantUnstaffedType !== !typeStaffed) continue;
        // Glut-skip: a SECOND worker on an already-stocked producer is wasted labour.
        // Only for already-staffed types (bootstrap's first-of-type always staffs) and
        // only on the first pass (the fallback pass ignores it so nobody idles for it).
        if (
          skipGlut &&
          typeStaffed &&
          c.outputGood !== undefined &&
          owner !== undefined &&
          owner.stockpiles[c.outputGood] >= GLUT_WORKER_DAYS * Math.max(1, owner.population)
        ) {
          continue;
        }
        const d = Math.abs(c.cx - v.homeX) + Math.abs(c.cy - v.homeY);
        if (d < bestDist) {
          bestDist = d;
          best = c;
        }
      }
      if (best !== null) {
        const rs = state.buildingState.get(best.id);
        if (rs === undefined) return false;
        rs.workerCount++;
        v.workX = best.cx;
        v.workY = best.cy;
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
        return true;
      }
    }
    return false;
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
