/**
 * Snapshot types: what the sim worker posts to the main thread each tick.
 * Phase 1: adds buildings[] to RenderSnapshot and a "command" inbound message.
 */

/** One placed building as seen by the renderer. */
export interface BuildingSnapshot {
  readonly type: string;
  readonly x: number; // tile column of top-left
  readonly y: number; // tile row of top-left
  readonly w: number; // footprint width in tiles
  readonly h: number; // footprint height in tiles
}

export interface RenderSnapshot {
  readonly tick: number;
  readonly day: number;
  readonly speed: number; // ticks per second (for display)
  readonly buildings: readonly BuildingSnapshot[];
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
  | { type: "speed"; multiplier: number }
  | { type: "command"; command: CitadelCommand };

// ---------------------------------------------------------------------------
// Concrete citadel command union (lives in sim-core, not in @engine/core)
// ---------------------------------------------------------------------------

export type CitadelCommand =
  | { type: "placeBuilding"; payload: { buildingType: string; x: number; y: number } }
  | { type: "demolish"; payload: { x: number; y: number } };
