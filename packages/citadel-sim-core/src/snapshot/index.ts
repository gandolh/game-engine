/**
 * Snapshot types: what the sim worker posts to the main thread each tick.
 * Phase 0: terrain is static, so the snapshot is minimal — just tick + day.
 * Phase 1+ will extend RenderSnapshot with entity positions, build states, etc.
 */
export interface RenderSnapshot {
  readonly tick: number;
  readonly day: number;
  readonly speed: number; // ticks per second (for display)
}

// Messages sent from Worker → main thread
export type WorkerOutbound =
  | { type: "snapshot"; snapshot: RenderSnapshot }
  | { type: "ready" }; // emitted once after bootstrap

// Messages sent from main thread → Worker
export type WorkerInbound =
  | { type: "init"; seed: number; ticksPerDay: number }
  | { type: "pause" }
  | { type: "resume" }
  | { type: "speed"; multiplier: number };
