// Render snapshot — the serialized contract between the sim Web Worker (which
// owns the ECS `world`) and the main thread (which renders + drives the UI).
//
// The Worker can't share object references across postMessage, so each sim tick
// it emits one of these plain, structured-clone-friendly snapshots. The main
// thread keeps the latest two and interpolates sprite positions between them
// (the prevX/prevY interpolation that used to live on the entity Transform now
// happens by lerping snapshot[N-1] → snapshot[N]).
//
// Everything the old render path read directly off `world` is captured here:
// sprites (for buildCanvasFrame), observer rows, leaderboard rows, the shop
// slate, MEET indicators, focus positions, and the entity count.

import type { Canvas2dSprite } from "@engine/core";
import type { ObserverSnapshot } from "../ui/observer";
import type { LeaderboardRow } from "../ui/leaderboard";
import type { ShopOffer } from "../agents/shop-slate";

/** One renderable sprite in tile coordinates (renderer converts to px). */
export interface SnapshotSprite {
  /** Stable entity id when this sprite is an entity (for focus halo lookup). */
  id: number | null;
  /** Tile-space position this tick. */
  x: number;
  y: number;
  rotation: number;
  layer: number;
  /** Resolved atlas frame (farmer walk-cycle already applied worker-side). */
  frame: string;
  /** Per-sprite alpha (from tint), 0..1. */
  alpha: number;
  /** True for farmer entities — main thread interpolates these against prev. */
  interpolate: boolean;
}

/** Active MEET indicator for a farmer this tick. */
export interface SnapshotMeet {
  farmerId: number;
}

/** A one-time shock event, surfaced once in the snapshot it fires on. */
export interface SnapshotShock {
  kind: string;
  day: number;
  targetFarmerId: number;
  targetName: string;
  plotsWiped: number;
}

/**
 * Final-standings row: LeaderboardRow plus the crop inventory snapshot. Used
 * only in `RenderSnapshot.finalSummary` so the game-over panel can print crop
 * counts without needing a second data source.
 */
export interface FinalStandingRow extends LeaderboardRow {
  crops: { radish: number; wheat: number; pumpkin: number };
}

/** Full per-tick render + UI snapshot. */
export interface RenderSnapshot {
  /** Sim tick this snapshot was produced on. */
  tick: number;
  /** Current sim day. */
  day: number;
  /** Sprites to draw (dynamic layer only; the static backdrop is baked once). */
  sprites: SnapshotSprite[];
  /** Active MEET indicators this tick. */
  meets: SnapshotMeet[];
  /** Observer panel data. */
  observer: ObserverSnapshot;
  /** Leaderboard rows. */
  leaderboard: LeaderboardRow[];
  /** Shop daily slate for the billboard. */
  slate: ShopOffer[];
  /** transform + plot entity count for the debug overlay. */
  entityCount: number;
  /** Set on the snapshot a shock fires; null otherwise. */
  shock: SnapshotShock | null;
  /** True once the sim reaches maxDays — main thread shows game-over. */
  gameOver: boolean;
  /** Final standings with crop counts, present only when gameOver is true. */
  finalSummary: FinalStandingRow[] | null;
}

// ---- Worker protocol messages ------------------------------------------

/** main → worker: start a run with these options. */
export interface WorkerInitMsg {
  type: "init";
  seed: number;
  ticksPerDay: number;
  maxDays: number;
  tickRateHz: number;
}

/** main → worker: stop ticking. */
export interface WorkerStopMsg {
  type: "stop";
}

export type WorkerInbound = WorkerInitMsg | WorkerStopMsg;

/** worker → main: the static backdrop sprites to bake once (sent at startup). */
export interface WorkerStaticLayerMsg {
  type: "static-layer";
  /** Full Canvas2dSprite (with width/height) since bakeStaticLayer needs those. */
  sprites: Canvas2dSprite[];
  worldWidthPx: number;
  worldHeightPx: number;
}

/** worker → main: a per-tick render snapshot. */
export interface WorkerSnapshotMsg {
  type: "snapshot";
  snapshot: RenderSnapshot;
}

export type WorkerOutbound = WorkerStaticLayerMsg | WorkerSnapshotMsg;
