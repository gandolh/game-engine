// protocol barrel — the transport-neutral message contract between the sim host
// (Web Worker today; Node WS server in brief 57) and the renderer client.
// Names retain the historical "Worker*" prefix; the transport is swappable.
export type {
  WorkerInbound,
  WorkerOutbound,
  WorkerInitMsg,
  WorkerStopMsg,
  WorkerPauseMsg,
  WorkerSpeedMsg,
  WorkerStepMsg,
  WorkerInputMsg,
  WorkerProfileToggleMsg,
  WorkerSkipToHighlightMsg,
  WorkerStaticLayerMsg,
  WorkerSnapshotMsg,
  WorkerProfileMsg,
} from "./messages";
