import type { World } from "@engine/core";
import type { GameEntity, ItemRef } from "../components";
import type {
  SnapshotSprite,
} from "../snapshot";
import type { PlayerHotbar, PlayerInventory, ItemSlotState } from "../snapshot";
import { isFarmerMoving } from "../render-systems";
import { HOTBAR_SIZE, defaultItemSlots, resolveItem } from "../systems/player-control";
import {
  BUBBLE_SHOW_TICKS,
  DECORATION_LABELS,
  INTENTION_KIND_TO_GLYPH,
} from "./constants";
import { cropCue, farmerCue, UNTINTED_RGBA } from "./indicators";

const TILE = 16;

/**
 * Per-RUN render memo (last intention + facing per entity id). Must be per-run so the
 * Node server (multiple sims in one process) can't cross-contaminate facing/bubble state.
 * Callers that omit it (browser worker, tests) fall back to a module singleton.
 */
export class SnapshotSpriteState {
  readonly lastIntention = new Map<
    number,
    { kind: string; changedAtTick: number }
  >();
  readonly lastFacing = new Map<
    number,
    { facing: "down" | "up" | "side"; flipX: boolean }
  >();
  /** Row count at the last snapshot that carried wealthSeries; -1 forces the first send. */
  wealthRowsSent = -1;
}

/** Shared fallback for callers that don't supply their own per-run state. */
const defaultSpriteState = new SnapshotSpriteState();

// Vertical dominates ties; flipX mirrors the right-facing side profile for leftward movement.
function resolveFacing(
  state: SnapshotSpriteState,
  id: number,
  dx: number,
  dy: number,
): { facing: "down" | "up" | "side"; flipX: boolean } {
  if (dx === 0 && dy === 0) {
    return state.lastFacing.get(id) ?? { facing: "down", flipX: false };
  }
  let facing: "down" | "up" | "side";
  let flipX = false;
  if (Math.abs(dx) > Math.abs(dy)) {
    facing = "side";
    flipX = dx < 0; // side frame is authored right-facing; mirror for leftward
  } else {
    facing = dy < 0 ? "up" : "down";
  }
  const result = { facing, flipX };
  state.lastFacing.set(id, result);
  return result;
}

function deriveRegionLabel(
  name: string,
  currentRegion: string,
  isTraveling: boolean,
): string {
  if (isTraveling) return "traveling";
  if (currentRegion === "village") return "village";
  if (currentRegion === `farm-${name.toLowerCase()}`) return "home";
  return currentRegion;
}

export function buildSprites(
  world: World<GameEntity>,
  tick: number,
  day: number,
  state: SnapshotSpriteState = defaultSpriteState,
): SnapshotSprite[] {
  const sprites: SnapshotSprite[] = [];

  for (const plot of world.query("plot")) {
    if (plot.plot.state.kind !== "planted") continue;
    const px = plot.plot.tileX * TILE + TILE / 2;
    const py = plot.plot.tileY * TILE + TILE / 2;
    const { crop, daysGrowing, readyAtDay } = plot.plot.state;
    const stage = daysGrowing >= readyAtDay ? "mature" : daysGrowing > 0 ? "growing" : "seed";
    const cap = crop.charAt(0).toUpperCase() + crop.slice(1);
    const stageWord = stage === "mature" ? "ready to harvest" : stage === "growing" ? "growing" : "just sown";
    const watered = plot.plot.state.wateredToday ? "watered today" : "needs water";
    const cue = cropCue(plot.plot.state);
    sprites.push({
      id: null,
      x: px,
      y: py,
      rotation: 0,
      layer: 10,
      frame: `crop/${crop}/${stage}`,
      alpha: cue.alpha,
      tintRgba: cue.tintRgba,
      interpolate: false,
      action: null,
      label: `${cap} crop`,
      // toFixed(1) avoids a new float-string per tick for every crop sprite in the snapshot.
      description: `${stageWord} · ${watered} · day ${daysGrowing.toFixed(1)}/${readyAtDay}${cue.suffix}`,
    });
  }

  // Entity sprites (farmers, shopkeeper, market-wall, etc.).
  for (const entity of world.query("sprite", "transform")) {
    const t = entity.transform;
    // AI farmers use renderPos (sub-tile glide set by TravelSystem); Pip uses continuous transform.
    const rp = entity.farmer?.renderPos;
    const posX = rp ? rp.x : t.x;
    const posY = rp ? rp.y : t.y;
    const px = posX * TILE + TILE / 2;
    const py = posY * TILE + TILE / 2;
    const s = entity.sprite;
    const tint = s.tintRgba >>> 0;
    const isFarmer = entity.farmer !== undefined;
    const npc = entity.workNpc;

    let facing: "down" | "up" | "side" | null = null;
    let flipX = false;
    let frame = s.frame;
    let moving = false;
    if (npc) {
      facing = npc.facing;
      flipX = npc.flipX;
      frame = npc.poseFrame ?? s.frame; // poseFrame overrides the base frame
    } else if (isFarmer) {
      // Pip carries authoritative 4-way facing from PlayerControlSystem; map to 3-way + flipX.
      if (entity.player) {
        const pf = entity.player.facing;
        if (pf === "left" || pf === "right") {
          facing = "side";
          flipX = pf === "left";
        } else {
          facing = pf; // "up" | "down"
        }
      } else {
        const f = resolveFacing(state, entity.id ?? -1, t.x - t.prevX, t.y - t.prevY);
        facing = f.facing;
        flipX = f.flipX;
      }
      // frame stays the base look ("farmer/<p>"); the renderer resolves the walk cycle.
      moving = isFarmerMoving(entity);
    }
    const action = isFarmer ? (entity.intentions?.queue[0]?.kind ?? null) : null;

    // Intention bubble: shown for BUBBLE_SHOW_TICKS after a change; AI farmers only (not Pip).
    let bubble: string | null = null;
    const isAiFarmer = isFarmer && !entity.player;
    if (isAiFarmer && entity.id !== undefined) {
      const currentKind = action ?? "idle";
      const prev = state.lastIntention.get(entity.id);
      const changed = prev === undefined || prev.kind !== currentKind;
      if (changed) {
        state.lastIntention.set(entity.id, { kind: currentKind, changedAtTick: tick });
      }
      const changedAtTick = state.lastIntention.get(entity.id)?.changedAtTick ?? tick;
      if (tick - changedAtTick < BUBBLE_SHOW_TICKS) {
        bubble = INTENTION_KIND_TO_GLYPH[currentKind] ?? null;
      }
    }

    let label: string | null = null;
    let description: string | null = null;
    const cue = isFarmer ? farmerCue(entity, day) : null;

    if (isFarmer) {
      label = entity.farmer!.name;
      const kind = entity.personality?.kind ?? "farmer";
      const gold = entity.inventory?.gold ?? 0;
      const region = entity.farmer!.currentRegion;
      const who = entity.player ? "You (player)" : `${kind} farmer`;
      const doing = action ? `, ${action}` : "";
      description = `${who} · ${gold}g · ${region}${doing}${cue!.suffix}`;
    } else if (entity.blacksmith) {
      label = "Blacksmith";
      description = "Forges tool upgrades — bring ore and gold to buy stone/iron tools.";
    } else if (entity.carpenter) {
      label = "Carpenter";
      description = "Builds wood kits and structures from logs.";
    } else if (entity.shopkeeper) {
      label = "Shopkeeper";
      description = "Buys your crops and sells the daily seed/tool slate.";
    } else if (entity.marketWall) {
      label = "Market";
      description = "The village market — prices move with supply and demand.";
    } else if (entity.mill) {
      label = "Miller";
      description = "Grinds wheat into flour for a better sale price.";
    } else if (entity.well) {
      label = "Well";
      description = "Refill your watering can here without walking home.";
    } else if (entity.auctionPodium) {
      label = "Auction Podium";
      description = "Where farmers gather to bid on the daily contract.";
    } else if (entity.noticeBoard) {
      // Show today's posted bounty on hover (or a default when none yet).
      label = "Notice Board";
      description = entity.noticeBoard.bountyText ?? "Today's bounty is posted here.";
    } else if (entity.fishingSpot) {
      label = "Fishing Spot";
      description = "Cast a fishing rod here (from the tile in front) — 1 AP, lands a minnow, bass, or salmon.";
    } else if (entity.fountain) {
      label = "Fountain";
      description = "Refill your watering can at your farm's fountain.";
    } else if (entity.home) {
      label = "Farmhouse";
      description = "Sleep here to end the day and bank your rest bonus.";
    } else if (entity.tileFeature) {
      if (entity.tileFeature.kind === "tree") {
        label = "Tree";
        description = "Chop with the axe (from the tile in front) for wood — and the odd seed.";
      } else if (entity.tileFeature.kind === "stone") {
        label = "Stone";
        description = "Mine with the pickaxe (from the tile in front) for stone.";
      } else {
        label = "Berry Bush";
        description = "Click to forage it for a random seed — no tool needed.";
      }
    } else {
      const deco = DECORATION_LABELS[frame];
      if (deco) {
        label = deco.label;
        description = deco.description;
      }
    }
    sprites.push({
      id: entity.id ?? null,
      x: px,
      y: py,
      rotation: t.rotation,
      layer: s.layer,
      frame,
      // Farmers: alpha+tint from state cue. Non-farmers: alpha from sprite tint's low byte.
      alpha: cue ? cue.alpha : (tint & 0xff) / 255,
      tintRgba: cue ? cue.tintRgba : UNTINTED_RGBA,
      // Tile-stepping movers get snapshot interpolation so they glide instead of
      // snapping one tile per step (brief 82). Today that is farmers + work NPCs
      // (blacksmith/carpenter, whose transform steps a whole tile every few ticks).
      // Deliberately NOT a shared-component predicate — there is no common movement
      // marker to key off. Excluded by design: livestock (penned, never tile-step),
      // boats (a farmer aboard already glides via farmer.renderPos on the BOAT grid),
      // and ambient life (client-side render-only, can't snap). A future sim-side
      // mover species must be added here or it will visibly teleport. The client
      // clamps genuine jumps (>2 tiles) so a flagged sprite never smears on travel.
      interpolate: isFarmer || npc !== undefined,
      action,
      moving,
      label,
      description,
      facing,
      flipX,
      bubble,
    });
  }

  return sprites;
}

/** Resolve one item-grid slot to its display state (null ref → empty slot). */
function buildSlotState(
  ref: ItemRef | null,
  inv: NonNullable<GameEntity["inventory"]>,
  resources: GameEntity["resources"],
): ItemSlotState {
  if (ref === null) {
    return { ref: null, label: "", glyph: "", frame: "", text: "", available: false, actionable: false };
  }
  const r = resolveItem(ref, inv, resources);
  return { ref, label: r.label, glyph: r.glyph, frame: r.frame, text: r.text, available: r.available, actionable: r.actionable };
}

/** Build Pip's full item grid; null when no player entity. Falls back to the default layout if unset. */
export function buildPlayerInventory(world: World<GameEntity>): PlayerInventory | null {
  for (const e of world.query("player", "inventory")) {
    const inv = e.inventory;
    const layout = e.player?.itemSlots ?? defaultItemSlots();
    const slots = layout.map((ref) => buildSlotState(ref, inv, e.resources));
    return { slots, hotbarSize: HOTBAR_SIZE, selected: e.player?.selectedSlot ?? 0, gold: inv.gold };
  }
  return null;
}

/** Project the bottom hotbar (first HOTBAR_SIZE slots) from an already-built item grid. */
export function buildPlayerHotbar(grid: PlayerInventory | null): PlayerHotbar | null {
  if (grid === null) return null;
  const slots = grid.slots.slice(0, grid.hotbarSize).map((s) => ({
    label: s.label, glyph: s.glyph, frame: s.frame, text: s.text, available: s.available,
  }));
  return { slots, selected: grid.selected };
}

export { deriveRegionLabel };
