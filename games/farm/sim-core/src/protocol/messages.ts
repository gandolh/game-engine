

import type { Canvas2dSprite, ProfileReport } from "@engine/core";
import type { RenderSnapshot } from "../snapshot/render-snapshot";

export interface WorkerInitMsg {
  type: "init";
  seed: number;
  ticksPerDay: number;
  maxDays: number;
  tickRateHz: number;

  pathfinderWasm?: ArrayBuffer;

  /**
   * Optional per-client identity. Folded into the server's run key so each
   * connection gets its own private run (and is therefore always its own
   * owner). Never enters sim logic — determinism is unaffected. Absent →
   * clients sharing seed/ticksPerDay/maxDays collapse onto one shared run.
   */
  clientId?: string;
}

export interface WorkerStopMsg {
  type: "stop";
}

export interface WorkerPauseMsg {
  type: "pause";
  paused: boolean;
}

export interface WorkerSpeedMsg {
  type: "speed";
  multiplier: number;
}

export interface WorkerStepMsg {
  type: "step";
}

export interface WorkerInputMsg {
  type: "input";

  moveX: "left" | "right" | null;
  moveY: "up" | "down" | null;
  action: boolean;

  selectSlot: number | null;

  actionTile?: { x: number; y: number } | null;
}

export interface WorkerSwapSlotsMsg {
  type: "swap-slots";
  a: number;
  b: number;
}

export interface WorkerProfileToggleMsg {
  type: "profile";
  enabled: boolean;
}

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
  | WorkerSwapSlotsMsg
  | WorkerProfileToggleMsg
  | WorkerSkipToHighlightMsg;

export interface WorkerStaticLayerMsg {
  type: "static-layer";

  sprites: Canvas2dSprite[];
  worldWidthPx: number;
  worldHeightPx: number;
  season?: import("../protocols/weather").Season;
}

export interface WorkerSnapshotMsg {
  type: "snapshot";
  snapshot: RenderSnapshot;
}

export interface WorkerProfileMsg {
  type: "profile";
  tick: number;
  report: ProfileReport;
}

export interface WorkerAttachMsg {
  type: "attach";
  owner: boolean;
}

export type WorkerOutbound =
  | WorkerStaticLayerMsg
  | WorkerSnapshotMsg
  | WorkerProfileMsg
  | WorkerAttachMsg;
