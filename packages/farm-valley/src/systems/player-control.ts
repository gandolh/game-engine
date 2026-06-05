import type { SimContext, System, World, Intention } from "@engine/core";
import type { GameEntity, CropKind } from "../components";
import { regionAt, isWalkable, isFishingIsle, type RegionId } from "../world/regions";

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
 * Movement is intentionally NOT AP-gated — the player walks freely tile-by-tile
 * for responsiveness. The action itself flows through ActSystem, which applies
 * the same proximity / tool / inventory rules as for the AI farmers.
 */

/** Direction → unit tile delta. */
const DIR_DELTA: Record<string, { dx: number; dy: number }> = {
  up:    { dx: 0,  dy: -1 },
  down:  { dx: 0,  dy: 1 },
  left:  { dx: -1, dy: 0 },
  right: { dx: 1,  dy: 0 },
};

/**
 * Ticks between Pip's one-tile commits while a move key is held. At 20 Hz this
 * is ~6.7 tiles/sec — close to the old ~8 tiles/sec feel, but the cadence now
 * lives in the sim (tick-aligned) so we can glide farmer.renderPos across the
 * gap. Mirrors TravelSystem.STEP_TICKS, just faster for a responsive player.
 */
export const PLAYER_STEP_TICKS = 3;

/**
 * What a hotbar slot does. `tool` slots act on the tile in front of Pip with a
 * specific tool/can; `seed` slots plant that crop on an empty owned plot.
 */
export type HotbarSlot =
  | { kind: "tool"; tool: "can" | "hoe" | "axe" | "pickaxe" | "fishing-rod"; label: string; glyph: string }
  | { kind: "seed"; crop: CropKind; label: string; glyph: string };

/**
 * The player's hotbar, by slot index. The action key uses the SELECTED slot
 * (player.selectedSlot) rather than auto-picking by context. Number keys 1-7
 * select slots 0-6. This list is the single source of truth shared by the sim
 * (action dispatch), the snapshot, and the hotbar UI.
 *
 *   1 Can · 2 Hoe · 3 Axe · 4 Pickaxe · 5 Rod · 6 Radish · 7 Wheat · 8 Pumpkin
 */
export const HOTBAR_SLOTS: readonly HotbarSlot[] = [
  { kind: "tool", tool: "can",         label: "Can",     glyph: "🪣" },
  { kind: "tool", tool: "hoe",         label: "Hoe",     glyph: "⛏" },
  { kind: "tool", tool: "axe",         label: "Axe",     glyph: "🪓" },
  { kind: "tool", tool: "pickaxe",     label: "Pickaxe", glyph: "⚒" },
  { kind: "tool", tool: "fishing-rod", label: "Rod",     glyph: "🎣" },
  { kind: "seed", crop: "radish",      label: "Radish",  glyph: "🌱" },
  { kind: "seed", crop: "wheat",       label: "Wheat",   glyph: "🌾" },
  { kind: "seed", crop: "pumpkin",     label: "Pumpkin", glyph: "🎃" },
];

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

      // ── Movement ─────────────────────────────────────────────────────────
      // pendingMoveX/Y are the HELD axes (resent when the held keys change, null
      // on release). Two axes held at once → DIAGONAL. The sim owns the cadence:
      // commit one tile every PLAYER_STEP_TICKS ticks; on the in-between ticks
      // glide farmer.renderPos so the per-tick snapshot shows continuous motion
      // (no full-tile jump → smooth camera). Mirrors TravelSystem's renderPos.
      //
      // The glide TRAILS the authoritative transform: each commit moves transform
      // to the new tile immediately, and renderPos eases from the PREVIOUS tile up
      // *into* that committed tile over the next PLAYER_STEP_TICKS ticks. Trailing
      // (never leading) is what keeps releases/direction-flips smooth — the
      // visual never sits ahead of transform, so stopping or turning never has to
      // yank Pip backward (the cause of the press-A-then-D "shake").
      const mx = player.pendingMoveX;
      const my = player.pendingMoveY;
      if (mx !== null || my !== null) {
        // 4-way facing for the sprite (no diagonal frames): horizontal wins on a
        // diagonal because the side profile reads best; else use the live axis.
        player.facing = mx ?? my!;

        if (player.stepCooldown > 0) player.stepCooldown -= 1;

        if (player.stepCooldown <= 0) {
          // Resolve the step from both axes, with wall-slide: prefer the full
          // diagonal, but if it's blocked fall back to whichever single axis is
          // open so Pip slides along a wall instead of stopping dead.
          const dxWant = mx === "left" ? -1 : mx === "right" ? 1 : 0;
          const dyWant = my === "up" ? -1 : my === "down" ? 1 : 0;
          const fromX = Math.round(transform.x);
          const fromY = Math.round(transform.y);
          const step = this.resolveStep(fromX, fromY, dxWant, dyWant);
          if (step) {
            // Commit transform to the new tile; remember the tile we left so the
            // in-between ticks can ease renderPos from it up INTO the new tile.
            player.glideFromX = fromX;
            player.glideFromY = fromY;
            transform.x = fromX + step.dx;
            transform.y = fromY + step.dy;
            farmer.renderPos = { x: fromX, y: fromY };
            farmer.movedThisTick = true;
            const region = regionAt(transform.x, transform.y);
            if (region !== null) farmer.currentRegion = region;
            player.stepCooldown = PLAYER_STEP_TICKS;
          } else {
            // Fully blocked — sit on the true tile (no glide), retry next tick.
            farmer.renderPos = undefined;
          }
        } else {
          // Between commits: ease renderPos from the tile we left (glideFrom) up
          // into the committed transform tile. RENDER-ONLY — transform already
          // holds the authoritative tile, so sim logic (action targeting,
          // proximity) is unchanged. frac in (0,1): progress through the window.
          const frac = (PLAYER_STEP_TICKS - player.stepCooldown) / PLAYER_STEP_TICKS;
          farmer.renderPos = {
            x: player.glideFromX + (transform.x - player.glideFromX) * frac,
            y: player.glideFromY + (transform.y - player.glideFromY) * frac,
          };
          farmer.movedThisTick = true;
        }
      } else {
        // Key released — next press steps immediately, and Pip renders on its
        // true tile (drop any mid-step glide).
        player.stepCooldown = 0;
        farmer.renderPos = undefined;
      }

      // ── Action ────────────────────────────────────────────────────────────
      // Build the intention for the SELECTED hotbar slot, acting on the tile
      // Pip faces, and let ActSystem run it.
      if (player.pendingAction) {
        player.pendingAction = false;
        const { dx, dy } = DIR_DELTA[player.facing]!;
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

  /**
   * Resolve the one-tile step from (fromX,fromY) given the desired per-axis
   * deltas (each in {-1,0,1}), with wall-slide and no corner-cutting:
   *  - Diagonal request: take it only if the destination AND both orthogonal
   *    cells are open (so Pip can't squeeze through a corner gap). If the
   *    diagonal is blocked, slide along whichever single axis is open.
   *  - Single-axis request: take it if open.
   * Returns the chosen {dx,dy}, or null if every candidate is blocked.
   */
  private resolveStep(
    fromX: number,
    fromY: number,
    dxWant: number,
    dyWant: number,
  ): { dx: number; dy: number } | null {
    if (dxWant !== 0 && dyWant !== 0) {
      const diagOpen =
        this.canStand(fromX + dxWant, fromY + dyWant) &&
        this.canStand(fromX + dxWant, fromY) &&
        this.canStand(fromX, fromY + dyWant);
      if (diagOpen) return { dx: dxWant, dy: dyWant };
      // Wall-slide: prefer the horizontal slide, else the vertical.
      if (this.canStand(fromX + dxWant, fromY)) return { dx: dxWant, dy: 0 };
      if (this.canStand(fromX, fromY + dyWant)) return { dx: 0, dy: dyWant };
      return null;
    }
    // Single axis (one of dxWant/dyWant is 0).
    if (this.canStand(fromX + dxWant, fromY + dyWant)) {
      return { dx: dxWant, dy: dyWant };
    }
    return null;
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
