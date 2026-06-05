import type {
  Transform,
  Sprite,
  FsmState,
  Beliefs,
  Desires,
  Intentions,
  Personality,
  AgentInbox,
} from "@engine/core";
import type { RegionId } from "./world/regions";

export type FarmerFsmState =
  | "WAIT_DAY"
  | "PERCEIVE"
  | "DELIBERATE"
  | "ACT"
  | "FINISH_DAY"
  // brief 27 — night sleep node. A farmer that reached home enters SLEEP for
  // the night phase (rested); one caught away is flagged unrested.
  | "SLEEP";

export interface Farmer {
  name: string;
  currentRegion: RegionId;
  /** brief 27 — the farmer's own farm region; "home" for the sleep check. */
  homeRegion?: RegionId;
  /**
   * When set, the farmer is busy with a physical action until this tick.
   * ActSystem skips execution (but not queue-building) while busy, so the
   * animation plays for a meaningful duration before the next action fires.
   */
  busyUntilTick?: number;
  path?: {
    waypoints: ReadonlyArray<{ x: number; y: number }>;
    nextIndex: number;       // index of the next waypoint to step onto
    ticksUntilStep: number;  // countdown to next tile step
  } | undefined;
  /**
   * RENDER-ONLY sub-tile position, in TILE units. TravelSystem advances this a
   * fraction of a tile each tick while walking a path so the per-tick snapshot
   * shows continuous motion, instead of the transform jumping a full tile once
   * per STEP_TICKS. NEVER read by sim logic (only the snapshot builder reads it);
   * the authoritative position remains the integer `transform`. Cleared on
   * arrival so a stopped farmer renders at its true tile.
   */
  renderPos?: { x: number; y: number } | undefined;
  /**
   * Set true on the tick the farmer stepped to a new tile under direct (non-
   * path) control — i.e. the player's Pip walking via WASD. The render walk-
   * cycle keys off `path` for AI farmers and off this flag for the player, so
   * Pip animates while moving even though it never builds a pathfinder route.
   * Cleared each tick by the controlling system.
   */
  movedThisTick?: boolean;
}

/**
 * Tags the single player-controlled farmer (Pip). Identical components to the AI
 * farmers (so the same crop/harvest/market/render systems treat it as a farmer),
 * but its intentions come from keyboard input via PlayerControlSystem rather than
 * an AI personality, and DeliberateSystem skips it.
 *
 * `facing` is the direction Pip last faced; the context-action key acts on the
 * adjacent tile in that direction. `pendingMoveX`/`pendingMoveY`/`pendingAction`
 * are the buffered input from the most recent main→worker input message.
 */
export interface Player {
  readonly isPlayer: true;
  facing: "up" | "down" | "left" | "right";
  /**
   * The currently HELD move axes (the main thread resends them whenever the held
   * keys change, and sends null on release). Two independent axes so two keys
   * held at once (e.g. W+A) move Pip DIAGONALLY. The sim owns the step cadence:
   * PlayerControlSystem advances Pip one tile every PLAYER_STEP_TICKS ticks while
   * either axis is set, gliding renderPos in between, so Pip (and a camera
   * following Pip) moves continuously instead of jumping a full tile per step.
   */
  pendingMoveX: "left" | "right" | null;
  pendingMoveY: "up" | "down" | null;
  /** True if the context-action key is queued for the next control tick. */
  pendingAction: boolean;
  /**
   * Index of the selected hotbar slot (0-based; see HOTBAR_SLOTS in
   * systems/player-control.ts). The action key uses this slot's tool/seed
   * instead of auto-picking by context. Set by number-key input (1→0, 2→1, …).
   */
  selectedSlot: number;
  /**
   * Sim-owned step cadence counter (ticks until the next one-tile commit while a
   * direction is held). Render-pacing bookkeeping, deterministic — depends only
   * on tick count and held input. Starts at 0 so the first held tick steps
   * immediately (no input latency).
   */
  stepCooldown: number;
  /**
   * The tile Pip left on the most recent step commit, in TILE units. The
   * in-between ticks ease renderPos from here up into the committed transform
   * tile (a TRAILING glide — the visual never leads the authoritative position).
   * Render-pacing only.
   */
  glideFromX: number;
  glideFromY: number;
}

export type CropKind = "radish" | "wheat" | "pumpkin";

// ── Tool system ──────────────────────────────────────────────────────────────

export type ToolKind = "hoe" | "axe" | "pickaxe" | "fishing-rod";
export type ToolTier = "wooden" | "stone" | "iron";

// ── Fishing ────────────────────────────────────────────────────────────────
//
// Fishing is a low-AP, high-time activity: it costs 1 AP but the farmer is busy
// for a random 5–30 seconds (at 20 Hz → 100–600 ticks), then lands one of three
// fish. There is exactly ONE kind of fishing rod and it has NO durability
// (modelled with `durability: Infinity` so the shared tool plumbing never
// breaks or prunes it). You fish while standing adjacent to a fishing spot.

/** The three catchable fish, in ascending value. */
export type FishKind = "minnow" | "bass" | "salmon";

export const FISH_KINDS: readonly FishKind[] = ["minnow", "bass", "salmon"];

/** Gold each fish is worth when sold to the shopkeeper. */
export const FISH_VALUE: Record<FishKind, number> = {
  minnow: 1,
  bass:   3,
  salmon: 5,
};

/** Fishing time bounds, in ticks at 20 Hz (5 s … 30 s). */
export const FISH_MIN_TICKS = 100; // 5 s
export const FISH_MAX_TICKS = 600; // 30 s

/**
 * Catch odds, as [minnow, bass, salmon] weights. Plain ocean (calm water) mostly
 * lands the cheap minnow; casting into a bubble spot tilts heavily toward the
 * rarer, more valuable bass/salmon. Weights need not sum to 1 — the picker
 * normalises. This is the whole point of the bubbles: a rarity bonus.
 */
export const FISH_WEIGHTS_CALM:   Record<FishKind, number> = { minnow: 80, bass: 17, salmon: 3 };
export const FISH_WEIGHTS_BUBBLE: Record<FishKind, number> = { minnow: 25, bass: 45, salmon: 30 };

/** Work-ticks (at 20 Hz) per action by tier. 3s / 2s / 1s. */
export const TOOL_WORK_TICKS: Record<ToolTier, number> = {
  wooden: 60,
  stone:  40,
  iron:   20,
};

/** Shop buy price per tier. */
export const TOOL_PRICE: Record<ToolTier, number> = {
  wooden: 5,
  stone:  7,
  iron:   10,
};

export interface Tool {
  kind: ToolKind;
  tier: ToolTier;
  durability: number; // remaining uses
}

export interface WateringCan {
  charges: number;    // remaining uses before refill
  maxCharges: number; // always 10
}

export interface Inventory {
  gold: number;
  crops: Record<CropKind, number>;
  seeds: Record<CropKind, number>;
  /**
   * Golden beans (brief 24) — a rare, high-value status good won only at the
   * shopkeeper's auction. Not a `CropKind` (it can't be planted); a winner can
   * resell it to the shop above the auction reserve, or gift it to a peer on a
   * MEET encounter for a large trust boost. Optional/defaulted so existing
   * inventories (and tests) that omit it read as zero.
   */
  goldenBeans?: number;
  /**
   * Fish caught (not yet sold), by kind. Optional/defaulted so existing
   * inventories and tests that omit it read as zero. Sold to the shopkeeper for
   * `FISH_VALUE` gold each (see ActSystem.handleFish — fishing banks gold
   * directly on the catch, so this is mostly a running tally for the UI).
   */
  fish?: Record<FishKind, number>;
  /** Tools owned by this farmer. One entry per tool owned (can stack same kind+tier). */
  tools?: Tool[];
  /** Watering can state. Optional so pre-tool saves read as full can. */
  wateringCan?: WateringCan;
}

export interface Plot {
  ownerId: number;
  regionId: RegionId;
  tileX: number;
  tileY: number;
  state: PlotState;
}

export type PlotState =
  | {
      kind: "empty";
      /**
       * Days since the plot was last tended (planted or watered). When this
       * exceeds PLOT_DECAY_DAYS the plot reverts to green (entity removed).
       * Optional/defaulted to 0 so existing empty plots start fresh.
       */
      daysSinceTended?: number;
    }
  | {
      kind: "planted";
      crop: CropKind;
      daysGrowing: number;
      readyAtDay: number;
      weatherSum: number;
      /**
       * brief 29 — irrigation. Days since this plot was last watered (by an
       * agent's `water` action or by rain). 0 on the day it's planted/watered.
       * Growth only advances on watered days; exceeding the grace window kills
       * the crop. Optional/defaulted so pre-29 planted states read as 0.
       */
      daysSinceWater?: number;
      /** True if watered (or rained on) during the current day. */
      wateredToday?: boolean;
    };

export interface ActionPoints {
  current: number;
  max: number;
  penaltyPending: boolean;
  penaltyCapacity: number;
  away: boolean;
  /**
   * brief 27 — set true when the farmer was NOT home at nightfall (caught away
   * during the night phase). Consumed at the next day's AP refill to halve the
   * starting AP (the "sleep in your own bed" rule). Cleared on a rested wake.
   */
  unrested?: boolean;
}

export interface MarketWallTag {
  readonly isMarketWall: true;
}

export interface ShopkeeperTag {
  readonly isShopkeeper: true;
  dailySlate?: readonly import("./agents/shop-slate").ShopOffer[];
}

/** Tags a fountain entity on a farm — used for watering can refill. */
export interface FountainTag {
  readonly isFountain: true;
  /** The farm region this fountain serves. */
  regionId: RegionId;
}

export type TileFeatureKind = "tree" | "stone";

/** A tree or stone tile on a farm's non-plot green area. */
export interface TileFeature {
  kind: TileFeatureKind;
  tileX: number;
  tileY: number;
  regionId: RegionId;
  /** Owner farm id (for pathfinding — farmers only chop/mine on their own farm). */
  ownerId: number;
}

/** Days without tending before an empty plot reverts to green. */
export const PLOT_DECAY_DAYS = 5;

/** Tags the blacksmith entity in the forge region. */
export interface BlacksmithTag {
  readonly isBlacksmith: true;
}

/** Tags the carpenter NPC entity in the carpentry region. */
export interface CarpenterTag {
  readonly isCarpenter: true;
}

/**
 * A work station an NPC visits: a tile to stand on, the facing to adopt there,
 * and the animated pose to play (two-frame, e.g. `npc/blacksmith/hammer`).
 * `pose: null` means "just stand/idle here" (used for a brief walk-around).
 */
export interface WorkStation {
  readonly tileX: number;
  readonly tileY: number;
  readonly facing: "down" | "up" | "side";
  readonly flipX: boolean;
  /** Pose frame prefix (the system appends `-a`/`-b`), or null to idle. */
  readonly pose: string | null;
}

/**
 * Drives a stationary craft NPC (blacksmith, carpenter) around its props: walk
 * to the next station, dwell there playing the station's pose for a while, then
 * move on. Purely cosmetic — deterministic on tick, no sim coupling.
 */
export interface WorkNpc {
  /** Ordered loop of stations to visit. */
  readonly stations: readonly WorkStation[];
  /**
   * Frame to render when not playing a station swing pose — while walking
   * between stations, and while dwelling at a station whose `pose` is null
   * (e.g. the oven). A standing-figure sprite so the NPC never falls back to
   * its building sprite. (e.g. "npc/blacksmith/idle".)
   */
  readonly idlePose: string;
  /** Index of the station currently targeted / occupied. */
  stationIndex: number;
  /**
   * Phase: "walking" (stepping toward the station tile) or "working" (arrived,
   * dwelling + playing the pose).
   */
  phase: "walking" | "working";
  /** Ticks remaining in the current phase action (step cadence / dwell). */
  timer: number;
  /** Resolved pose/idle frame to render this tick (null = use a facing idle frame). */
  poseFrame: string | null;
  /** Facing to render this tick. */
  facing: "down" | "up" | "side";
  flipX: boolean;
}

/** Tags the auction podium entity at the town square center. */
export interface AuctionPodiumTag {
  readonly isAuctionPodium: true;
}

/** Tags the notice board entity on the west edge of the town square. */
export interface NoticeBoardTag {
  readonly isNoticeBoard: true;
  /** Today's bounty description, set each day-start by the day-phase system. Absent until first day fires. */
  bountyText?: string | undefined;
}

/** Tags the mill NPC entity in the mill region. */
export interface MillTag {
  readonly isMill: true;
}

/** Tags a well entity near a quarry — agents refill watering cans here. */
export interface WellTag {
  readonly isWell: true;
  regionId: import('./world/regions').RegionId;
}

/**
 * Tags a **bubble spot** — a transient patch of churning water (rising fish)
 * that drifts in the ocean ring around the fishing isle. Casting INTO a bubble
 * tile (from the isle edge) skews the catch toward rarer/more valuable fish;
 * plain ocean skews to minnows. Bubbles spawn/despawn daily and are NOT
 * permanent fixtures (see BubbleSystem). The tile is a non-walkable ocean tile.
 */
export interface FishingSpotTag {
  readonly isFishingSpot: true;
  tileX: number;
  tileY: number;
}

/** Tags a farmhouse / home entity — the farmer returns here to sleep. */
export interface HomeTag {
  readonly isHome: true;
  regionId: RegionId;
  ownerId: number;
}

/** Resources a farmer can hold from chopping/mining. */
export interface ResourceInventory {
  wood: number;
  stone: number;
  ironOre: number;
  geodes: number;
}

// ── Decoration system ────────────────────────────────────────────────────────

export type DecorationKind = "scarecrow" | "windmill" | "flower-bed" | "fence-art";

/** Wood cost and yield multiplier for each decoration type. */
export const DECORATION_RECIPE: Record<DecorationKind, { woodCost: number; yieldBoost: number }> = {
  "scarecrow":   { woodCost: 3,  yieldBoost: 0.10 }, // +10% yield
  "flower-bed":  { woodCost: 5,  yieldBoost: 0.15 }, // +15% yield
  "fence-art":   { woodCost: 8,  yieldBoost: 0.20 }, // +20% yield
  "windmill":    { woodCost: 12, yieldBoost: 0.30 }, // +30% yield
};

/** Maximum stacked yield boost from all decorations on one farm (caps at +75%). */
export const MAX_DECORATION_BOOST = 0.75;

/** A placed farm decoration — attached to a tile, boosts crop yield for the whole farm. */
export interface FarmDecoration {
  kind: DecorationKind;
  tileX: number;
  tileY: number;
  regionId: RegionId;
  ownerId: number;
}

export interface WeatherStation {
  current: import("./protocols/weather").WeatherCondition;
  multiplier: number;
  /** Current season (pure function of the day index — see protocols/weather). */
  season: import("./protocols/weather").Season;
  forecast: ReadonlyArray<{
    condition: import("./protocols/weather").WeatherCondition;
    confidence: number;
  }>;
}

export interface SpriteAnim {
  clip: string;
  frame: number;
  elapsedMs: number;
  playing: boolean;
}

export interface TrustScores {
  byId: Map<number, number>;
}

/**
 * Decision rationale trace (brief 19) — a tiny ring buffer of the most recent
 * one-line reasons a personality produced while deliberating. Game-side only
 * (the engine `Intentions` component is off-limits). Surfaced for the focused
 * farmer in the observer panel. Reasons are pure functions of the farmer's
 * beliefs/desires/inventory at decision time (no wall-clock, no random).
 */
export interface DecisionTrace {
  reasons: string[];
}

/** Max reasons kept in the decisionTrace ring buffer. */
export const DECISION_TRACE_CAP = 3;

/**
 * Reset the farmer's decisionTrace for a fresh deliberation tick. Call this at
 * the same point each personality clears `intentions.queue` so the trace always
 * reflects the current tick's decisions. Lazily initializes the field.
 */
export function resetDecisionTrace(farmer: GameEntity): void {
  if (farmer.decisionTrace === undefined) {
    farmer.decisionTrace = { reasons: [] };
  } else {
    farmer.decisionTrace.reasons.length = 0;
  }
}

/**
 * Record a terse reason into the farmer's decisionTrace, capped to the last
 * DECISION_TRACE_CAP entries. Lazily initializes the field.
 */
export function recordReason(farmer: GameEntity, reason: string): void {
  if (farmer.decisionTrace === undefined) {
    farmer.decisionTrace = { reasons: [] };
  }
  const reasons = farmer.decisionTrace.reasons;
  reasons.push(reason);
  if (reasons.length > DECISION_TRACE_CAP) {
    reasons.splice(0, reasons.length - DECISION_TRACE_CAP);
  }
}

export interface GameEntity {
  id?: number;
  transform?: Transform;
  sprite?: Sprite;
  spriteAnim?: SpriteAnim;
  fsm?: FsmState<FarmerFsmState>;
  beliefs?: Beliefs;
  desires?: Desires;
  intentions?: Intentions;
  personality?: Personality;
  inbox?: AgentInbox;
  farmer?: Farmer;
  player?: Player;
  inventory?: Inventory;
  plot?: Plot;
  ap?: ActionPoints;
  marketWall?: MarketWallTag;
  shopkeeper?: ShopkeeperTag;
  fountain?: FountainTag;
  fishingSpot?: FishingSpotTag;
  tileFeature?: TileFeature;
  blacksmith?: BlacksmithTag;
  carpenter?: CarpenterTag;
  workNpc?: WorkNpc;
  home?: HomeTag;
  auctionPodium?: AuctionPodiumTag;
  noticeBoard?: NoticeBoardTag;
  mill?: MillTag;
  well?: WellTag;
  farmDecoration?: FarmDecoration;
  resources?: ResourceInventory;
  weatherStation?: WeatherStation;
  trust?: TrustScores;
  /** brief 19 — last 1-3 one-line decision reasons (game-side, observer "why"). */
  decisionTrace?: DecisionTrace;
  [key: string]: unknown;
}
