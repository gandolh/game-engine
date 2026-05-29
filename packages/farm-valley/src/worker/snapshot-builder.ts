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
import type {
  RenderSnapshot,
  SnapshotSprite,
  SnapshotMeet,
  SnapshotEvent,
  SnapshotShock,
  FinalStandingRow,
} from "./snapshot";
import type { ObserverSnapshot } from "../ui/observer";
import type { LeaderboardRow } from "../ui/leaderboard";
import { leaderboard } from "../sim-bootstrap";
import { pickFarmerFrame } from "../render-systems";
import { seasonForDay } from "../protocols";

const TILE = 16;

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

export function buildLeaderboardRows(world: World<GameEntity>): LeaderboardRow[] {
  return leaderboard(world).map((summary, index) => ({
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

function buildFinalStandings(world: World<GameEntity>): FinalStandingRow[] {
  return leaderboard(world).map((summary, index) => ({
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
    sprites.push({
      id: null,
      x: px,
      y: py,
      rotation: 0,
      layer: 10,
      frame: `crop/${crop}/${stage}`,
      alpha: 1,
      interpolate: false,
    });
  }

  // Entity sprites (farmers, shopkeeper, market-wall, etc.).
  for (const entity of world.query("sprite", "transform")) {
    const t = entity.transform;
    // Emit RAW current-tick pixel position (no interpolation here).
    // The main thread lerps farmer sprites between prev and current snapshot.
    const px = t.x * TILE + TILE / 2;
    const py = t.y * TILE + TILE / 2;
    const s = entity.sprite;
    const tint = s.tintRgba >>> 0;
    const isFarmer = entity.farmer !== undefined;
    const frame = isFarmer ? pickFarmerFrame(entity, tick) : s.frame;
    sprites.push({
      id: entity.id ?? null,
      x: px,
      y: py,
      rotation: t.rotation,
      layer: s.layer,
      frame,
      alpha: (tint & 0xff) / 255,
      interpolate: isFarmer,
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

function buildEvents(eventFeed: EventFeedSystem): SnapshotEvent[] {
  // recent() is oldest-first; ship only the newest EVENT_SNAPSHOT_CAP lines.
  return eventFeed
    .recent()
    .slice(-EVENT_SNAPSHOT_CAP)
    .map((e) => ({ day: e.day, text: e.text }));
}

// ---------------------------------------------------------------------------
// Main builder
// ---------------------------------------------------------------------------

/**
 * Build a complete RenderSnapshot for the current tick.
 *
 * @param pendingShock  A shock body captured by the bus subscriber this tick
 *                      (or null if none fired).
 */
export function buildRenderSnapshot(
  world: World<GameEntity>,
  dayClock: DayClockSystem,
  meetIndicators: MeetIndicatorSystem,
  eventFeed: EventFeedSystem,
  tick: number,
  maxDays: number,
  pendingShock: SnapshotShock | null,
): RenderSnapshot {
  const day = dayClock.day;
  const gameOver = day >= maxDays;

  const sprites = buildSprites(world, tick);
  const meets = buildMeets(meetIndicators, tick);
  const events = buildEvents(eventFeed);
  const observer = buildObserverSnapshot(world, day);
  const lbRows = buildLeaderboardRows(world);

  const shopEntity = (() => {
    for (const s of world.query("shopkeeper")) return s;
    return null;
  })();
  const slate = (shopEntity?.shopkeeper?.dailySlate ?? []) as import("../agents/shop-slate").ShopOffer[];

  const entityCount = countEntities(world);

  const finalSummary = gameOver ? buildFinalStandings(world) : null;

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
  };
}
