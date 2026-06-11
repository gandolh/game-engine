// Protocol barrel. "Worker*" prefix is historical; transport is swappable (Web Worker today, WS server later).
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
  WorkerAttachMsg,
} from "./messages";
