export type { ObserverSnapshot } from "./observer-types";
// Barrel — re-exports the full public API of the snapshot contract so that
// all consumers can import from "./snapshot" (or "../worker/snapshot") exactly
// as before, with zero changes to any consumer file.

// sprite / overlay types
export type { SnapshotSprite, SnapshotMeet, SnapshotEvent, SnapshotShock } from "./sprites";

// panel / HUD types
export type {
  SnapshotWealthSeries,
  SnapshotRivalry,
  FinalStandingRow,
  HotbarSlotState,
  PlayerHotbar,
} from "./panels";

// the big aggregate
export type { RenderSnapshot } from "./render-snapshot";

// worker protocol messages
export type {
  WorkerInitMsg,
  WorkerStopMsg,
  WorkerPauseMsg,
  WorkerSpeedMsg,
  WorkerStepMsg,
  WorkerInputMsg,
  WorkerProfileToggleMsg,
  WorkerSkipToHighlightMsg,
  WorkerInbound,
  WorkerStaticLayerMsg,
  WorkerSnapshotMsg,
  WorkerProfileMsg,
  WorkerOutbound,
} from "../protocol/messages";

// Pass-through re-exports — these were in the original snapshot.ts so that
// snapshot consumers can import these types from the cross-thread contract
// module without depending on the underlying UI / systems files directly.
// Paths are adjusted from the original "../..." (relative to worker/snapshot.ts)
// to "../../..." (relative to worker/snapshot/index.ts).
export type { LeaderboardRow, RelationshipMatrixData } from "./ui-types";
export type { RunHistoryRow } from "../systems/run-history";
export type { RunRecap } from "../run-recap";
