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
  // Citadel 28/35: owning player id (for MP team-colour rendering + routing).
  readonly ownerId: number;
  // Phase 4.5: hazard state
  readonly onFire: boolean;
  readonly burning: boolean;
  // Citadel 08: upgrade level (1..3)
  readonly level: number;
}

/** One villager as seen by the renderer. */
export interface VillagerSnapshot {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly fsm: string;
  readonly carryGood: string | null;
}

/** Phase 4: one raider group as seen by the renderer. */
export interface RaiderSnapshot {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly strength: number;
}

/** Citadel 32: one in-flight PvP army as seen by the renderer. */
export interface ArmySnapshot {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly strength: number;
  readonly attackerId: number;
  readonly targetPlayerId: number;
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
  // Phase 3: happiness + needs + decrees + trader
  readonly happiness: number;
  readonly faithCoverage: number;
  readonly safetyCoverage: number;
  readonly goodsCoverage: number;
  readonly activeDecrees: readonly string[];
  readonly traderPresent: boolean;
  readonly traderOffers: readonly { give: string; giveQty: number; receive: string; receiveQty: number }[];
  // Phase 4: siege
  readonly raiders: readonly RaiderSnapshot[];
  // Citadel 32: in-flight PvP armies (empty in solo)
  readonly armies: readonly ArmySnapshot[];
  readonly threatLevel: number;
  readonly nextRaidDay: number;          // approximate day of next raid (-1 if unscheduled)
  readonly defensiveStrength: number;
  readonly keepPresent: boolean;
  readonly keepSacked: boolean;
  // Phase 4.5: hazards
  readonly sickVillagers: number;
  readonly outbreakActive: boolean;
  readonly activeFires: number;          // count of burning buildings
  // Phase 5: settlement tier
  readonly tier: string;                 // e.g. "Hamlet", "Village", "Town", … (current; can demote)
  readonly peakTier: string;             // highest tier ever reached; gates build/upgrade buttons
  // Citadel 09: total goods held in the tithe relief reserve (0 if no tithe accrued).
  readonly reliefReserve: number;
}

// ---------------------------------------------------------------------------
// Phase 5: save/load types (live here so snapshot + sim-bootstrap both use them)
// ---------------------------------------------------------------------------

/** Serializable save format — just the ordered command log and sim options. */
export interface CitadelSave {
  readonly version: 1;
  readonly seed: number;
  readonly ticksPerDay: number;
  readonly startDay: number;
  /** The tick at which the save was taken — loadFromSave replays up to this tick. */
  readonly currentTick: number;
  readonly commandLog: ReadonlyArray<{ tick: number; command: CitadelCommand }>;
}

/** Citadel 36: ephemeral relay messages — NEVER stamped into the command log. */
export interface RosterEntry { readonly playerId: number; readonly alive: boolean }

// Messages sent from Worker / server → main thread
export type WorkerOutbound =
  | { type: "snapshot"; snapshot: RenderSnapshot }
  | { type: "ready" }                              // emitted once after bootstrap
  | { type: "save-data"; save: CitadelSave }       // Phase 5: save response
  // Citadel 36: ephemeral social layer (relayed, OFF the command log)
  | { type: "roster"; players: readonly RosterEntry[] }
  | { type: "presence"; playerId: number; cursorX: number; cursorY: number; tool: string }
  | { type: "emote"; playerId: number; emote: string };

// Messages sent from main thread → Worker
export type WorkerInbound =
  | { type: "init"; seed: number; ticksPerDay: number }
  | { type: "pause" }
  | { type: "resume" }
  | { type: "speed"; multiplier: number }
  | { type: "command"; command: CitadelCommand }
  | { type: "request-save" }                       // Phase 5: request a save blob
  | { type: "load-save"; save: CitadelSave }        // Phase 5: load from save
  // Citadel 36: ephemeral social layer (relayed, NEVER enqueued into the log)
  | { type: "presence"; cursorX: number; cursorY: number; tool: string }
  | { type: "emote"; emote: string };

// ---------------------------------------------------------------------------
// Concrete citadel command union (lives in sim-core, not in @engine/core)
// ---------------------------------------------------------------------------

export type CitadelCommand =
  | { type: "placeBuilding"; payload: { buildingType: string; x: number; y: number } }
  | { type: "demolish"; payload: { x: number; y: number } }
  | { type: "placeRoad"; payload: { tiles: Array<{ x: number; y: number }> } }
  | { type: "placeWall"; payload: { tiles: Array<{ x: number; y: number }> } }
  | { type: "setDecree"; payload: { decree: string; active: boolean } }
  | { type: "barter"; payload: { offerIndex: number } }
  | { type: "upgradeBuilding"; payload: { x: number; y: number } }
  // Citadel 32: launch a PvP army at a targeted enemy building / town-hall.
  | { type: "launchAttack"; payload: { targetX: number; targetY: number; strength: number } }
  // Citadel 34: one-way gift of goods to another player (no alliance state).
  | { type: "gift"; payload: { to: number; good: string; amount: number } }
  // Citadel 35 (netcode): the server injects this before a peer's command to
  // route subsequent commands to that peer's player (multi-writer). Part of the
  // deterministic command stream so the log replays byte-identically.
  | { type: "setActivePlayer"; payload: { id: number } };
