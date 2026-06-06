// Render snapshot — the serialized contract between the sim Web Worker (which
// owns the ECS `world`) and the main thread (which renders + drives the UI).
//
// The Worker can't share object references across postMessage, so each sim tick
// it emits one of these plain, structured-clone-friendly snapshots. The main
// thread keeps the latest two and interpolates sprite positions between them
// (the prevX/prevY interpolation that used to live on the entity Transform now
// happens by lerping snapshot[N-1] → snapshot[N]).
//
// Everything the main thread needs for rendering is captured here:
// sprites, observer rows, leaderboard rows, the shop slate, MEET indicators,
// focus positions, and the entity count.

import type { Canvas2dSprite, ProfileReport } from "@engine/core";
import type { ObserverSnapshot } from "../ui/observer";
import type { LeaderboardRow } from "../ui/leaderboard";
import type { ShopOffer } from "../agents/shop-slate";
import type { RunRecap } from "../run-recap";
import type { RelationshipMatrixData } from "../ui/relationship-matrix";
import type { RunHistoryRow } from "../systems/run-history";

// Re-export RelationshipMatrixData so snapshot consumers can import the type
// from this cross-thread contract module without depending on the UI file.
export type { RelationshipMatrixData };

// Re-export RunHistoryRow so snapshot consumers can import the type from this
// cross-thread contract module without depending on run-history.ts directly.
export type { RunHistoryRow };

/**
 * Per-farmer wealth time series for the wealth-over-time graph (brief 39).
 * One entry per farmer, carrying all historical gold-per-day rows plus the
 * farmer's display name and personality so the chart can label/color lines
 * without a second cross-reference lookup on the main thread.
 *
 * Structured-clone-friendly: plain object arrays, no Maps/Sets.
 */
export interface SnapshotWealthSeries {
  farmerId: number;
  name: string;
  personality: string;
  /** Rows in ascending day order. Each row is one RunHistoryRow entry. */
  rows: RunHistoryRow[];
}

// Re-export RunRecap so snapshot consumers can import the type from this
// cross-thread contract module without depending on run-recap.ts directly.
export type { RunRecap };

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
  /**
   * Current farmer action (from intentions queue head) — used by the main
   * thread to pick the work-pose frame or idle-bob offset.
   * null for non-farmer sprites.
   */
  action: string | null;
  /** Display name shown in the hover tooltip. null for anonymous sprites (crops, plots). */
  label: string | null;
  /** Longer description shown under the label in the hover tooltip. null for none. */
  description?: string | null;
  /**
   * Facing for directional sprites (farmers + work NPCs). "down" is the front
   * view (the base frame); "up" is the back; "side" is the right-facing profile.
   * Persists the last movement direction while idle. null for non-directional
   * sprites (structures, crops). See render-systems `resolveFrameAndBob`.
   */
  facing?: "down" | "up" | "side" | null;
  /** Mirror the sprite horizontally (used with facing "side" for leftward movement). */
  flipX?: boolean;
  /**
   * Intention bubble glyph frame (e.g. "indicator/intention-plant") to draw
   * above this AI farmer for the brief window after an intention change, or null
   * when no bubble should show. Only set for non-player farmer sprites; always
   * null for non-farmer sprites.
   * Brief 40.
   */
  bubble?: string | null;
}

/** Active MEET indicator for a farmer this tick. */
export interface SnapshotMeet {
  farmerId: number;
}

/** One formatted activity-feed line (newest entries are last in the array). */
export interface SnapshotEvent {
  /** Sim day for the "Day N —" prefix. */
  day: number;
  /** Narration text (no prefix). */
  text: string;
  /** Drama score in [0, 1]; higher = more significant. From drama.ts. */
  drama: number;
  /**
   * The primary farmer entity id involved in this event (winner of auction,
   * target of shock, etc.), or null when none is identifiable. Used by the main
   * thread to zoom-to the relevant farmer when the user clicks the feed entry.
   * Brief 40.
   */
  farmerId?: number | null;
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
/** brief 41 — crops is now a flexible partial map (all 8 kinds may appear). */
export interface FinalStandingRow extends LeaderboardRow {
  crops: Partial<Record<import("../components").CropKind, number>>;
}

/**
 * One hotbar slot's live display state. `text` is the count/charge readout
 * (e.g. "10/10", "x3", or "" for a durable tool); `available` dims the slot
 * when the player can't currently use it (e.g. a seed with zero in stock).
 */
export interface HotbarSlotState {
  label: string;
  glyph: string;
  text: string;
  available: boolean;
}

/**
 * Player (Pip) hotbar state for the bottom-center tool bar. Slots and their
 * order are defined by HOTBAR_SLOTS in systems/player-control.ts (1 Can,
 * 2 Hoe, 3 Axe, 4 Pickaxe, 5 Radish, 6 Wheat, 7 Pumpkin). `selected` is the
 * active slot index the action key uses. null when there is no player entity.
 */
export interface PlayerHotbar {
  slots: HotbarSlotState[];
  selected: number;
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
  /** Activity-feed lines (oldest-first, capped); panel renders newest-first. */
  events: SnapshotEvent[];
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
  /**
   * End-of-run recap (standings with rank-delta, per-farmer arcs, headline).
   * Present only when gameOver is true; null otherwise.
   */
  recap: RunRecap | null;
  /** Player hotbar state, or null when there is no player-controlled farmer. */
  playerHotbar: PlayerHotbar | null;
  /**
   * Trust matrix for the relationship grid panel. Contains each farmer's trust
   * toward every peer as a plain Record (structured-clone-friendly).
   * Brief 37.
   */
  relationships: RelationshipMatrixData;
  /**
   * Active named rivalries (accumulated adverse history ≥ threshold) with
   * resolved farmer names for the panel and end-of-run recap. Brief 37.
   */
  rivalries: SnapshotRivalry[];
  /**
   * Per-farmer wealth time series for the wealth-over-time line chart.
   * One entry per farmer, with all per-day gold rows captured so far.
   * Live-updated every snapshot so the chart redraws as the run progresses.
   * Brief 39.
   */
  wealthSeries: SnapshotWealthSeries[];
  /**
   * brief 45 — current weather + season, for the render-only rain/snow ambient
   * overlay (main.ts) and any weather UI. Pure render input — drawn over the
   * frame, never read by sim logic.
   */
  weather: {
    condition: import("../protocols/weather").WeatherCondition;
    season: import("../protocols/weather").Season;
  };
  /**
   * brief 45 — the festival firing today, or null. Lets the UI surface the
   * calendar landmark. Pure render input.
   */
  festival: { id: string; name: string; contestCrop: string } | null;
}

/** One active rivalry/alliance entry, structured-clone-friendly. */
export interface SnapshotRivalry {
  aId: number;
  bId: number;
  aName: string;
  bName: string;
  score: number;
  kind: "rivalry" | "alliance";
}

// ---- Worker protocol messages ------------------------------------------

/** main → worker: start a run with these options. */
export interface WorkerInitMsg {
  type: "init";
  seed: number;
  ticksPerDay: number;
  maxDays: number;
  tickRateHz: number;
  /** Raw bytes of pathfinding.wasm — worker instantiates its own Pathfinder. */
  pathfinderWasm?: ArrayBuffer;
}

/** main → worker: stop ticking. */
export interface WorkerStopMsg {
  type: "stop";
}

/**
 * main → worker: pause/resume ticking. While paused the interval keeps firing
 * but skips the tick body, so the sim does not advance (no snapshots posted).
 */
export interface WorkerPauseMsg {
  type: "pause";
  paused: boolean;
}

/**
 * main → worker: set the tick multiplier (1, 2, 4, …). At Nx the interval runs
 * N scheduler.tick iterations per fire — each posting its own snapshot — so the
 * sim simply advances faster in wall-clock terms. The tick COUNT is unchanged
 * for a given number of advances, so determinism is preserved.
 */
export interface WorkerSpeedMsg {
  type: "speed";
  multiplier: number;
}

/** main → worker: while paused, advance exactly one tick, then stay paused. */
export interface WorkerStepMsg {
  type: "step";
}

/**
 * main → worker: player (Pip) input for the next tick. `move` is a one-tile step
 * direction (or null for no movement this message); `action` requests the
 * context-sensitive field action on the faced tile. The worker buffers the most
 * recent values onto the player entity; PlayerControlSystem consumes them.
 */
export interface WorkerInputMsg {
  type: "input";
  /** Held horizontal/vertical move axes (both set = diagonal), or null. */
  moveX: "left" | "right" | null;
  moveY: "up" | "down" | null;
  action: boolean;
  /** Hotbar slot to select this message (0-based), or null for no change. */
  selectSlot: number | null;
}

/**
 * main → worker: turn the worker-side profiler on/off. When on, the worker
 * times scheduler.tick + snapshot build + snapshot byte size and posts a
 * WorkerProfileMsg every `PROFILE_REPORT_EVERY` ticks. Diagnostic only —
 * measures host timing, never sim state, so determinism is unaffected.
 */
export interface WorkerProfileToggleMsg {
  type: "profile";
  enabled: boolean;
}

/**
 * main → worker: fast-forward until the next event with drama ≥
 * HIGHLIGHT_THRESHOLD is produced, or a safety cap is hit. After stopping,
 * resumes at the prior pace. The final snapshot (the one containing the
 * high-drama event, or the last tick before the cap) is posted normally.
 * Brief 40.
 */
export interface WorkerSkipToHighlightMsg {
  type: "skipToHighlight";
}

export type WorkerInbound =
  | WorkerInitMsg
  | WorkerStopMsg
  | WorkerPauseMsg
  | WorkerSpeedMsg
  | WorkerStepMsg
  | WorkerInputMsg
  | WorkerProfileToggleMsg
  | WorkerSkipToHighlightMsg;

/** worker → main: the static backdrop sprites to bake (sent at startup AND on a
 *  season change — brief 45 re-bakes the season-variant ground tiles). */
export interface WorkerStaticLayerMsg {
  type: "static-layer";
  /** Full Canvas2dSprite (with width/height) since bakeStaticLayer needs those. */
  sprites: Canvas2dSprite[];
  worldWidthPx: number;
  worldHeightPx: number;
  /** brief 45 — the season these sprites were baked for (selects the grass variant). */
  season?: import("../protocols/weather").Season;
}

/** worker → main: a per-tick render snapshot. */
export interface WorkerSnapshotMsg {
  type: "snapshot";
  snapshot: RenderSnapshot;
}

/**
 * worker → main: periodic profiling report (only while profiling is enabled).
 * `tick` is the tick the report was emitted on; `report` holds rolling stats for
 * the worker-side metrics ("tick", "snapshot.build", "snapshot.bytes").
 */
export interface WorkerProfileMsg {
  type: "profile";
  tick: number;
  report: ProfileReport;
}

export type WorkerOutbound =
  | WorkerStaticLayerMsg
  | WorkerSnapshotMsg
  | WorkerProfileMsg;
