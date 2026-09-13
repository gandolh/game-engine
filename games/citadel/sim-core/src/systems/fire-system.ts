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
import { pushEvent, releaseWorkersAt } from "../sim-state";
import { getProductionDef, coversRect, effectiveHousingCapacity } from "../entities/building";
import { countNonRoadBuildings } from "./tiers";
import type { Rng } from "@engine/core";
import { createRng } from "@engine/core";
import { scaleTicks } from "../pacing";

/** Building types that are wooden (can burn). Stone/defensive types cannot. */
const WOODEN_TYPES = new Set([
  "house", "farm", "mill", "bakery", "woodcutter", "storehouse",
  "chapel", "market", "watchpost", "tradingpost", "garrison",
]);

/** Building types that are stone/fireproof (act as firebreaks). */
const STONE_TYPES = new Set([
  "quarry", "sawmill", "smith", "mine", "wall", "gate", "tower", "keep",
]);

/**
 * Once-per-day, per-player fire index (perf: see `_buildDailyIndex`).
 * `woodenPositions` preserves the same relative order as a fresh
 * `buildingWorld.query("building")` scan filtered to this owner's wooden
 * buildings; `stoneTiles` is every footprint tile of this owner's stone
 * (fireproof) buildings, for O(1) firebreak lookups. `wellCentres` is every
 * one of this owner's well centres (audit-15: was a fresh O(B)
 * `buildingWorld.query("building")` scan per call to `_hasWellNear`, called
 * per BURNING building per tick — the dominant cost at 8+ concurrent fires).
 * `byId` is an O(1) id→building lookup for this owner's buildings (audit-15:
 * replaces `_entityById`'s O(B) linear scan, called per burning id from
 * `_spreadFire` and every `_extinguishBuilding`).
 *
 * Mid-day invalidation (audit-15 decision — see `_getIndex`): a well built or
 * destroyed mid-day must help/stop-helping starting the very next read, not
 * "tomorrow". `_getIndex` compares the buildingWorld's live "building"-query
 * entity count (an O(1) read of the cached Query's `.entities.length`, no
 * scan) against a watermark taken at the last rebuild; any change drops the
 * cached index for every player, forcing a fresh O(B) rebuild on next use.
 * This is a set-membership heuristic, not an exact diff: a placement and a
 * despawn landing in the exact same inter-check window with equal counts
 * would cancel out and be missed for one extra check. FireSystem has no
 * signal in this file for placement/demolish/siege-destroy events (those
 * live in sim-bootstrap.ts / siege-resolution.ts / army.ts, out of this
 * spec's owned files) short of a full rescan every tick, so this is the
 * cheapest fully self-contained approximation; it is exact for the common
 * case the acceptance test exercises (build one well while a fire burns).
 */
interface FireDailyIndex {
  readonly woodenPositions: ReadonlyArray<{ id: number; type: string; cx: number; cy: number }>;
  readonly stoneTiles: ReadonlySet<number>;
  readonly wellCentres: ReadonlyArray<{ x: number; y: number }>;
  readonly byId: ReadonlyMap<number, { type: string; x: number; y: number; w: number; h: number }>;
}

/**
 * Ticks a building burns before being destroyed/extinguished, authored at
 * BASELINE_TICKS_PER_DAY (60 ticks = 3 days at 20 ticks/day). Re-denominated per
 * {@link scaleTicks} at the sim's ticksPerDay so a fire always burns ~3 DAYS
 * regardless of day length. The per-tick decay (−1/tick, +COZY_WELL_EXTINGUISH_BONUS
 * near a well) scales WITH it, so the well's "burns out ~3× faster" ratio holds.
 */
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

  /**
   * Per-player cached {@link FireDailyIndex}, persisted across ticks within a
   * day (not just within one `_buildDailyIndex` call) so `_tickBurning` —
   * which runs every tick, not just on the daily boundary — can read
   * `wellCentres`/`byId` without rescanning. See `_getIndex`.
   */
  private readonly dailyIndex = new Map<number, FireDailyIndex>();

  /**
   * Mid-day invalidation watermark: the buildingWorld's live "building"-query
   * entity count as of the last index rebuild. -1 = never built. See the
   * {@link FireDailyIndex} doc comment for what this does and doesn't catch.
   */
  private buildingCountWatermark = -1;

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
      // Perf: index this player's wooden-building positions + stone-tile
      // footprints (+ well centres + id map, audit-15) ONCE per day (was: a
      // fresh O(buildings) scan of `buildingWorld.query("building")` for
      // every candidate × line-step pair inside
      // _spreadFire/_checkIgnition/_hasFirebreak — O(n²)-ish once/day).
      // Same filters, same relative order as the scans it replaces, so the
      // sequence of RNG draws below is unchanged (behaviour-preserving).
      // Always rebuilt here regardless of the mid-day watermark (below) —
      // this is the guaranteed once-per-day refresh the watermark only
      // supplements, never replaces.
      const index = this._buildDailyIndex(p);
      this.dailyIndex.set(p.id, index);
      // Spread is always allowed (a fire already underway must propagate); only
      // fresh ignition is held off during the founding grace.
      this._spreadFire(p, index);
      // Cozy cold-open: hold off fresh ignition until the town has grown past its
      // seeded core (composes with the temporal founding grace). Spread of an
      // already-burning fire above is unaffected — matches the founding-grace comment.
      if (!this.inFoundingGrace(p) && !this.ignitionDeferred(p)) this._checkIgnition(p, index);
      // Cozy pivot: once per day, dent the mood of houses near an active fire
      // instead of ever destroying anything (see _tickBurning for the
      // extinguish-not-destroy half of the contract).
      if (this.cozy) this._dentNearbyMood(p);
    }
    // Re-baseline the mid-day invalidation watermark against what every
    // player's index was JUST rebuilt from above, so a placement/despawn
    // that happens later today is measured against today's true count.
    this.buildingCountWatermark = this._liveBuildingCount();
  }

  /** O(1): the cached Query's live entity-array length, no scan. */
  private _liveBuildingCount(): number {
    return this.state.buildingWorld.query("building").entities.length;
  }

  /**
   * Per-player fire index, persisted across ticks (not rebuilt every call).
   * Audit-15 mid-day invalidation: if the buildingWorld's live "building"
   * count has moved since the last rebuild — a placement or a despawn
   * (demolish, siege, army, fire's own extinguish-path never despawns) —
   * drop every player's cached index so the next read gets a fresh O(B)
   * scan instead of stale wells/positions. See the {@link FireDailyIndex}
   * doc comment for exactly what this does and doesn't catch.
   */
  private _getIndex(p: PlayerState): FireDailyIndex {
    const count = this._liveBuildingCount();
    if (count !== this.buildingCountWatermark) {
      this.buildingCountWatermark = count;
      this.dailyIndex.clear();
    }
    let index = this.dailyIndex.get(p.id);
    if (index === undefined) {
      index = this._buildDailyIndex(p);
      this.dailyIndex.set(p.id, index);
    }
    return index;
  }

  /** Per-player, once-per-day fire index: wooden building positions + a stone
   * (firebreak) tile lookup + well centres + an id→building map (audit-15).
   * Built with a single pass over `buildingWorld.query("building")`,
   * filtering ownerId/type the exact same way the scans it replaces did — so
   * the SET and RELATIVE ORDER of wooden candidates is unchanged (the
   * RNG-draw sequence in _spreadFire/_checkIgnition depends on iterating
   * this list, not on how it was built). `wellCentres`/`byId` are new
   * (audit-15) but come from this SAME pass — no extra scan. Neither has an
   * order dependency: `_hasWellNear` only tests set membership (OR of
   * `coversRect` checks) and `byId` is only ever `.get()`, never iterated. */
  private _buildDailyIndex(p: PlayerState): FireDailyIndex {
    const state = this.state;
    const woodenPositions: Array<{ id: number; type: string; cx: number; cy: number }> = [];
    const stoneTiles = new Set<number>();
    const wellCentres: Array<{ x: number; y: number }> = [];
    const byId = new Map<number, { type: string; x: number; y: number; w: number; h: number }>();
    for (const entity of state.buildingWorld.query("building")) {
      if (entity.building.ownerId !== p.id) continue;
      const id = entity.id;
      if (id === undefined) continue;
      const b = entity.building;
      byId.set(id, b);
      if (WOODEN_TYPES.has(b.type)) {
        woodenPositions.push({
          id,
          type: b.type,
          cx: b.x + Math.floor(b.w / 2),
          cy: b.y + Math.floor(b.h / 2),
        });
      } else if (STONE_TYPES.has(b.type)) {
        for (let dy = 0; dy < b.h; dy++) {
          for (let dx = 0; dx < b.w; dx++) {
            stoneTiles.add((b.y + dy) * state.width + (b.x + dx));
          }
        }
      } else if (b.type === "well") {
        wellCentres.push({ x: b.x + Math.floor(b.w / 2), y: b.y + Math.floor(b.h / 2) });
      }
    }
    return { woodenPositions, stoneTiles, wellCentres, byId };
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
    // Audit-15: fetch (or lazily build) this player's cached index ONCE for
    // the whole tick, instead of `_hasWellNear` rescanning `buildingWorld`
    // per burning building below.
    const index = this._getIndex(p);
    for (const entity of state.buildingWorld.query("building")) {
      if (entity.building.ownerId !== p.id) continue;
      const id = entity.id;
      if (id === undefined) continue;
      const rs = state.buildingState.get(id);
      // Ephemeral suppression is recomputed from scratch every tick: clear it on
      // EVERY building first, then re-set it on the burning set (+ neighbours
      // below). This is what lets production resume the tick a fire clears without
      // ever touching the assigned villager — the old code zeroed workerCount here,
      // which minted a ghost worker per burning tick (immigration filled the
      // phantom vacancy while the real worker kept looping).
      if (rs !== undefined) rs.suppressed = false;
      const fs = p.fireState.get(id);
      if (fs === undefined || !fs.burning) continue;
      // Suppress production while burning (flag only — the worker keeps its slot).
      if (rs !== undefined) rs.suppressed = true;
      const b = entity.building;
      const bcx = b.x + Math.floor(b.w / 2);
      const bcy = b.y + Math.floor(b.h / 2);
      burningCentres.push({ x: bcx, y: bcy });
      // Cozy pivot: a well near this building's centre burns it out faster —
      // an extra deterministic step on top of the normal -1/tick decay.
      let decay = 1;
      if (this.cozy && this._hasWellNear(index.wellCentres, bcx, bcy)) decay += COZY_WELL_EXTINGUISH_BONUS;
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
    // building — its neighbours pause too. Flag (not zero) the suppression of any of
    // p's non-burning buildings within FIRE_SUPPRESS_RADIUS of a burning one this
    // tick; the flag clears next tick once the fire is out, and the assigned workers
    // never leave (no ghost workers, no phantom vacancy for immigration to fill).
    if (burningCentres.length > 0) {
      for (const entity of state.buildingWorld.query("building")) {
        if (entity.building.ownerId !== p.id) continue;
        const id = entity.id;
        if (id === undefined) continue;
        const fs = p.fireState.get(id);
        if (fs?.burning === true) continue; // already flagged above
        const b = entity.building;
        const cx = b.x + Math.floor(b.w / 2);
        const cy = b.y + Math.floor(b.h / 2);
        for (const c of burningCentres) {
          if (Math.abs(cx - c.x) + Math.abs(cy - c.y) <= FIRE_SUPPRESS_RADIUS) {
            const rs = state.buildingState.get(id);
            if (rs !== undefined) rs.suppressed = true;
            break;
          }
        }
      }
    }
    for (const id of toDestroy) {
      this._destroyBuilding(p, id, tick);
    }
    for (const id of toExtinguish) {
      this._extinguishBuilding(p, id, index);
    }
  }

  /**
   * Cozy pivot: clear a burnt-out building's fire state without destroying it —
   * the building, its tiles, popCap, and roadGrid entry are all untouched.
   */
  private _extinguishBuilding(p: PlayerState, id: number, index: FireDailyIndex): void {
    const state = this.state;
    const fs = p.fireState.get(id);
    if (fs === undefined) return;
    fs.burning = false;
    fs.burnTicksLeft = 0;
    // Audit-15: O(1) id→building lookup (was `_entityById`'s O(B) scan). Safe:
    // extinguish never despawns the building, so it's always still in `byId`.
    const b = index.byId.get(id);
    if (b !== undefined) pushEvent(state, `Day ${state.day}: the fire in a ${b.type} was put out.`);
  }

  /** Spread fire from burning buildings to nearby wooden neighbors (daily). */
  private _spreadFire(p: PlayerState, index: FireDailyIndex): void {
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
      // Audit-15: O(1) id→building lookup (was `_entityById`'s O(B) scan).
      const srcEntity = index.byId.get(srcId);
      if (srcEntity === undefined) continue;
      const sb = srcEntity;
      const scx = sb.x + Math.floor(sb.w / 2);
      const scy = sb.y + Math.floor(sb.h / 2);

      for (const w of index.woodenPositions) {
        if (w.id === srcId) continue;
        const fs = p.fireState.get(w.id);
        if (fs?.burning === true || fs?.destroyed === true) continue;

        const dist = Math.abs(scx - w.cx) + Math.abs(scy - w.cy);

        if (dist > 3) continue;
        if (this._hasFirebreak(scx, scy, w.cx, w.cy, index.stoneTiles)) continue;

        let spreadChance = 0.6;
        const wellNear = this._hasWellNear(index.wellCentres, w.cx, w.cy);
        if (wellNear) spreadChance *= 0.3;

        if (this.rngFor(p).nextFloat() < spreadChance) {
          this._igniteBuilding(p, w.id, w.type, "spread");
        }
      }
    }
  }

  /** Check ignition for non-burning wooden buildings (daily). */
  private _checkIgnition(p: PlayerState, index: FireDailyIndex): void {
    for (const w of index.woodenPositions) {
      const fs = p.fireState.get(w.id);
      if (fs?.burning === true || fs?.destroyed === true) continue;

      const nearbyWooden = this._nearbyWoodenCount(w.cx, w.cy, w.id, 4, index.woodenPositions);

      if (nearbyWooden < 3) continue;
      let chance = (nearbyWooden - 2) * 0.20;
      chance = Math.min(0.70, chance);

      if (this._hasWellNear(index.wellCentres, w.cx, w.cy)) chance *= 0.2;

      if (this.rngFor(p).nextFloat() < chance) {
        this._igniteBuilding(p, w.id, w.type, "ignition");
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
    fs.burnTicksLeft = scaleTicks(BURN_TICKS, state.ticksPerDay);
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
      // Re-idle any villager stationed here BEFORE despawn, so it doesn't loop
      // toward a dead workplace (ghost worker) while immigration backfills.
      releaseWorkersAt(state, b.x, b.y, b.w, b.h);
      if (entity.id !== undefined) state.buildingState.delete(entity.id);
      state.buildingWorld.despawn(entity);
      state.connectivityDirty = true;
      break;
    }
  }

  /**
   * Check if there's a firebreak (stone building or road tile) on the line
   * between two centers. `stoneTiles` is the once-per-day precomputed
   * footprint index (see `_buildDailyIndex`) — O(1) per line-step instead of
   * an O(buildings) scan per step (was O(n²)-ish once/day across all
   * candidate pairs × line steps).
   */
  private _hasFirebreak(ax: number, ay: number, bx: number, by: number, stoneTiles: ReadonlySet<number>): boolean {
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
      if (stoneTiles.has(idx)) return true;
    }
    return false;
  }

  /**
   * Count wooden buildings near (cx, cy) within `range` tiles (excluding
   * self), from the once-per-day precomputed wooden-position list (see
   * `_buildDailyIndex`) rather than rescanning all of the player's buildings
   * per candidate.
   */
  private _nearbyWoodenCount(
    cx: number, cy: number, selfId: number, range: number,
    woodenPositions: ReadonlyArray<{ id: number; cx: number; cy: number }>,
  ): number {
    let count = 0;
    for (const w of woodenPositions) {
      if (w.id === selfId) continue;
      if (Math.abs(cx - w.cx) + Math.abs(cy - w.cy) <= range) count++;
    }
    return count;
  }

  /**
   * Check if a Well owned by p covers position (cx, cy). A well's reach is an
   * 8×6 RECTANGLE centred on the well (see SERVICE_RECTS / coversRect), not a
   * Manhattan radius. Audit-15: takes the once-per-day (or mid-day-invalidated,
   * see `_getIndex`) precomputed well-centre list instead of scanning
   * `buildingWorld` fresh — was a full O(B) scan per call, called once per
   * BURNING building per tick (the dominant cost at several concurrent fires).
   * Order-independent: this is an OR over `coversRect` checks, so the list's
   * order (whatever `_buildDailyIndex`'s scan produced it in) doesn't matter.
   */
  private _hasWellNear(wellCentres: ReadonlyArray<{ x: number; y: number }>, cx: number, cy: number): boolean {
    for (const w of wellCentres) {
      if (coversRect("well", w.x, w.y, cx, cy)) return true;
    }
    return false;
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
  fs.burnTicksLeft = scaleTicks(BURN_TICKS, state.ticksPerDay);
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
