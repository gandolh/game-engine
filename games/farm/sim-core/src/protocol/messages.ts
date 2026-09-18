

import type { ProfileReport } from "@engine/core";
import type { Sprite } from "@engine/core/render";
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

  sprites: Sprite[];
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

/**
 * Terminal message: a tick threw mid-scheduler and the host halted the run
 * rather than advance onto a world state no clean tick could have produced
 * (see decisions.md, "Farm sim-host tick-fault policy"). `tick` is the tick
 * that faulted — its systems ran partially and no snapshot was ever built
 * or sent for it, so the client's last "snapshot" message is the last known
 * *good* state. No further messages follow a `fault`.
 */
export interface SimFaultMsg {
  type: "fault";
  tick: number;
  message: string;
}

/**
 * A frame the server REFUSED — malformed input, or an `init` it will not serve (audit-42).
 *
 * Structured rather than prose so a client can branch on `code`. Non-terminal: the socket stays
 * open and well-formed traffic keeps working, because one bad frame should not cost a player
 * their run.
 */
export interface SimRejectedMsg {
  type: "rejected";
  /** The `type` of the frame that was refused, or `null` when it had none. */
  forType: string | null;
  code: string;
  /** The offending field, when the rejection names one. */
  field?: string;
  message: string;
}

export type SimOutbound =
  | SimStaticLayerMsg
  | SimSnapshotMsg
  | SimProfileMsg
  | SimAttachMsg
  | SimRejectedMsg
  | SimFaultMsg;
