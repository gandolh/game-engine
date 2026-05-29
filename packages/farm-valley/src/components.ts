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
  | "FINISH_DAY";

export interface Farmer {
  name: string;
  currentRegion: RegionId;
  path?: {
    waypoints: ReadonlyArray<{ x: number; y: number }>;
    nextIndex: number;       // index of the next waypoint to step onto
    ticksUntilStep: number;  // countdown to next tile step
  } | undefined;
}

export type CropKind = "radish" | "wheat" | "pumpkin";

export interface Inventory {
  gold: number;
  crops: Record<CropKind, number>;
  seeds: Record<CropKind, number>;
}

export interface Plot {
  ownerId: number;
  regionId: RegionId;
  tileX: number;
  tileY: number;
  state: PlotState;
}

export type PlotState =
  | { kind: "empty" }
  | {
      kind: "planted";
      crop: CropKind;
      daysGrowing: number;
      readyAtDay: number;
      weatherSum: number;
    };

export interface ActionPoints {
  current: number;
  max: number;
  penaltyPending: boolean;
  penaltyCapacity: number;
  away: boolean;
}

export interface MarketWallTag {
  readonly isMarketWall: true;
}

export interface ShopkeeperTag {
  readonly isShopkeeper: true;
  dailySlate?: readonly import("./agents/shop-slate").ShopOffer[];
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
  weatherStation?: WeatherStation;
  trust?: TrustScores;
  /** brief 19 — last 1-3 one-line decision reasons (game-side, observer "why"). */
  decisionTrace?: DecisionTrace;
  [key: string]: unknown;
}
