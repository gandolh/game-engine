/**
 * Building placement: validity, cost, tile bookkeeping, and the rejection messages.
 *
 * Extracted verbatim from `bootstrapSim`'s closure (audit-23) so placement can be
 * exercised WITHOUT booting the whole sim. Everything the old closures read off
 * bootstrap's scope is either already on {@link SimState} (`width`/`height`/
 * `occupancy`/`buildingWorld`/`roadGrid`/`buildingTiles`/`players`) or is threaded
 * explicitly through {@link PlacementContext} — the same discipline `canAfford`
 * already used.
 *
 * **Behaviour is unchanged by construction**: the checks, their order, the reasons
 * they return, and which predicate each walkable re-bake uses are all as they were
 * inside bootstrap.
 */
import { checkPlacement, rebuildWalkable, patchWalkable } from "@engine/core";
import type { Footprint } from "@engine/core";
import type { TerrainGrid } from "../world/terrain";
import { isWalkable, TerrainType } from "../world/terrain";
import type { BuildingRuntimeState, GoodType } from "../entities/building";
import {
  getBuildingDef,
  getProductionDef,
  effectiveHousingCapacity,
  buildCost,
} from "../entities/building";
import type { SimState, Stockpiles } from "../sim-state";
import { pushEvent, localPlayer } from "../sim-state";
import { TIER_LOCK, tierAtLeast, unlockTier } from "./tiers";
import { canBuildAt } from "./territory";

/**
 * Why a placement was rejected — lets callers emit ONE descriptive message
 * (P1-live: silent rejects gave the player no feedback) and coalesce a
 * drag's per-tile rejections into a single summary (P2: tier-locked drags
 * dumped ~20 near-identical toasts). "ok" means the building was placed.
 */
export type PlaceReason = "ok" | "tier" | "territory" | "occupied" | "terrain" | "bounds" | "invalid" | "cost";

/**
 * Everything placement needs that isn't already on {@link SimState}: the terrain
 * grid, the three bootstrap-time option flags it branches on, and the live
 * walkable grid it re-bakes.
 *
 * Created by {@link createPlacementContext}; bootstrap holds exactly one and
 * exposes `walkable` off it (so the sim result's `walkable` getter still returns
 * the freshest bake).
 */
export interface PlacementContext {
  readonly state: SimState;
  readonly terrain: TerrainGrid;
  /** Charge the per-type `BUILD_COST` to the owner's stockpile (opt-in). */
  readonly chargeBuildCost: boolean;
  /** Enforce influence-radius territory build-gating (MP). */
  readonly enforceTerritory: boolean;
  /** MP match vs solo game — decides the town-hall's keep-anchor role. */
  readonly multiplayer: boolean;
  /**
   * Current walkable grid — Uint8Array (1=walkable, 0=blocked). Reassigned by
   * {@link rebakeWalkable} whenever a placement or demolition changes the layout.
   */
  walkable: Uint8Array;
}

/** True if `stock` holds at least every good in `cost`. */
export function canAfford(stock: Stockpiles, cost: Partial<Record<GoodType, number>>): boolean {
  for (const g of Object.keys(cost) as GoodType[]) {
    if (stock[g] < (cost[g] ?? 0)) return false;
  }
  return true;
}

/** Subtract `cost` from `stock` in place (caller has already checked {@link canAfford}). */
export function debitStock(stock: Stockpiles, cost: Partial<Record<GoodType, number>>): void {
  for (const g of Object.keys(cost) as GoodType[]) {
    stock[g] -= cost[g] ?? 0;
  }
}

/** Whether tile (tx,ty) is solid ground a footprint may sit on. */
export function isBuildableTile(terrain: TerrainGrid, tx: number, ty: number): boolean {
  return isWalkable(terrain, tx, ty);
}

/**
 * Walkability for the path/raider grid: buildable terrain OR a road/bridge tile.
 * Bridges sit on (non-buildable) water but are crossable once decked, so they must
 * read as walkable here. Placement validity still uses {@link isBuildableTile}.
 */
export function isWalkableTile(state: SimState, terrain: TerrainGrid, tx: number, ty: number): boolean {
  return isBuildableTile(terrain, tx, ty) || state.roadGrid[ty * state.width + tx] === 1;
}

/**
 * The ONE funnel that re-bakes `ctx.walkable`. `mode` picks the predicate, and the
 * choice is load-bearing, not cosmetic:
 * - `"buildable"` — terrain only. Used when a solid footprint was applied to
 *   occupancy (and for the initial bake, when no roads exist yet).
 * - `"roads"` — terrain OR road/bridge tiles, so a decked bridge stays crossable
 *   and a demolished one stops being.
 *
 * Every re-bake goes through here.
 *
 * audit-10: pass `fp` — the ONE footprint whose occupancy (and, for `"roads"`,
 * road-grid cell) just changed — and this patches `ctx.walkable` in place for
 * just that footprint's cells instead of re-scanning the whole grid. Every
 * caller below can name that footprint (a placement's own `fp`, or a
 * demolition's freed footprint), so `fp` is omitted only for the one-off
 * initial bake in {@link createPlacementContext}, where `ctx.walkable` starts
 * as a zero-length array and there is nothing yet to patch.
 */
export function rebakeWalkable(ctx: PlacementContext, mode: "buildable" | "roads", fp?: Footprint): void {
  const { state, terrain } = ctx;
  const pred = mode === "roads"
    ? (tx: number, ty: number): boolean => isWalkableTile(state, terrain, tx, ty)
    : (tx: number, ty: number): boolean => isBuildableTile(terrain, tx, ty);
  if (fp === undefined) {
    ctx.walkable = rebuildWalkable(state.width, state.height, state.occupancy, pred);
  } else {
    patchWalkable(ctx.walkable, state.occupancy, fp, pred);
  }
}

/**
 * Build the placement context and take the initial walkable bake (terrain-only —
 * no roads exist yet).
 */
export function createPlacementContext(args: {
  state: SimState;
  terrain: TerrainGrid;
  chargeBuildCost: boolean;
  enforceTerritory: boolean;
  multiplayer: boolean;
}): PlacementContext {
  const ctx: PlacementContext = {
    state: args.state,
    terrain: args.terrain,
    chargeBuildCost: args.chargeBuildCost,
    enforceTerritory: args.enforceTerritory,
    multiplayer: args.multiplayer,
    walkable: new Uint8Array(0),
  };
  rebakeWalkable(ctx, "buildable");
  return ctx;
}

/** Mark a building's footprint tiles in the buildingTiles set. */
export function addBuildingTiles(state: SimState, x: number, y: number, w: number, h: number): void {
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      const tx = x + dx;
      const ty = y + dy;
      if (tx >= 0 && ty >= 0 && tx < state.width && ty < state.height) {
        state.buildingTiles.add(ty * state.width + tx);
      }
    }
  }
}

/** Clear a building's footprint tiles from the buildingTiles set (demolition). */
export function removeBuildingTiles(state: SimState, x: number, y: number, w: number, h: number): void {
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      const tx = x + dx;
      const ty = y + dy;
      if (tx >= 0 && ty >= 0 && tx < state.width && ty < state.height) {
        state.buildingTiles.delete(ty * state.width + tx);
      }
    }
  }
}

/** Neutral per-building runtime state for a freshly placed building. */
export function freshRuntime(): BuildingRuntimeState {
  return {
    outputBuffer: 0,
    workerCount: 0,
    connected: false,
    productionTick: 0,
    level: 1,
    // Per-house needs/mood (house-only; NeedsHappinessSystem overwrites for houses).
    // Neutral defaults: fully-lacking, base mood 40 (the no-needs-met floor).
    lacksFaith: true,
    lacksSafety: true,
    lacksGoods: true,
    mood: 40,
  };
}

/** Whether tile (tx,ty) is in-bounds and water. */
export function isWaterTile(state: SimState, terrain: TerrainGrid, tx: number, ty: number): boolean {
  if (tx < 0 || ty < 0 || tx >= state.width || ty >= state.height) return false;
  return terrain.cells[ty * state.width + tx] === TerrainType.Water;
}

/**
 * Does placing this `isKeep` building adopt the keep/raid anchor (sets `keepPosition`,
 * sacking it ends the player's run)?
 *
 * The `keep` always anchors (the solo siege game). The **town-hall** is each MP player's
 * match anchor (Citadel 29) — but under the cozy-pivot Phase-G direction the town-hall in
 * SOLO is a purely *civic* coverage building (rations/work-hours within its radius), NOT
 * the keep/raid anchor: a player should be able to place one without starting a siege. So
 * the town-hall anchors only in MULTIPLAYER; in solo it's civic-only. Raids are gated
 * entirely on `keepPosition` (raid-spawn), so not adopting it ⇒ no raids.
 *
 * The mode is the bootstrap-time `multiplayer` flag, NOT a live `players.length > 1`
 * count. An MP room is founded by ONE peer and grows: counting players made the founder's
 * hall skip the anchor forever (`keepPosition` is assigned once, at placement), while the
 * snapshot's `keepPresent` — recomputed from the same predicate every tick — flipped to
 * true the moment a second peer joined. The founder read "Keep: standing" and was never
 * raided. Found by the brief-108 live-MP pass.
 */
export function actsAsKeepAnchor(buildingType: string, multiplayer: boolean): boolean {
  if (getProductionDef(buildingType)?.isKeep !== true) return false;
  if (buildingType === "town-hall" && !multiplayer) return false;
  return true;
}

/**
 * Place one building/road/wall tile. Returns `"ok"` on success, otherwise the reason
 * it was rejected (nothing is mutated on rejection — the cost debit happens only
 * after every validity check has passed).
 *
 * `charge = false` lets the founding seed (a gift, not a purchase) bypass the debit
 * even when `chargeBuildCost` is on; every other caller leaves it defaulted.
 */
export function placeOne(
  ctx: PlacementContext,
  buildingType: string,
  x: number,
  y: number,
  charge = true,
): PlaceReason {
  const { state, terrain } = ctx;
  const width = state.width;
  const height = state.height;
  const occupancy = state.occupancy;

  // A road dragged onto water becomes a bridge (a walkable span). This is the
  // ONLY way bridges are created, so a "road" command across a river auto-decks
  // the water tiles and lays plain road on the land tiles. (A bridge command
  // off-water falls through to the normal water/occupancy rejection below.)
  if (buildingType === "road" && isWaterTile(state, terrain, x, y)) buildingType = "bridge";

  const def = getBuildingDef(buildingType);
  if (def === undefined) return "invalid";

  // Citadel 28: solo commands act on the local player. (Brief 35 will route
  // each command to its sender's player; for now there is one writer.)
  const lp = localPlayer(state);

  // Tier-lock: some building types are gated behind a minimum settlement tier.
  const required = TIER_LOCK[buildingType];
  if (required !== undefined && !tierAtLeast(unlockTier(lp), required)) {
    return "tier";
  }

  // Build cost (opt-in). Check affordability UP FRONT so an unaffordable click is rejected
  // cleanly without mutating; the DEBIT happens only on success (below), so a placement that
  // fails a later validity check (occupied/terrain/…) is never charged. Stockpiles don't
  // change between here and the debit (one writer per tick), so the two stay consistent.
  // `charge` lets the founding seed (a gift, not a purchase) bypass the debit even when
  // chargeBuildCost is on — every other caller leaves it defaulted true (unchanged behavior).
  const cost = ctx.chargeBuildCost && charge ? buildCost(buildingType) : undefined;
  if (cost !== undefined && !canAfford(lp.stockpiles, cost)) {
    return "cost";
  }

  // Citadel 30: territory build-gating (MP). Place only within your territory
  // ∪ adjacent-unclaimed; never into a rival's claim. Off in solo.
  if (ctx.enforceTerritory && !canBuildAt(state, lp, x, y, def.w, def.h)) {
    return "territory";
  }

  const prod = getProductionDef(buildingType);
  const fp = { x, y, w: def.w, h: def.h };

  const isGate = prod?.isGate === true;
  const isBridge = prod?.isBridge === true;

  if (isBridge) {
    // A bridge decks exactly one water tile. It must BE water (else it would
    // just be a road), and must not overlap any existing building/road/bridge
    // footprint — bridges cannot overlap.
    if (!isWaterTile(state, terrain, x, y)) return "terrain";
    if (occupancy.isOccupied(x, y)) return "occupied";
    if (state.buildingTiles.has(y * width + x)) return "occupied";
    occupancy.apply(fp);
    // Mark the deck as road BEFORE rebuilding so the "roads" predicate (which ORs
    // in road tiles) keeps the bridged water tile walkable; the generic isRoad
    // block below re-sets the same cell, harmlessly.
    state.roadGrid[y * width + x] = 1;
    // audit-10: a bridge's footprint is always 1×1 (BUILDING_DEFS.bridge), and its
    // road-grid write above lands on that same single tile — patching fp covers it.
    rebakeWalkable(ctx, "roads", fp);
  } else if (isGate) {
    // Gates stay walkable: bounds + terrain check only, no occupancy entry.
    for (let dy = 0; dy < def.h; dy++) {
      for (let dx = 0; dx < def.w; dx++) {
        const tx = x + dx;
        const ty = y + dy;
        if (tx < 0 || ty < 0 || tx >= width || ty >= height) return "bounds";
        if (!isBuildableTile(terrain, tx, ty)) return "terrain";
        // Can't place a gate on an already-occupied tile.
        if (state.buildingTiles.has(ty * width + tx)) return "occupied";
      }
    }
  } else {
    const result = checkPlacement(fp, occupancy, (tx, ty) => isBuildableTile(terrain, tx, ty));
    if (!result.valid) {
      return result.reason !== undefined && result.reason.includes("bounds") ? "bounds" : "occupied";
    }

    // Terrain requirement (forest / stone): at least one footprint tile matches.
    if (prod?.terrainReq === "forest") {
      let onForest = false;
      for (let dy = 0; dy < def.h && !onForest; dy++) {
        for (let dx = 0; dx < def.w; dx++) {
          const t = terrain.cells[(y + dy) * width + (x + dx)];
          if (t === TerrainType.Forest) { onForest = true; break; }
        }
      }
      if (!onForest) return "terrain";
    }
    if (prod?.terrainReq === "stone") {
      let onStone = false;
      for (let dy = 0; dy < def.h && !onStone; dy++) {
        for (let dx = 0; dx < def.w; dx++) {
          const t = terrain.cells[(y + dy) * width + (x + dx)];
          if (t === TerrainType.Stone) { onStone = true; break; }
        }
      }
      if (!onStone) return "terrain";
    }

    occupancy.apply(fp);
    // audit-10: patch just this footprint instead of re-scanning the whole grid.
    rebakeWalkable(ctx, "buildable", fp);
  }

  addBuildingTiles(state, x, y, def.w, def.h);

  const entity = state.buildingWorld.spawn({
    building: { type: buildingType, x, y, w: def.w, h: def.h, ownerId: lp.id },
  });
  if (entity.id !== undefined) {
    state.buildingState.set(entity.id, freshRuntime());
  }
  if (prod?.isRoad === true) {
    state.roadGrid[y * width + x] = 1;
  }
  if (prod?.isHousing === true && prod.housingCapacity !== undefined) {
    // New buildings are L1 → base capacity (unchanged behavior).
    lp.popCap += effectiveHousingCapacity(prod, 1);
  }
  // Phase 4: special tile tracking (per-player)
  if (prod?.isGate === true) {
    lp.gateTiles.add(y * width + x);
  }
  if (prod?.isWall === true) {
    lp.wallTiles.add(y * width + x);
  }
  if (actsAsKeepAnchor(buildingType, ctx.multiplayer)) {
    // Center of the 3×3 footprint.
    lp.keepPosition = { x: x + Math.floor(def.w / 2), y: y + Math.floor(def.h / 2) };
  }
  // Charge the build cost now that placement has succeeded (affordability was checked above).
  if (cost !== undefined) debitStock(lp.stockpiles, cost);
  state.connectivityDirty = true;
  return "ok";
}

/** Human-readable reason for a single-building rejection (P1-live feedback). */
export function describeReject(state: SimState, buildingType: string, reason: PlaceReason): string | null {
  switch (reason) {
    case "tier": {
      const req = TIER_LOCK[buildingType];
      return `Day ${state.day}: a ${buildingType} needs ${req ?? "a higher"} tier — unlock it first.`;
    }
    case "territory":
      return `Day ${state.day}: can't build a ${buildingType} there — outside your territory.`;
    case "occupied":
      return `Day ${state.day}: can't build a ${buildingType} there — those tiles are taken.`;
    case "terrain":
      return `Day ${state.day}: a ${buildingType} can't sit on that ground.`;
    case "bounds":
      return `Day ${state.day}: can't build a ${buildingType} there — off the map.`;
    case "cost": {
      const need = Object.entries(buildCost(buildingType)).map(([g, q]) => `${q} ${g}`).join(", ");
      return `Day ${state.day}: can't afford a ${buildingType} — need ${need}.`;
    }
    default:
      return null; // "invalid" (unknown type) — no actionable message.
  }
}

/**
 * Road/wall drags stamp many tiles; rather than one toast per rejected tile
 * (P2: a tier-locked wall drag dumped ~20 near-identical messages), tally the
 * rejection reasons and emit at most one coalesced summary per reason.
 */
export function placeDragged(
  ctx: PlacementContext,
  buildingType: string,
  tiles: ReadonlyArray<{ x: number; y: number }>,
): void {
  const state = ctx.state;
  const counts = new Map<PlaceReason, number>();
  let placed = 0;
  for (const tile of tiles) {
    const r = placeOne(ctx, buildingType, tile.x, tile.y);
    if (r === "ok") placed++;
    else counts.set(r, (counts.get(r) ?? 0) + 1);
  }
  const tierBlocked = counts.get("tier") ?? 0;
  if (tierBlocked > 0) {
    const req = TIER_LOCK[buildingType];
    pushEvent(
      state,
      `Day ${state.day}: ${tierBlocked} ${buildingType}${tierBlocked === 1 ? "" : "s"} need ${req ?? "a higher"} tier — unlock it first.`,
    );
  }
  // Tiles blocked by occupancy/terrain/bounds — the drag gapped here. Only
  // worth a word if some of the drag actually landed (a fully-rejected tier
  // drag is already explained above).
  const blocked = (counts.get("occupied") ?? 0) + (counts.get("terrain") ?? 0) + (counts.get("bounds") ?? 0);
  if (blocked > 0 && (placed > 0 || tierBlocked === 0)) {
    pushEvent(
      state,
      `Day ${state.day}: ${blocked} ${buildingType} tile${blocked === 1 ? "" : "s"} blocked — the run has a gap.`,
    );
  }
}
