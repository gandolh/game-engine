/**
 * snapshot-builder/sprites.ts — per-tick sprite list from live ECS world.
 *
 * Module-level mutable Maps (lastIntention, lastFacing) are singletons for the
 * duration of the run. resolveFacing and buildSprites must share the same Maps;
 * they live in this module together to guarantee that invariant.
 */

import type { World } from "@engine/core";
import type { GameEntity } from "../../components";
import type {
  SnapshotSprite,
} from "../snapshot";
import type { PlayerHotbar } from "../snapshot";
import { pickFarmerFrame } from "../../render-systems";
import { HOTBAR_SLOTS } from "../../systems/player-control";
import {
  BUBBLE_SHOW_TICKS,
  DECORATION_LABELS,
  INTENTION_KIND_TO_GLYPH,
} from "./constants";

const TILE = 16;

/**
 * Worker-local state tracking the last-seen intention kind and the tick it was
 * last changed for each AI farmer entity id. Used to trigger the on-change
 * bubble visibility window (BUBBLE_SHOW_TICKS). The map grows to at most
 * N_FARMERS entries and lives for the duration of the run.
 */
const lastIntention = new Map<number, { kind: string; changedAtTick: number }>();

// Per-entity last facing, so a farmer keeps facing the way they last moved when
// they stop (rather than snapping back to "down"). Worker-local; the sim is
// authoritative on positions, this is purely a render-facing memo.
const lastFacing = new Map<number, { facing: "down" | "up" | "side"; flipX: boolean }>();

/**
 * Pick a 3-way facing from a per-tick movement delta. Vertical dominates ties
 * (more readable in top-down). `flipX` mirrors the right-facing side profile for
 * leftward movement. Stationary (0,0) keeps the entity's last facing.
 */
function resolveFacing(
  id: number,
  dx: number,
  dy: number,
): { facing: "down" | "up" | "side"; flipX: boolean } {
  if (dx === 0 && dy === 0) {
    return lastFacing.get(id) ?? { facing: "down", flipX: false };
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
  lastFacing.set(id, result);
  return result;
}

/**
 * Derive a human-readable region label from a farmer's raw region string.
 */
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

export function buildSprites(world: World<GameEntity>, tick: number): SnapshotSprite[] {
  const sprites: SnapshotSprite[] = [];

  // Dynamic crop sprites (planted plots only).
  for (const plot of world.query("plot")) {
    if (plot.plot.state.kind !== "planted") continue;
    const px = plot.plot.tileX * TILE + TILE / 2;
    const py = plot.plot.tileY * TILE + TILE / 2;
    const { crop, daysGrowing, readyAtDay } = plot.plot.state;
    const stage = daysGrowing >= readyAtDay ? "mature" : daysGrowing > 0 ? "growing" : "seed";
    const cap = crop.charAt(0).toUpperCase() + crop.slice(1);
    const stageWord = stage === "mature" ? "ready to harvest" : stage === "growing" ? "growing" : "just sown";
    const watered = plot.plot.state.wateredToday ? "watered today" : "needs water";
    sprites.push({
      id: null,
      x: px,
      y: py,
      rotation: 0,
      layer: 10,
      frame: `crop/${crop}/${stage}`,
      alpha: 1,
      interpolate: false,
      action: null,
      label: `${cap} crop`,
      description: `${stageWord} · ${watered} · day ${daysGrowing}/${readyAtDay}`,
    });
  }

  // Entity sprites (farmers, shopkeeper, market-wall, etc.).
  for (const entity of world.query("sprite", "transform")) {
    const t = entity.transform;
    // Farmers walking a path carry a RENDER-ONLY sub-tile glide position
    // (farmer.renderPos) that advances a fraction of a tile each tick, so the
    // per-tick snapshot shows continuous motion instead of a once-per-STEP_TICKS
    // full-tile jump. Prefer it when present; otherwise use the authoritative
    // integer transform. The main thread still lerps between consecutive
    // snapshots on top of this.
    const rp = entity.farmer?.renderPos;
    const posX = rp ? rp.x : t.x;
    const posY = rp ? rp.y : t.y;
    const px = posX * TILE + TILE / 2;
    const py = posY * TILE + TILE / 2;
    const s = entity.sprite;
    const tint = s.tintRgba >>> 0;
    const isFarmer = entity.farmer !== undefined;
    const npc = entity.workNpc;

    // Facing: farmers + work NPCs face the way they're moving (persisted while
    // idle). NPCs override with their station facing (set by WorkNpcSystem).
    let facing: "down" | "up" | "side" | null = null;
    let flipX = false;
    let frame = s.frame;
    if (npc) {
      facing = npc.facing;
      flipX = npc.flipX;
      // poseFrame (e.g. "npc/blacksmith/hammer-a") overrides; else the base
      // structure frame is replaced by a directional idle below in render.
      frame = npc.poseFrame ?? s.frame;
    } else if (isFarmer) {
      // The player (Pip) carries an authoritative 4-way facing (up/down/left/
      // right) set by PlayerControlSystem; map it to the 3-way side/up/down +
      // flipX convention so its directional assets resolve like the AI farmers'
      // (left/right both use the right-facing "side" frame, mirrored for left).
      // The movement-delta heuristic is unreliable for the player because it
      // can only see the *current* tick's step and snaps back to "down" the
      // instant it stops between key presses.
      if (entity.player) {
        const pf = entity.player.facing;
        if (pf === "left" || pf === "right") {
          facing = "side";
          flipX = pf === "left";
        } else {
          facing = pf; // "up" | "down"
        }
      } else {
        const f = resolveFacing(entity.id ?? -1, t.x - t.prevX, t.y - t.prevY);
        facing = f.facing;
        flipX = f.flipX;
      }
      frame = pickFarmerFrame(entity, tick);
    }
    const action = isFarmer ? (entity.intentions?.queue[0]?.kind ?? null) : null;

    // Brief 40 — intention bubble for AI farmers (NOT the player).
    // Legibility rule: show the bubble for BUBBLE_SHOW_TICKS after an intention
    // change so the map reads without becoming a wall of persistent icons. The
    // bubble disappears once the window expires and reappears on the next change.
    // Player (Pip) never gets a bubble (the player knows what they're doing).
    let bubble: string | null = null;
    const isAiFarmer = isFarmer && !entity.player;
    if (isAiFarmer && entity.id !== undefined) {
      const currentKind = action ?? "idle";
      const prev = lastIntention.get(entity.id);
      const changed = prev === undefined || prev.kind !== currentKind;
      if (changed) {
        lastIntention.set(entity.id, { kind: currentKind, changedAtTick: tick });
      }
      const changedAtTick = lastIntention.get(entity.id)?.changedAtTick ?? tick;
      if (tick - changedAtTick < BUBBLE_SHOW_TICKS) {
        bubble = INTENTION_KIND_TO_GLYPH[currentKind] ?? null;
      }
    }

    let label: string | null = null;
    let description: string | null = null;
    if (isFarmer) {
      label = entity.farmer!.name;
      const kind = entity.personality?.kind ?? "farmer";
      const gold = entity.inventory?.gold ?? 0;
      const region = entity.farmer!.currentRegion;
      const who = entity.player ? "You (player)" : `${kind} farmer`;
      const doing = action ? `, ${action}` : "";
      description = `${who} · ${gold}g · ${region}${doing}`;
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
        description = "Chop with the axe (from the tile in front) for wood.";
      } else {
        label = "Stone";
        description = "Mine with the pickaxe (from the tile in front) for stone.";
      }
    } else {
      // Decorative props carry no identifying component; name them by frame.
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
      alpha: (tint & 0xff) / 255,
      interpolate: isFarmer,
      action,
      label,
      description,
      facing,
      flipX,
      bubble,
    });
  }

  return sprites;
}

/**
 * Build the player (Pip) hotbar state from HOTBAR_SLOTS, or null when there is
 * no player entity. Each slot reports its live count/charge readout and whether
 * it can currently be used (tools are always available; seeds dim at zero).
 */
export function buildPlayerHotbar(world: World<GameEntity>): PlayerHotbar | null {
  for (const e of world.query("player", "inventory")) {
    const inv = e.inventory;
    const can = inv.wateringCan;
    const slots = HOTBAR_SLOTS.map((slot) => {
      if (slot.kind === "seed") {
        const n = inv.seeds[slot.crop];
        return { label: slot.label, glyph: slot.glyph, text: `x${n}`, available: n > 0 };
      }
      if (slot.tool === "can") {
        const text = can ? `${can.charges}/${can.maxCharges}` : "0/0";
        return { label: slot.label, glyph: slot.glyph, text, available: (can?.charges ?? 0) > 0 };
      }
      // hoe / axe / pickaxe — durable tools, no count.
      return { label: slot.label, glyph: slot.glyph, text: "", available: true };
    });
    return { slots, selected: e.player?.selectedSlot ?? 0 };
  }
  return null;
}

export { deriveRegionLabel };
