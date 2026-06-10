// Worker protocol messages — typed postMessage contract between main thread and sim Web Worker.
// WorkerInbound: main → worker; WorkerOutbound: worker → main.

import type { Canvas2dSprite, ProfileReport } from "@engine/core";
import type { RenderSnapshot } from "../snapshot/render-snapshot";

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

/** main → worker: pause/resume ticking. While paused the interval skips the tick body — sim does not advance. */
export interface WorkerPauseMsg {
  type: "pause";
  paused: boolean;
}

/**
 * main → worker: set the tick multiplier. At Nx the interval runs N scheduler.tick iterations per fire,
 * each posting its own snapshot. Tick COUNT is unchanged for a given number of advances — determinism preserved.
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
 * main → worker: player (Pip) input for the next tick. Worker buffers values onto the player entity;
 * PlayerControlSystem consumes them. Two axes allow diagonal movement.
 */
export interface WorkerInputMsg {
  type: "input";
  /** Held horizontal/vertical move axes (both set = diagonal), or null. */
  moveX: "left" | "right" | null;
  moveY: "up" | "down" | null;
  action: boolean;
  /** Hotbar slot to select (0-based), or null for no change. */
  selectSlot: number | null;
}

/** main → worker: turn the worker-side profiler on/off. Diagnostic only — never affects sim state or determinism. */
export interface WorkerProfileToggleMsg {
  type: "profile";
  enabled: boolean;
}

/** main → worker: fast-forward until the next event with drama ≥ HIGHLIGHT_THRESHOLD (or safety cap), then resume. */
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

/** worker → main: static backdrop sprites (sent at startup and on season change — season affects grass variant). */
export interface WorkerStaticLayerMsg {
  type: "static-layer";
  /** Full Canvas2dSprite (with width/height) since bakeStaticLayer needs those. */
  sprites: Canvas2dSprite[];
  worldWidthPx: number;
  worldHeightPx: number;
  season?: import("../protocols/weather").Season;
}

/** worker → main: per-tick render snapshot. */
export interface WorkerSnapshotMsg {
  type: "snapshot";
  snapshot: RenderSnapshot;
}

/** worker → main: periodic profiling report. `report` holds rolling stats for tick, snapshot.build, snapshot.bytes. */
export interface WorkerProfileMsg {
  type: "profile";
  tick: number;
  report: ProfileReport;
}

export type WorkerOutbound =
  | WorkerStaticLayerMsg
  | WorkerSnapshotMsg
  | WorkerProfileMsg;
