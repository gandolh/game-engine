/**
 * Snapshot types: what the sim worker posts to the main thread each tick.
 * Phase 2: adds villagers, stockpiles, population, seasons, and road commands.
 */
import type { BarterOffer } from "../sim-state";

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
  /**
   * How many villagers are CURRENTLY AT this building (render/HUD only): idle
   * residents counted at their home, workers counted at their workplace. A
   * villager in transit (walking) is on the road, not in any building's count —
   * so Σ occupancy + villagers-in-transit == population. Drives the per-building
   * occupancy badge. Render-derived; never read back by the sim.
   */
  readonly occupancy: number;
  // Citadel 28/35: owning player id (for MP team-colour rendering + routing).
  readonly ownerId: number;
  // Phase 4.5: hazard state
  readonly onFire: boolean;
  readonly burning: boolean;
  // Citadel 08: upgrade level (1..3)
  readonly level: number;
  // Phase A cozy pivot: per-house diegetic signal (render-only, house-meaningful).
  readonly lacksFaith: boolean;
  readonly lacksSafety: boolean;
  readonly lacksGoods: boolean;
  readonly mood: number;
}

/** One villager as seen by the renderer. */
export interface VillagerSnapshot {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly fsm: string;
  readonly carryGood: string | null;
  /**
   * The villager's job, derived READ-ONLY at snapshot time from the TYPE of the
   * workplace building it is assigned to (see `jobForBuildingType`). Stable and
   * deterministic — a pure read of existing sim state, never written back.
   *
   * Value set: "farmer" | "miller" | "baker" | "woodcutter" | "quarryman" |
   * "miner" | "sawyer" | "smith" | "priest" | "trader" | "watchman" |
   * "soldier" | "healer" | "idle". "idle" is an unassigned villager (no
   * resolvable workplace). See `VillagerJob` in entities/building.ts.
   */
  readonly job: string;
  /**
   * The villager's mood [0..100], read READ-ONLY from its HOME house's per-house
   * mood (Phase A). Defaults to 40 (the neutral seed) for a villager whose home
   * tile resolves to no building. Pure projection; never written back. Drives the
   * render-only posture/tint cue (Phase E) — layered on top of the job tint.
   */
  readonly mood: number;
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
  /** The owner id this snapshot is the view of (solo = 0; MP = the local seat). */
  readonly localPlayerId: number;
  /**
   * Citadel 97/13: whether the LOCAL player (`localPlayerId`) is the room host — the only
   * peer allowed to pause / resume / change speed of the shared sim. Solo (the Worker path)
   * is trivially host (always true); in an online room only the host peer sees this true, so
   * a non-host client greys out the room controls instead of showing a toggle that silently
   * does nothing. Host-authoritative: stamped per-peer by the server (and always-true by the
   * solo Worker); `getSnapshot` defaults it true.
   */
  readonly isHost: boolean;
  readonly day: number;
  readonly season: string;
  /**
   * Citadel 97/13: sim speed MULTIPLIER (1/2/4), host/worker-authoritative — drives the HUD's
   * active-speed highlight. Named "speed" historically (its doc read "ticks per second"), but
   * the value that actually flows here — and that the HUD needs — is the multiplier the host
   * paces at, NOT a ticks/sec figure; nothing consumed the ticks/sec meaning. Rederived
   * client-side from every snapshot, never optimistic local state.
   */
  readonly speed: number;
  /**
   * Citadel 97/13: whether the sim is paused, host/worker-authoritative (not optimistic
   * client-local state). Drives the pause-button label AND render interpolation — a paused sim
   * emits no fresh per-tick snapshots, so the client pins its interp alpha when this is true.
   */
  readonly paused: boolean;
  readonly buildings: readonly BuildingSnapshot[];
  readonly villagers: readonly VillagerSnapshot[];
  readonly stockpiles: Readonly<Record<string, number>>;
  readonly population: number;
  readonly popCap: number;
  readonly foodSurplus: number;
  readonly gameOver: boolean;
  readonly recentEvents: readonly string[];
  /**
   * Brief 97/20: monotonic count of ALL events ever pushed (never decreases, unaffected by the
   * `recentEvents` window's cap/eviction). `recentEvents` is a capped tail (see `pushEvent` in
   * sim-state.ts), so its length alone can't tell the client how many entries are actually new —
   * two frames can both show a full window while only one event was appended. The client diffs
   * on THIS field (see `newEventsSince` in the Citadel client's toast.ts), not on window length
   * or string matching, so two identical event strings in the window both toast correctly.
   */
  readonly eventsSeq: number;
  // Phase 3: happiness + needs + decrees + trader
  readonly happiness: number;
  readonly faithCoverage: number;
  readonly safetyCoverage: number;
  readonly goodsCoverage: number;
  readonly activeDecrees: readonly string[];
  readonly traderPresent: boolean;
  readonly traderOffers: readonly BarterOffer[];
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
  /**
   * Phase F (motivation): true when EVERY house the local player owns has all
   * three needs met (faith+safety+goods) AND there is at least one house. A pure
   * read over the per-house `lacks*` flags — no score, no number surfaced; the
   * client edge-triggers a single gentle "every home is prospering" banner when
   * this flips false→true. Deterministic projection.
   */
  readonly allHomesCovered: boolean;
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
  /**
   * Cozy-pivot economy options, persisted so replay reconstructs identical state
   * (a save taken with build costs on must replay with them on). Optional for
   * backward-compat with pre-feature saves (absent ⇒ free placement, no grant).
   */
  readonly chargeBuildCost?: boolean;
  /**
   * Cozy-pivot Phase D threat-demotion flag, persisted so replay reconstructs identical state.
   * Optional for backward-compat with pre-feature saves (absent ⇒ true, the bootstrap default).
   */
  readonly cozyThreats?: boolean;
  /**
   * MP/PvP army resolution flag, persisted so replay reconstructs identical state.
   * Optional for backward-compat with pre-feature saves (absent ⇒ true, the bootstrap default).
   */
  readonly enableArmy?: boolean;
  /**
   * Match mode, persisted so replay reconstructs identical state. It decides whether a `town-hall`
   * adopts the keep/raid anchor (`actsAsKeepAnchor`), and placements replay from the command log —
   * so replaying an MP save as solo would rebuild the halls WITHOUT their `keepPosition`, and the
   * raid clock along with them.
   * Optional for backward-compat with pre-feature saves (absent ⇒ false, the bootstrap default —
   * which is what every save written before brief 108 effectively recorded, since only solo saves).
   */
  readonly multiplayer?: boolean;
  /**
   * World dimensions, persisted so replay reconstructs the SAME grid. Without these, `loadFromSave`
   * rebuilt the engine-default 96×96 world and every replayed command beyond tile 95 was silently
   * rejected as out-of-bounds — so a 256×256 MP save could not be replayed at all.
   * Optional for backward-compat with pre-feature saves (absent ⇒ the 96×96 engine defaults, which
   * is what every save written before this field recorded, since only solo could load one).
   */
  readonly worldWidth?: number;
  readonly worldHeight?: number;
  /**
   * Cozy cold-open: whether the alive-town core was pre-seeded at bootstrap. Persisted so replay
   * re-seeds the SAME core before replaying the command log (the seed is applied at bootstrap, not
   * via the command log). Optional for backward-compat with pre-feature saves (absent ⇒ false,
   * the bootstrap default — an empty starting map).
   */
  readonly seedTown?: boolean;
  /**
   * Cozy cold-open: threshold of non-road buildings a player must own before fire/disease/raid
   * threats become possible (0 = disabled). Persisted so replay applies the same defer gate.
   * Optional for backward-compat with pre-feature saves (absent ⇒ 0, the bootstrap default).
   */
  readonly deferThreatsUntilBuildings?: number;
  readonly startingStock?: Readonly<Record<string, number>>;
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
  // `worldWidth`/`worldHeight`: the SOLO client generates the terrain it renders and
  // then tells the worker what size to build its sim at, so the two cannot disagree
  // (brief 110 — the client baked a 96×96 world while attached to a 256×256 sim, and
  // nothing noticed, because both read a shared exported constant that only ONE of
  // them was actually bound by). Omitted ⇒ the sim's own defaults.
  //
  // The deprecated MP server ignores these: there the server owns the world, and
  // decision #14 has it ship the grid to the client rather than trust a peer's size.
  | { type: "init"; seed: number; ticksPerDay: number; worldWidth?: number; worldHeight?: number }
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
  // Cozy pivot Phase G: the decree/policy lever is retired (rations/work-hours/
  // festivals are now autonomous, placement-driven). No handler is registered for
  // `setDecree` — it is kept in the union only so an older client's stray command
  // still type-checks and is silently dropped, not resurrected.
  | { type: "setDecree"; payload: { decree: string; active: boolean } }
  // Brief 97/21: content-addressed, NOT positional. `traderOffers` re-rolls daily, so an
  // `offerIndex` captured when the panel rendered can resolve to a different offer by the time
  // the command executes (a race between click and tick). The sim resolves this by matching
  // give/giveQty/receive/receiveQty against the LIVE menu and no-ops on mismatch (see the
  // `trade` handler in sim-bootstrap.ts) rather than trading whatever now sits at that index.
  | { type: "trade"; payload: BarterOffer }
  | { type: "upgradeBuilding"; payload: { x: number; y: number } }
  // Citadel 32: launch a PvP army at a targeted enemy building / town-hall.
  | { type: "launchAttack"; payload: { targetX: number; targetY: number; strength: number } }
  // Citadel 34: one-way gift of goods to another player (no alliance state).
  | { type: "gift"; payload: { to: number; good: string; amount: number } }
  // Citadel 35 (netcode): the server injects this before a peer's command to
  // route subsequent commands to that peer's player (multi-writer). Part of the
  // deterministic command stream so the log replays byte-identically.
  | { type: "setActivePlayer"; payload: { id: number } };
