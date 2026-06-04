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
}

export type CropKind = "radish" | "wheat" | "pumpkin";

// ── Tool system ──────────────────────────────────────────────────────────────

export type ToolKind = "hoe" | "axe" | "pickaxe";
export type ToolTier = "wooden" | "stone" | "iron";

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
  inventory?: Inventory;
  plot?: Plot;
  ap?: ActionPoints;
  marketWall?: MarketWallTag;
  shopkeeper?: ShopkeeperTag;
  fountain?: FountainTag;
  tileFeature?: TileFeature;
  blacksmith?: BlacksmithTag;
  carpenter?: CarpenterTag;
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
