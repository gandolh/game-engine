/**
 * snapshot-builder.ts — builds a per-tick RenderSnapshot from the live ECS
 * world, dayClock, and meet-indicator state.
 *
 * All sprite positions are emitted in PIXEL space (tileX * 16 + 8) because
 * Canvas2dRenderer.push expects pixel coords. The main thread interpolates
 * farmer sprites (interpolate: true) between consecutive snapshots; other
 * sprites (crops, shopkeeper, market-wall) use the raw pixel position.
 *
 * This module is pure logic — it does NOT subscribe to the bus or hold state.
 * Shock capture is done by the caller (sim-worker) which subscribes once and
 * passes the pending shock body into buildRenderSnapshot.
 */

import type { World } from "@engine/core";
import type { GameEntity } from "../components";
import type { DayClockSystem } from "../systems/day-clock";
import type { MeetIndicatorSystem } from "../systems/meet-indicator";
import type { EventFeedSystem } from "../systems/event-feed";
import type { RunHistoryRow } from "../systems/run-history";
import type { RivalrySystem } from "../systems/rivalry";
import type {
  RenderSnapshot,
  SnapshotSprite,
  SnapshotMeet,
  SnapshotEvent,
  SnapshotShock,
  SnapshotRivalry,
  FinalStandingRow,
  RelationshipMatrixData,
} from "./snapshot";
import type { ObserverSnapshot } from "../ui/observer";
import type { LeaderboardRow } from "../ui/leaderboard";
import { leaderboard } from "../sim-bootstrap";
import type { FarmerSummary } from "../sim-bootstrap";
import { pickFarmerFrame } from "../render-systems";
import { HOTBAR_SLOTS } from "../systems/player-control";
import { seasonForDay } from "../protocols";
import { summarizeRun } from "../run-recap";

const TILE = 16;

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

// ---------------------------------------------------------------------------
// Region-label helper (mirrors the one in main.ts)
// ---------------------------------------------------------------------------

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

// Friendly hover name + blurb for the decorative props (sprite-only entities
// with no identifying component — keyed off their `sprite.frame`). Keeping it a
// frame→label map means a new `decoration/*` prop just needs one entry here to
// become hover-able.
const DECORATION_LABELS: Record<string, { label: string; description: string }> = {
  "decoration/barrel": { label: "Barrel", description: "A storage barrel — just scenery." },
  "decoration/crate": { label: "Crate", description: "A wooden crate — just scenery." },
  "decoration/potted-plant": { label: "Potted Plant", description: "A potted plant — just scenery." },
  "decoration/lamp-post": { label: "Lamp Post", description: "Lights the village at night — just scenery." },
  "decoration/signpost": { label: "Signpost", description: "A village signpost — just scenery." },
  "decoration/hay-bale": { label: "Hay Bale", description: "A bale of hay — just scenery." },
  "decoration/bush": { label: "Bush", description: "A leafy bush — just scenery." },
  "decoration/log-stack": { label: "Log Stack", description: "Stacked logs — just scenery." },
};

// ---------------------------------------------------------------------------
// Observer snapshot (mirrors buildObserverSnapshot in main.ts)
// ---------------------------------------------------------------------------

export function buildObserverSnapshot(
  world: World<GameEntity>,
  day: number,
): ObserverSnapshot {
  const station = (() => {
    for (const w of world.query("weatherStation")) return w.weatherStation;
    return null;
  })();

  const farmerEntries: ObserverSnapshot["farmers"] = [];
  for (const f of world.query("farmer", "inventory", "fsm", "ap", "personality")) {
    if (f.id === undefined) continue;
    // brief 19 — decision rationale trace ("why") for the focused farmer.
    const queue = f.intentions?.queue ?? [];
    farmerEntries.push({
      id: f.id,
      name: f.farmer.name,
      personality: f.personality.kind,
      gold: f.inventory.gold,
      crops: {
        radish: f.inventory.crops.radish,
        wheat: f.inventory.crops.wheat,
        pumpkin: f.inventory.crops.pumpkin,
      },
      fsm: f.fsm.current,
      apCurrent: f.ap.current,
      apMax: f.ap.max,
      apPenaltyPending: f.ap.penaltyPending,
      region: deriveRegionLabel(
        f.farmer.name,
        f.farmer.currentRegion,
        f.farmer.path !== undefined,
      ),
      currentIntention: queue[0]?.kind ?? null,
      nextIntention: queue[1]?.kind ?? null,
      reasons: f.decisionTrace ? [...f.decisionTrace.reasons] : [],
    });
  }
  farmerEntries.sort((a, b) => a.id - b.id);

  return {
    day,
    // brief 22 — current season for the observer header. Prefer the station's
    // stamped season; fall back to the pure schedule fn for the pre-day-1 frame.
    season: station?.season ?? seasonForDay(day),
    weather: {
      condition: station?.current ?? "normal",
      multiplier: station?.multiplier ?? 1,
    },
    forecast: (station?.forecast ?? []).map((f) => ({
      condition: f.condition,
      confidence: f.confidence,
    })),
    farmers: farmerEntries,
  };
}

// ---------------------------------------------------------------------------
// Leaderboard rows (mirrors buildLeaderboardRows in main.ts)
// ---------------------------------------------------------------------------

export function buildLeaderboardRows(summaries: FarmerSummary[]): LeaderboardRow[] {
  return summaries.map((summary, index) => ({
    rank: index + 1,
    id: summary.id,
    name: summary.name,
    personality: summary.personality,
    gold: summary.gold,
    unsoldValue: summary.unsoldValue,
    totalValue: summary.totalValue,
  }));
}

// ---------------------------------------------------------------------------
// Final standings (leaderboard + crop counts for game-over panel)
// ---------------------------------------------------------------------------

function buildFinalStandings(summaries: FarmerSummary[]): FinalStandingRow[] {
  return summaries.map((summary, index) => ({
    rank: index + 1,
    id: summary.id,
    name: summary.name,
    personality: summary.personality,
    gold: summary.gold,
    unsoldValue: summary.unsoldValue,
    totalValue: summary.totalValue,
    crops: {
      radish: summary.crops.radish,
      wheat: summary.crops.wheat,
      pumpkin: summary.crops.pumpkin,
    },
  }));
}

// ---------------------------------------------------------------------------
// Entity count (mirrors countEntities in main.ts)
// ---------------------------------------------------------------------------

export function countEntities(world: World<GameEntity>): number {
  let n = 0;
  for (const _ of world.query("transform")) n += 1;
  for (const _ of world.query("plot")) n += 1;
  return n;
}

// ---------------------------------------------------------------------------
// Sprite building
// ---------------------------------------------------------------------------

function buildSprites(world: World<GameEntity>, tick: number): SnapshotSprite[] {
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
    });
  }

  return sprites;
}

// ---------------------------------------------------------------------------
// Meet indicators
// ---------------------------------------------------------------------------

function buildMeets(meetIndicators: MeetIndicatorSystem, tick: number): SnapshotMeet[] {
  return meetIndicators.active(tick).map((entry) => ({ farmerId: entry.farmerId }));
}

// ---------------------------------------------------------------------------
// Activity feed
// ---------------------------------------------------------------------------

/** How many feed lines to ship in the snapshot (panel shows ~30). */
const EVENT_SNAPSHOT_CAP = 30;

// Reused output buffer for buildEvents — the events feed is rebuilt every tick,
// so we avoid the previous slice()+map() double allocation by mutating a pooled
// array in place (records reused; trimmed to the live count).
//
// ⚠️ ALIASING: the returned array is reused across calls. In production this is
// safe because the snapshot is structured-cloned by postMessage before the next
// build, so the main thread holds an independent copy. Callers that invoke
// buildRenderSnapshot twice ON THE SAME THREAD (tests, headless run-sim) must
// not retain and compare `snapshot.events` across the two calls — copy first.
// (Current same-thread callers only compare observer/leaderboard, never events.)
const eventsScratch: SnapshotEvent[] = [];

function buildEvents(eventFeed: EventFeedSystem): SnapshotEvent[] {
  // recent() is oldest-first; ship only the newest EVENT_SNAPSHOT_CAP lines.
  const all = eventFeed.recent();
  const start = Math.max(0, all.length - EVENT_SNAPSHOT_CAP);
  const n = all.length - start;
  const out = eventsScratch;
  for (let i = 0; i < n; i += 1) {
    const e = all[start + i]!;
    const rec = out[i];
    if (rec === undefined) out[i] = { day: e.day, text: e.text, drama: e.drama };
    else { rec.day = e.day; rec.text = e.text; rec.drama = e.drama; }
  }
  if (out.length !== n) out.length = n;
  return out;
}

// ---------------------------------------------------------------------------
// Relationship matrix (brief 37)
// ---------------------------------------------------------------------------

/**
 * Build the relationship matrix data from the current farmer trust states.
 * Missing trust entries fall back to the baseline 0.5 (same convention as
 * applyTrustDelta in trust.ts).
 */
export function buildRelationshipsData(world: World<GameEntity>): RelationshipMatrixData {
  const farmerList: Array<{ id: number; name: string; personality: string; entity: GameEntity }> = [];
  for (const f of world.query("farmer", "personality")) {
    if (f.id === undefined) continue;
    farmerList.push({
      id: f.id,
      name: f.farmer.name,
      personality: f.personality.kind,
      entity: f,
    });
  }
  // Sort by id for a deterministic, stable order.
  farmerList.sort((a, b) => a.id - b.id);

  const farmers = farmerList.map((f) => ({ id: f.id, name: f.name, personality: f.personality }));

  const trust: Record<number, Record<number, number>> = {};
  for (const from of farmerList) {
    trust[from.id] = {};
    for (const to of farmerList) {
      if (from.id === to.id) {
        // Diagonal: self-trust is not meaningful; use 1.0 as a sentinel so the
        // panel can render it as a blank/diagonal cell.
        trust[from.id]![to.id] = 1.0;
      } else {
        trust[from.id]![to.id] = from.entity.trust?.byId.get(to.id) ?? 0.5;
      }
    }
  }

  return { farmers, trust };
}

/**
 * Build the active rivalries list from the RivalrySystem, with resolved farmer
 * names included for the main thread. Returns [] if no rivalry system.
 */
export function buildRivalriesData(
  rivalrySystem: RivalrySystem | undefined,
): SnapshotRivalry[] {
  if (!rivalrySystem) return [];
  const out: SnapshotRivalry[] = [];

  for (const r of rivalrySystem.activeRivalries()) {
    out.push({
      aId: r.aId,
      bId: r.bId,
      aName: rivalrySystem.nameOf(r.aId),
      bName: rivalrySystem.nameOf(r.bId),
      score: r.score,
      kind: "rivalry",
    });
  }
  for (const a of rivalrySystem.activeAlliances()) {
    out.push({
      aId: a.aId,
      bId: a.bId,
      aName: rivalrySystem.nameOf(a.aId),
      bName: rivalrySystem.nameOf(a.bId),
      score: 0,
      kind: "alliance",
    });
  }
  // Sort by kind (rivalry first) then by pair key.
  out.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "rivalry" ? -1 : 1;
    const ka = `${a.aId}:${a.bId}`;
    const kb = `${b.aId}:${b.bId}`;
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  });
  return out;
}

// ---------------------------------------------------------------------------
// Main builder
// ---------------------------------------------------------------------------

/**
 * Build a complete RenderSnapshot for the current tick.
 *
 * @param pendingShock  A shock body captured by the bus subscriber this tick
 *                      (or null if none fired).
 * @param runHistoryRows  Per-day rank/gold rows from RunHistorySystem.history().
 *                        Used to build the RunRecap at game-over. Pass an empty
 *                        array (or omit via the default) for non-game-over ticks.
 * @param rivalrySystem  The RivalrySystem instance (brief 37). Optional for
 *                       back-compat with existing tests.
 */
export function buildRenderSnapshot(
  world: World<GameEntity>,
  dayClock: DayClockSystem,
  meetIndicators: MeetIndicatorSystem,
  eventFeed: EventFeedSystem,
  tick: number,
  maxDays: number,
  pendingShock: SnapshotShock | null,
  runHistoryRows: readonly RunHistoryRow[] = [],
  rivalrySystem?: RivalrySystem,
): RenderSnapshot {
  const day = dayClock.day;
  const gameOver = day >= maxDays;

  const sprites = buildSprites(world, tick);
  const meets = buildMeets(meetIndicators, tick);
  const events = buildEvents(eventFeed);
  const observer = buildObserverSnapshot(world, day);
  const lb = leaderboard(world);
  const lbRows = buildLeaderboardRows(lb);

  const shopEntity = (() => {
    for (const s of world.query("shopkeeper")) return s;
    return null;
  })();
  const slate = (shopEntity?.shopkeeper?.dailySlate ?? []) as import("../agents/shop-slate").ShopOffer[];

  const entityCount = countEntities(world);

  const finalSummary = gameOver ? buildFinalStandings(lb) : null;

  // Build the rivalry data for this tick.
  const rivalries = buildRivalriesData(rivalrySystem);
  const relationships = buildRelationshipsData(world);

  // Build the recap once at game-over from the full run history + events.
  // summarizeRun is a pure function: same inputs → identical recap.
  const recap = gameOver && finalSummary !== null
    ? summarizeRun(runHistoryRows, eventFeed.recent(), finalSummary, rivalries)
    : null;
  const playerHotbar = buildPlayerHotbar(world);

  return {
    tick,
    day,
    sprites,
    meets,
    events,
    observer,
    leaderboard: lbRows,
    slate,
    entityCount,
    shock: pendingShock,
    gameOver,
    finalSummary,
    recap,
    playerHotbar,
    relationships,
    rivalries,
  };
}

/**
 * Build the player (Pip) hotbar state from HOTBAR_SLOTS, or null when there is
 * no player entity. Each slot reports its live count/charge readout and whether
 * it can currently be used (tools are always available; seeds dim at zero).
 */
function buildPlayerHotbar(world: World<GameEntity>): import("./snapshot").PlayerHotbar | null {
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
