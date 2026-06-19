/**
 * Snapshot types: what the sim worker posts to the main thread each tick.
 * Phase 2: adds villagers, stockpiles, population, seasons, and road commands.
 */

/** One placed building as seen by the renderer. */
export interface BuildingSnapshot {
  readonly type: string;
  readonly x: number; // tile column of top-left
  readonly y: number; // tile row of top-left
  readonly w: number; // footprint width in tiles
  readonly h: number; // footprint height in tiles
  readonly connected: boolean;
  readonly outputBuffer: number;
  readonly workerCount: number;
}

/** One villager as seen by the renderer. */
export interface VillagerSnapshot {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly fsm: string;
  readonly carryGood: string | null;
}

export interface RenderSnapshot {
  readonly tick: number;
  readonly day: number;
  readonly season: string;
  readonly speed: number; // ticks per second (for display)
  readonly buildings: readonly BuildingSnapshot[];
  readonly villagers: readonly VillagerSnapshot[];
  readonly stockpiles: Readonly<Record<string, number>>;
  readonly population: number;
  readonly popCap: number;
  readonly foodSurplus: number;
  readonly gameOver: boolean;
  readonly recentEvents: readonly string[];
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
  | { type: "demolish"; payload: { x: number; y: number } }
  | { type: "placeRoad"; payload: { tiles: Array<{ x: number; y: number }> } };
