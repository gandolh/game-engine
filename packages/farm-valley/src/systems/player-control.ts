import type { SimContext, System, World, Intention } from "@engine/core";
import type { GameEntity, CropKind } from "../components";
import { regionAt, isWalkable, type RegionId } from "../world/regions";

/**
 * PlayerControlSystem — turns buffered keyboard input into the player farmer
 * (Pip)'s movement and a single context-sensitive field action, reusing the
 * exact same `Intention` shapes the AI personalities emit so the downstream
 * ActSystem performs the work identically.
 *
 * Pip is a normal farmer entity in every other respect (crop growth, harvest,
 * the market, rendering and walk-cycle animation all treat it like the AI
 * farmers). The only difference is the source of its intentions: this system,
 * driven by `entity.player.pendingMove` / `pendingAction`, instead of an AI
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
 * What a hotbar slot does. `tool` slots act on the tile in front of Pip with a
 * specific tool/can; `seed` slots plant that crop on an empty owned plot.
 */
export type HotbarSlot =
  | { kind: "tool"; tool: "can" | "hoe" | "axe" | "pickaxe"; label: string; glyph: string }
  | { kind: "seed"; crop: CropKind; label: string; glyph: string };

/**
 * The player's hotbar, by slot index. The action key uses the SELECTED slot
 * (player.selectedSlot) rather than auto-picking by context. Number keys 1-7
 * select slots 0-6. This list is the single source of truth shared by the sim
 * (action dispatch), the snapshot, and the hotbar UI.
 *
 *   1 Can · 2 Hoe · 3 Axe · 4 Pickaxe · 5 Radish · 6 Wheat · 7 Pumpkin
 */
export const HOTBAR_SLOTS: readonly HotbarSlot[] = [
  { kind: "tool", tool: "can",     label: "Can",     glyph: "🪣" },
  { kind: "tool", tool: "hoe",     label: "Hoe",     glyph: "⛏" },
  { kind: "tool", tool: "axe",     label: "Axe",     glyph: "🪓" },
  { kind: "tool", tool: "pickaxe", label: "Pickaxe", glyph: "⚒" },
  { kind: "seed", crop: "radish",  label: "Radish",  glyph: "🌱" },
  { kind: "seed", crop: "wheat",   label: "Wheat",   glyph: "🌾" },
  { kind: "seed", crop: "pumpkin", label: "Pumpkin", glyph: "🎃" },
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
      if (player.pendingMove !== null) {
        player.facing = player.pendingMove;
        const { dx, dy } = DIR_DELTA[player.pendingMove]!;
        const nx = Math.round(transform.x) + dx;
        const ny = Math.round(transform.y) + dy;
        // Block the step onto unwalkable tiles AND onto trees/stones — you can't
        // walk through a feature, you chop/mine it from the tile in front.
        if (isWalkable(nx, ny) && !this.featureAt(nx, ny)) {
          transform.x = nx;
          transform.y = ny;
          farmer.movedThisTick = true;
          // Keep currentRegion in sync (TravelSystem does this for AI farmers).
          const region = regionAt(nx, ny);
          if (region !== null) farmer.currentRegion = region;
        }
        player.pendingMove = null;
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
   *   Can     → water a planted, not-yet-watered plot
   *   Hoe     → till bare ground on Pip's own farm
   *   Axe     → chop the tree in front
   *   Pickaxe → mine the stone in front
   *   Seed    → plant that crop on an empty owned plot (if a seed is held)
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

  /** True if a tree/stone feature occupies the tile (movement-blocking). */
  private featureAt(tx: number, ty: number): boolean {
    for (const f of this.world.query("tileFeature")) {
      if (f.tileFeature.tileX === tx && f.tileFeature.tileY === ty) return true;
    }
    return false;
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
