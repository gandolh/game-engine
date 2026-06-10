// Worker protocol messages — the typed postMessage contract between the main
// thread and the sim Web Worker. WorkerInbound covers main → worker;
// WorkerOutbound covers worker → main.

import type { Canvas2dSprite, ProfileReport } from "@engine/core";
import type { RenderSnapshot } from "../snapshot/render-snapshot";

// ---- main → worker messages -----------------------------------------------

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

// ---- worker → main messages -----------------------------------------------

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
