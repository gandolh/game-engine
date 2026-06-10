/**
 * snapshot-builder/sprites.ts — per-tick sprite list from live ECS world.
 *
 * The render memos (lastIntention, lastFacing) live in a per-RUN
 * `SnapshotSpriteState` rather than module globals, so multiple sims in one
 * process (the Node server) don't cross-contaminate each other's cosmetic
 * facing/bubble state. Callers that omit it fall back to a shared default
 * (correct for one-sim-per-context: the legacy browser worker, tests).
 */

import type { World } from "@engine/core";
import type { GameEntity } from "../components";
import type {
  SnapshotSprite,
} from "../snapshot";
import type { PlayerHotbar } from "../snapshot";
import { pickFarmerFrame } from "../render-systems";
import { HOTBAR_SLOTS } from "../systems/player-control";
import {
  BUBBLE_SHOW_TICKS,
  DECORATION_LABELS,
  INTENTION_KIND_TO_GLYPH,
} from "./constants";
import { cropCue, farmerCue, UNTINTED_RGBA } from "./indicators";

const TILE = 16;

/**
 * Per-RUN render memo for the sprite builder: the last-seen intention kind (+ the
 * tick it changed, driving the on-change bubble window) and the last facing for
 * each entity id. Both are RENDER-ONLY — the sim is authoritative on positions;
 * these only smooth which way a sprite visually faces / when its bubble shows.
 *
 * This MUST be per-run, not a module singleton: the Node server (brief 57) runs
 * multiple sims in one process, so a shared map would let one run's leftover
 * facing bleed into another run's first ticks (a real cross-contamination bug
 * the single-sim-per-worker browser never hit). `buildRenderSnapshot` takes an
 * optional instance; the server passes a fresh one per connection. Callers that
 * omit it (the legacy browser worker, tests) fall back to a module singleton,
 * which is correct for one-sim-per-context use.
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
  /**
   * Run-history row count at the last snapshot that carried `wealthSeries`.
   * Rows only grow (one per farmer per day boundary), so an unchanged count
   * means the series the client already has is still current and the snapshot
   * sends `wealthSeries: null` instead. -1 forces the first snapshot to send.
   */
  wealthRowsSent = -1;
}

/** Shared fallback for callers that don't supply their own per-run state. */
const defaultSpriteState = new SnapshotSpriteState();

/**
 * Pick a 3-way facing from a per-tick movement delta. Vertical dominates ties
 * (more readable in top-down). `flipX` mirrors the right-facing side profile for
 * leftward movement. Stationary (0,0) keeps the entity's last facing.
 */
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

export function buildSprites(
  world: World<GameEntity>,
  tick: number,
  day: number,
  state: SnapshotSpriteState = defaultSpriteState,
): SnapshotSprite[] {
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
    // Visual state cue (RENDER-ONLY): thirsty / dying crops get a subtle tint +
    // tooltip suffix. Healthy crops return the untinted default.
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
      // daysGrowing advances by 1/ticksPerDay each tick — serialize it rounded
      // to 0.1 days so the tooltip string (sent for every crop sprite in every
      // snapshot) doesn't churn a fresh ~17-char float tail per tick.
      description: `${stageWord} · ${watered} · day ${daysGrowing.toFixed(1)}/${readyAtDay}${cue.suffix}`,
    });
  }

  // Entity sprites (farmers, shopkeeper, market-wall, etc.).
  for (const entity of world.query("sprite", "transform")) {
    const t = entity.transform;
    // AI farmers walking a path carry a RENDER-ONLY sub-tile glide position
    // (farmer.renderPos) set by TravelSystem to interpolate between waypoint
    // steps. The player (Pip) uses continuous float movement (brief 61): its
    // transform IS already smooth, so renderPos is always undefined for Pip and
    // we fall through to t.x/t.y, which is correct. The main thread still lerps
    // between consecutive snapshots (alpha) on top of this.
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
        const f = resolveFacing(state, entity.id ?? -1, t.x - t.prevX, t.y - t.prevY);
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
    // Visual state cue (RENDER-ONLY): exhausted / broken-tool farmers get a
    // subtle tint + tooltip suffix. Non-farmer sprites keep their sim tint and
    // stay untinted (default). farmerCue is a pure read of post-tick state.
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
      // Farmers: alpha + tint from the state cue (healthy → 1 / untinted).
      // Non-farmers: keep the alpha encoded in the sim sprite's tint; untinted.
      alpha: cue ? cue.alpha : (tint & 0xff) / 255,
      tintRgba: cue ? cue.tintRgba : UNTINTED_RGBA,
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
