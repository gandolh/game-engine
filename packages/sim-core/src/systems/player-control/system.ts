/**
 * PlayerControlSystem — turns buffered keyboard input into the player farmer
 * (Pip)'s movement and a single context-sensitive field action, reusing the
 * exact same `Intention` shapes the AI personalities emit so the downstream
 * ActSystem performs the work identically.
 *
 * Pip is a normal farmer entity in every other respect (crop growth, harvest,
 * the market, rendering and walk-cycle animation all treat it like the AI
 * farmers). The only difference is the source of its intentions: this system,
 * driven by `entity.player.pendingMoveX/Y` / `pendingAction`, instead of an AI
 * `deliberate()` function. DeliberateSystem skips any entity with a `player`
 * tag, and this system runs immediately before ActSystem so a queued action
 * executes on the same tick it was requested.
 *
 * ── Brief 61: Continuous sub-tile movement ────────────────────────────────────
 * Movement is now VELOCITY-BASED (float position). Each tick that an axis is
 * held, transform.x/y advances by PLAYER_SPEED (= 1/PLAYER_STEP_TICKS ≈ 0.333
 * tiles/tick), so Pip crosses one tile in exactly PLAYER_STEP_TICKS ticks —
 * matching the old effective speed while eliminating the glide/commit machinery
 * that caused the rapid-reversal teleport (brief 61 bug).
 *
 * Collision uses Pip's AABB (AABB_HALF = 0.3 tiles, i.e. 0.6×0.6 tile box
 * around Pip's center). The axes are resolved INDEPENDENTLY (first X, then Y),
 * which gives wall-slide for free: if the X move clips a solid tile, X is
 * clamped to the tile edge while Y still advances. Walkability is tested against
 * integer tile coordinates overlapped by the AABB.
 *
 * Diagonal movement is AXIS-INDEPENDENT: both X and Y advance by PLAYER_SPEED
 * per tick (no SQRT2 normalization). Pip moves ~41 % faster diagonally in
 * world-units, which is consistent with most action-adventure games and avoids
 * any transcendental math in the sim path (determinism requirement).
 *
 * The `glideFromX/Y` and `stepCooldown` fields are removed from `Player`
 * (brief 61). `farmer.renderPos` is cleared every tick; the snapshot-builder
 * falls back to `transform`, which is now already smooth.
 *
 * Sim consumers that need a tile index MUST Math.round(transform.x/y). The
 * proximity helper (`isWithinReach`) already does this. Action targeting in
 * this file (tx/ty for hotbar) also rounds.
 *
 * Split from player-control.ts.
 */

import type { SimContext, System, World, Intention } from "@engine/core";
import type { GameEntity } from "../../components";
import { regionAt, isWalkable, isFishingIsle, type RegionId } from "../../world/regions";
import { DIR_DELTA, PLAYER_STEP_TICKS, HOTBAR_SLOTS, type HotbarSlot } from "./hotbar";

/**
 * Pip's movement speed in tiles per tick.
 * 1 / PLAYER_STEP_TICKS ≈ 0.333 tiles/tick → 1 tile in 3 ticks, matching the
 * old tile-commit cadence. Exported for tests.
 */
export const PLAYER_SPEED = 1 / PLAYER_STEP_TICKS;

/**
 * Half-width (and half-height) of Pip's AABB in tile units. The AABB is a
 * 0.6×0.6 tile square centered on transform. A slightly-inset box (vs. 0.5)
 * gives a small tolerance at tile corners, preventing Pip from snagging on
 * single-tile protruding corners when sliding along walls.
 */
const AABB_HALF = 0.3;

export class PlayerControlSystem implements System {
  readonly name = "PlayerControlSystem";

  constructor(private readonly world: World<GameEntity>) {}

  run(_ctx: SimContext): void {
    for (const entity of this.world.query("player", "transform", "farmer", "intentions")) {
      const player = entity.player!;
      const transform = entity.transform!;
      const farmer = entity.farmer!;

      // Movement resets every tick; the walk-cycle reads movedThisTick.
      farmer.movedThisTick = false;

      // ── Continuous movement ───────────────────────────────────────────────
      // Clear any residual renderPos every tick — transform IS the position now.
      farmer.renderPos = undefined;

      const mx = player.pendingMoveX;
      const my = player.pendingMoveY;

      if (mx !== null || my !== null) {
        // 4-way facing: horizontal wins on a diagonal (side profile reads best).
        player.facing = mx ?? my!;

        // Desired velocity per axis: ±PLAYER_SPEED or 0.
        const vx = mx === "left" ? -PLAYER_SPEED : mx === "right" ? PLAYER_SPEED : 0;
        const vy = my === "up"   ? -PLAYER_SPEED : my === "down"  ? PLAYER_SPEED : 0;

        // Per-axis AABB collision — resolve X then Y independently (wall-slide).
        const newX = this.resolveAxis(transform.x, transform.y, vx, 0).x;
        const newY = this.resolveAxis(newX,          transform.y, 0,  vy).y;

        const moved = newX !== transform.x || newY !== transform.y;
        transform.x = newX;
        transform.y = newY;

        if (moved) {
          farmer.movedThisTick = true;
          const region = regionAt(Math.round(transform.x), Math.round(transform.y));
          if (region !== null) farmer.currentRegion = region;
        }
      }

      // ── Action ────────────────────────────────────────────────────────────
      // Build the intention for the SELECTED hotbar slot, acting on the tile
      // Pip faces, and let ActSystem run it.
      if (player.pendingAction) {
        player.pendingAction = false;
        const { dx, dy } = DIR_DELTA[player.facing]!;
        // Round Pip's position to the nearest tile, then add the facing delta.
        const tx = Math.round(transform.x) + dx;
        const ty = Math.round(transform.y) + dy;
        const slot = HOTBAR_SLOTS[player.selectedSlot];
        const intent = slot ? this.slotIntent(entity, slot, tx, ty) : null;
        if (intent !== null) {
          entity.intentions!.queue = [intent];
          entity.fsm!.current = "ACT";
        }
      }
    }
  }

  /**
   * Resolve one axis of movement with AABB collision, returning the new {x,y}.
   * Only one of vx/vy should be non-zero per call (call twice for diagonal).
   *
   * Algorithm:
   *   1. Compute the candidate position after applying the velocity.
   *   2. Gather all integer tiles the AABB would overlap at the candidate.
   *   3. For each overlapping tile that is solid (not walkable or has a feature),
   *      clamp the position to the tile edge (no penetration).
   */
  private resolveAxis(
    cx: number,
    cy: number,
    vx: number,
    vy: number,
  ): { x: number; y: number } {
    if (vx === 0 && vy === 0) return { x: cx, y: cy };

    const nx = cx + vx;
    const ny = cy + vy;

    // Tiles covered by the AABB at the new position. A small epsilon (1e-6)
    // prevents a boundary-exactly-touching tile edge from being counted as
    // overlapping, which avoids spurious Y-axis clamps when the X axis has
    // already been resolved and Pip's AABB edge sits exactly on a tile boundary.
    const EPS = 1e-6;
    const minTX = Math.floor(nx - AABB_HALF + EPS);
    const maxTX = Math.floor(nx + AABB_HALF - EPS);
    const minTY = Math.floor(ny - AABB_HALF + EPS);
    const maxTY = Math.floor(ny + AABB_HALF - EPS);

    let x = nx;
    let y = ny;

    for (let tx = minTX; tx <= maxTX; tx++) {
      for (let ty = minTY; ty <= maxTY; ty++) {
        if (this.canStand(tx, ty)) continue; // open — no clamp needed

        // Tile (tx,ty) is solid. Clamp our movement axis to the tile edge.
        if (vx > 0) {
          // Moving right: clamp right edge of AABB to left edge of tile.
          x = Math.min(x, tx - AABB_HALF);
        } else if (vx < 0) {
          // Moving left: clamp left edge of AABB to right edge of tile.
          x = Math.max(x, tx + 1 + AABB_HALF);
        }
        if (vy > 0) {
          // Moving down: clamp bottom edge to top edge of tile.
          y = Math.min(y, ty - AABB_HALF);
        } else if (vy < 0) {
          // Moving up: clamp top edge to bottom edge of tile.
          y = Math.max(y, ty + 1 + AABB_HALF);
        }
      }
    }

    return { x, y };
  }

  /**
   * Build the intention for the selected hotbar slot acting on the faced tile,
   * or null when the slot can't act there (wrong target / no plot / no seed).
   * Reuses the same `Intention` shapes the AI farmers emit so ActSystem runs
   * them identically (and applies its own tool/inventory/proximity checks).
   *
   *   Can         → water a planted, not-yet-watered plot
   *   Hoe         → till bare ground on Pip's own farm
   *   Axe         → chop the tree in front
   *   Pickaxe     → mine the stone in front
   *   Fishing rod → fish, when facing a fishing-spot tile
   *   Seed        → plant that crop on an empty owned plot (if a seed is held)
   */
  private slotIntent(
    entity: GameEntity,
    slot: HotbarSlot,
    tx: number,
    ty: number,
  ): Intention | null {
    if (slot.kind === "tool") {
      switch (slot.tool) {
        case "axe":
        case "pickaxe": {
          const wantKind = slot.tool === "axe" ? "tree" : "stone";
          for (const f of this.world.query("tileFeature")) {
            if (f.tileFeature.tileX !== tx || f.tileFeature.tileY !== ty) continue;
            if (f.tileFeature.kind !== wantKind) return null;
            const kind = slot.tool === "axe" ? "chop-tree" : "mine-stone";
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
          // Fish when standing on the fishing isle and facing open water. The
          // faced tile (tx,ty) must be ocean (non-walkable); ActSystem re-checks
          // that Pip is on the isle + adjacent to water, and reads bubbles for
          // rarity. We don't gate on a specific spot — any shoreline casts.
          const onIsle = isFishingIsle(entity.farmer?.currentRegion ?? null);
          if (onIsle && !isWalkable(tx, ty)) {
            return { kind: "fish", data: { tileX: tx, tileY: ty }, priority: 0 };
          }
          return null;
        }
        case "hoe": {
          // Till bare ground on Pip's own farm (no existing plot on the tile).
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

    // Seed slot → plant that crop on an empty owned plot, if a seed is held.
    const plot = this.ownedPlotAt(entity, tx, ty);
    if (plot && plot.state.kind !== "planted" && (entity.inventory?.seeds[slot.crop] ?? 0) > 0) {
      return { kind: "plant", data: { crop: slot.crop, tileX: tx, tileY: ty }, priority: 0 };
    }
    return null;
  }

  /** True if a movement-blocking entity occupies the tile: a tree/stone feature
   *  or a static solid obstacle (workshop prop / big building footprint). */
  private featureAt(tx: number, ty: number): boolean {
    for (const f of this.world.query("tileFeature")) {
      if (f.tileFeature.tileX === tx && f.tileFeature.tileY === ty) return true;
    }
    for (const s of this.world.query("solid")) {
      if (s.solid.tileX === tx && s.solid.tileY === ty) return true;
    }
    return false;
  }

  /** A tile is steppable iff walkable and free of a feature/solid obstacle. */
  private canStand(tx: number, ty: number): boolean {
    return isWalkable(tx, ty) && !this.featureAt(tx, ty);
  }

  /** The plot owned by `entity` at the given tile, or null. */
  private ownedPlotAt(entity: GameEntity, tx: number, ty: number): GameEntity["plot"] | null {
    for (const p of this.world.query("plot")) {
      if (p.plot.tileX === tx && p.plot.tileY === ty && p.plot.ownerId === entity.id) {
        return p.plot;
      }
    }
    return null;
  }
}
