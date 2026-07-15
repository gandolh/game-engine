

import type { Canvas2dSprite, ProfileReport } from "@engine/core";
import type { RenderSnapshot } from "../snapshot/render-snapshot";

export interface SimInitMsg {
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

export interface SimStopMsg {
  type: "stop";
}

export interface SimPauseMsg {
  type: "pause";
  paused: boolean;
}

export interface SimSpeedMsg {
  type: "speed";
  multiplier: number;
}

export interface SimStepMsg {
  type: "step";
}

export interface SimInputMsg {
  type: "input";

  moveX: "left" | "right" | null;
  moveY: "up" | "down" | null;
  action: boolean;

  selectSlot: number | null;

  actionTile?: { x: number; y: number } | null;
}

export interface SimSwapSlotsMsg {
  type: "swap-slots";
  a: number;
  b: number;
}

export interface SimProfileToggleMsg {
  type: "profile";
  enabled: boolean;
}

export interface SimSkipToHighlightMsg {
  type: "skipToHighlight";
}

export type SimInbound =
  | SimInitMsg
  | SimStopMsg
  | SimPauseMsg
  | SimSpeedMsg
  | SimStepMsg
  | SimInputMsg
  | SimSwapSlotsMsg
  | SimProfileToggleMsg
  | SimSkipToHighlightMsg;

export interface SimStaticLayerMsg {
  type: "static-layer";

  sprites: Canvas2dSprite[];
  worldWidthPx: number;
  worldHeightPx: number;
  season?: import("../protocols/weather").Season;
}

export interface SimSnapshotMsg {
  type: "snapshot";
  snapshot: RenderSnapshot;
}

export interface SimProfileMsg {
  type: "profile";
  tick: number;
  report: ProfileReport;
}

export interface SimAttachMsg {
  type: "attach";
  owner: boolean;
}

export type SimOutbound =
  | SimStaticLayerMsg
  | SimSnapshotMsg
  | SimProfileMsg
  | SimAttachMsg;
