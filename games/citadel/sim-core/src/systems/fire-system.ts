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
import { getProductionDef, coversRect, effectiveHousingCapacity } from "../entities/building";
import { countNonRoadBuildings } from "./tiers";
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

/** Interlock: a burning building suppresses output of neighbours within this radius. */
const FIRE_SUPPRESS_RADIUS = 2;

/**
 * Cozy pivot: extra burnTicksLeft decrement (on top of the normal -1/tick) for a
 * burning building whose centre is covered by a well, so a well visibly speeds
 * recovery instead of just gating ignition/spread odds. Integer, deterministic.
 */
const COZY_WELL_EXTINGUISH_BONUS = 2;

/**
 * Cozy pivot: per-day mood dent applied to a house within fire-radius of an
 * active blaze (radius = the well's own coverage rect, reused as the cure's
 * reach). A one-time daily subtraction; Phase B's asymmetric ease recovers it
 * once the fire is out. Clamped >= 0, applied once per day.
 */
const COZY_FIRE_MOOD_DENT = 8;

export class FireSystem implements System {
  readonly name = "FireSystem";

  private lastDay = -1;
  private readonly baseRng: Rng;
  private readonly rivalBase: Rng;
  private readonly perPlayerRng = new Map<number, Rng>();
  // Per-player founding grace: the first observed day this player owned any
  // building. Ignition is suppressed for a short window after it so a player's
  // starter cluster can't spontaneously combust before they've had any chance to
  // react (space it out, drop a well). The live client runs the sim through the
  // multi-second page/WebGPU boot, so without this a freshly-built starter town
  // could already be on fire the moment the player first sees the map (playtest
  // P2, 2026-06-27). Density still drives fire after the grace; an unpopulated
  // built district still burns (the grace is temporal, not population-gated).
  private readonly firstBuildDay = new Map<number, number>();

  /**
   * Cozy-pivot Phase D threat-demotion flag. `true` (default): a burning building
   * smoulders then EXTINGUISHES (never destroyed), a nearby well speeds it out, and
   * an active fire dents nearby houses' mood. `false`: today's exact destructive
   * path (burn-out → `_destroyBuilding`), byte-identical.
   */
  private readonly cozy: boolean;

  /**
   * Cozy cold-open threat-defer (Chunk 2). When > 0, fresh ignition is suppressed
   * for a player until they own at least this many non-road buildings — so the
   * seeded starter core (5 structures) can't catch fire before the player has
   * added one of their own. 0 (default) = disabled = today's exact behavior; the
   * gate short-circuits BEFORE any RNG draw so the sequence is untouched.
   */
  private readonly deferUntilBuildings: number;

  constructor(private readonly state: SimState, opts: { cozy?: boolean; deferUntilBuildings?: number } = {}) {
    this.cozy = opts.cozy ?? true;
    this.deferUntilBuildings = opts.deferUntilBuildings ?? 0;
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

  /** True once `p` owns at least one building (any type). */
  private ownsAnyBuilding(p: PlayerState): boolean {
    for (const entity of this.state.buildingWorld.query("building")) {
      if (entity.building.ownerId === p.id) return true;
    }
    return false;
  }

  /**
   * Founding grace: no fresh ignition for the first few days after a player's
   * first building, so a starter cluster can't burn before the player has had a
   * chance to react. Window mirrors the immigration founding window
   * (floor(daysPerYear/4)+2). Spread is unaffected (handled in run()).
   */
  private inFoundingGrace(p: PlayerState): boolean {
    const start = this.firstBuildDay.get(p.id);
    if (start === undefined) return true; // no buildings yet → nothing to ignite anyway
    const graceDays = Math.floor(this.state.daysPerYear / 4) + 2;
    return this.state.day - start <= graceDays;
  }

  /**
   * Cozy cold-open defer: true while fresh ignition should be held off because
   * the player's town hasn't grown past its seeded core yet. Disabled (returns
   * false) when the threshold is 0, short-circuiting BEFORE any building scan or
   * RNG draw so the default path is byte-identical to today.
   */
  private ignitionDeferred(p: PlayerState): boolean {
    if (this.deferUntilBuildings <= 0) return false;
    return countNonRoadBuildings(this.state, p.id) < this.deferUntilBuildings;
  }

  run(ctx: SimContext): void {
    // Advance burn timers every tick (per player).
    for (const p of this.state.players) this._tickBurning(p, ctx.tick);
    // Daily: ignition + spread checks (per player, stable id order).
    if (this.state.day === this.lastDay) return;
    this.lastDay = this.state.day;
    for (const p of this.state.players) {
      // Record the first day this player has any building (founding-grace anchor).
      if (!this.firstBuildDay.has(p.id) && this.ownsAnyBuilding(p)) {
        this.firstBuildDay.set(p.id, this.state.day);
      }
      // Spread is always allowed (a fire already underway must propagate); only
      // fresh ignition is held off during the founding grace.
      this._spreadFire(p);
      // Cozy cold-open: hold off fresh ignition until the town has grown past its
      // seeded core (composes with the temporal founding grace). Spread of an
      // already-burning fire above is unaffected — matches the founding-grace comment.
      if (!this.inFoundingGrace(p) && !this.ignitionDeferred(p)) this._checkIgnition(p);
      // Cozy pivot: once per day, dent the mood of houses near an active fire
      // instead of ever destroying anything (see _tickBurning for the
      // extinguish-not-destroy half of the contract).
      if (this.cozy) this._dentNearbyMood(p);
    }
  }

  /**
   * Cozy pivot: subtract COZY_FIRE_MOOD_DENT from the mood of every one of p's
   * HOUSES whose centre falls within a burning building's cure-radius (the
   * well's own coverage rect, reused as the fire's "dent" radius). Pure
   * arithmetic, clamped >= 0, called at most once per day per player from the
   * daily branch of run() (same guard as ignition/spread).
   */
  private _dentNearbyMood(p: PlayerState): void {
    const state = this.state;
    const burningCentres: Array<{ x: number; y: number }> = [];
    for (const entity of state.buildingWorld.query("building")) {
      if (entity.building.ownerId !== p.id) continue;
      const id = entity.id;
      if (id === undefined) continue;
      const fs = p.fireState.get(id);
      if (fs?.burning !== true) continue;
      const b = entity.building;
      burningCentres.push({ x: b.x + Math.floor(b.w / 2), y: b.y + Math.floor(b.h / 2) });
    }
    if (burningCentres.length === 0) return;

    for (const entity of state.buildingWorld.query("building")) {
      if (entity.building.ownerId !== p.id) continue;
      if (entity.building.type !== "house") continue;
      const id = entity.id;
      if (id === undefined) continue;
      const b = entity.building;
      const hcx = b.x + Math.floor(b.w / 2);
      const hcy = b.y + Math.floor(b.h / 2);
      const nearFire = burningCentres.some((c) => coversRect("well", c.x, c.y, hcx, hcy));
      if (!nearFire) continue;
      const rs = state.buildingState.get(id);
      if (rs === undefined) continue;
      rs.mood = Math.max(0, (rs.mood ?? 40) - COZY_FIRE_MOOD_DENT);
    }
  }

  /**
   * Advance burn timers. cozy=false: destroy the building when the timer
   * expires (unchanged legacy path). cozy=true: the building still smoulders
   * (workerCount=0 throttle + neighbour suppression below are the cozy
   * "slowdown"), a nearby well burns it out faster, and at 0 it's EXTINGUISHED
   * — fire clears, nothing is destroyed/despawned/decremented.
   */
  private _tickBurning(p: PlayerState, tick: number): void {
    const state = this.state;
    const toDestroy: number[] = [];
    const toExtinguish: number[] = [];
    const burningCentres: Array<{ x: number; y: number }> = [];
    for (const entity of state.buildingWorld.query("building")) {
      if (entity.building.ownerId !== p.id) continue;
      const id = entity.id;
      if (id === undefined) continue;
      const fs = p.fireState.get(id);
      if (fs === undefined || !fs.burning) continue;
      // Suppress production while burning.
      const rs = state.buildingState.get(id);
      if (rs !== undefined) rs.workerCount = 0;
      const b = entity.building;
      const bcx = b.x + Math.floor(b.w / 2);
      const bcy = b.y + Math.floor(b.h / 2);
      burningCentres.push({ x: bcx, y: bcy });
      // Cozy pivot: a well near this building's centre burns it out faster —
      // an extra deterministic step on top of the normal -1/tick decay.
      let decay = 1;
      if (this.cozy && this._hasWellNear(p, bcx, bcy)) decay += COZY_WELL_EXTINGUISH_BONUS;
      fs.burnTicksLeft = Math.max(0, fs.burnTicksLeft - decay);
      if (fs.burnTicksLeft === 0) {
        if (this.cozy) {
          // Extinguish, don't destroy: clear the fire flag only. No despawn, no
          // popCap loss, no tile/road clearing — `destroyed` stays false.
          toExtinguish.push(id);
        } else {
          fs.destroyed = true;
          toDestroy.push(id);
        }
      }
    }
    // Interlock (burning → adjacent suppression): a fire doesn't just halt its own
    // building — workers flee the neighbours too. Zero the workerCount of any of
    // p's non-burning buildings within FIRE_SUPPRESS_RADIUS of a burning one this
    // tick (re-staffed naturally by VillagerSystem once the fire is out).
    if (burningCentres.length > 0) {
      for (const entity of state.buildingWorld.query("building")) {
        if (entity.building.ownerId !== p.id) continue;
        const id = entity.id;
        if (id === undefined) continue;
        const fs = p.fireState.get(id);
        if (fs?.burning === true) continue; // already zeroed above
        const b = entity.building;
        const cx = b.x + Math.floor(b.w / 2);
        const cy = b.y + Math.floor(b.h / 2);
        for (const c of burningCentres) {
          if (Math.abs(cx - c.x) + Math.abs(cy - c.y) <= FIRE_SUPPRESS_RADIUS) {
            const rs = state.buildingState.get(id);
            if (rs !== undefined) rs.workerCount = 0;
            break;
          }
        }
      }
    }
    for (const id of toDestroy) {
      this._destroyBuilding(p, id, tick);
    }
    for (const id of toExtinguish) {
      this._extinguishBuilding(p, id);
    }
  }

  /**
   * Cozy pivot: clear a burnt-out building's fire state without destroying it —
   * the building, its tiles, popCap, and roadGrid entry are all untouched.
   */
  private _extinguishBuilding(p: PlayerState, id: number): void {
    const state = this.state;
    const fs = p.fireState.get(id);
    if (fs === undefined) return;
    fs.burning = false;
    fs.burnTicksLeft = 0;
    const b = this._entityById(id);
    if (b !== null) pushEvent(state, `Day ${state.day}: the fire in a ${b.type} was put out.`);
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
    // Copy branches on cozy (mechanics already do): in cozy mode a fire is a
    // tended, self-settling hearth (it smoulders, never razes — see burn-out
    // path above), so the toast reads as a recoverable nudge toward a well, not
    // a loss (decisions #3 diegetic-calm, #5/#9 recoverable-never-a-cliff). The
    // sharp strings stay verbatim under cozy=false — Challenge-mode regression
    // guards match on "caught fire"/"fire spread" (defer-threats.test.ts). Note
    // the cozy branch drops the word "fire" from ignition/spread; the cozy fire
    // tests still find a "fire" event via the un-gated extinguish message (_extinguish-
    // Building: "the fire in a … was put out"), not via these strings.
    const msg = this.cozy
      ? (cause === "ignition"
          ? `Day ${state.day}: a ${type} hearth is smouldering — a well nearby would settle it.`
          : `Day ${state.day}: the smoulder drifted to a ${type} — keep a well close.`)
      : (cause === "ignition"
          ? `Day ${state.day}: a ${type} caught fire!`
          : `Day ${state.day}: fire spread to a ${type}!`);
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

  /**
   * Check if a Well owned by p covers position (cx, cy). A well's reach is an
   * 8×6 RECTANGLE centred on the well (see SERVICE_RECTS / coversRect), not a
   * Manhattan radius.
   */
  private _hasWellNear(p: PlayerState, cx: number, cy: number): boolean {
    for (const entity of this.state.buildingWorld.query("building")) {
      if (entity.building.ownerId !== p.id) continue;
      if (entity.building.type !== "well") continue;
      const b = entity.building;
      const wx = b.x + Math.floor(b.w / 2);
      const wy = b.y + Math.floor(b.h / 2);
      if (coversRect("well", wx, wy, cx, cy)) return true;
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

/** Wooden building types (exported for the raid→fire interlock). */
export const FIRE_WOODEN_TYPES: ReadonlySet<string> = WOODEN_TYPES;
/** Burn duration in ticks (exported so the raid→fire interlock matches fire spread). */
export const FIRE_BURN_TICKS = BURN_TICKS;

/**
 * Interlock helper (siege→fire): ignite a wooden building by ECS id if it isn't
 * already burning/destroyed. Returns true if it newly caught. Used by
 * applyRaidDamage so a siege can set a building alight (wells/firebreaks become
 * tactical). Mirrors FireSystem._igniteBuilding's fireState bookkeeping.
 */
export function igniteBuildingById(state: SimState, p: PlayerState, id: number, type: string): boolean {
  let fs = p.fireState.get(id);
  if (fs === undefined) {
    fs = { burning: false, burnTicksLeft: 0, destroyed: false };
    p.fireState.set(id, fs);
  }
  if (fs.burning || fs.destroyed) return false;
  fs.burning = true;
  fs.burnTicksLeft = BURN_TICKS;
  pushEvent(state, `Day ${state.day + 1}: raiders set a ${type} ablaze!`);
  return true;
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
