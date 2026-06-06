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
import type { FarmerFsmState, Farmer, Player } from "./farmer";
import type { Plot } from "./crops";
import type { Inventory, ActionPoints, ResourceInventory } from "./inventory";
import type {
  MarketWallTag,
  ShopkeeperTag,
  FountainTag,
  TileFeature,
  Solid,
  BlacksmithTag,
  CarpenterTag,
  WorkNpc,
  HomeTag,
  AuctionPodiumTag,
  NoticeBoardTag,
  MillTag,
  TavernTag,
  WellTag,
  FishingSpotTag,
  FarmDecoration,
  WeatherStation,
  HarborBoardTag,
  DockmasterTag,
  Greenhouse,
} from "./world-features";
import type { Pen } from "./livestock";
import type { OrchardTree } from "./orchard";
import type { Skills } from "./skills";
import type { SpriteAnim, TrustScores, DecisionTrace } from "./trust";
import { DECISION_TRACE_CAP } from "./trust";

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
  solid?: Solid;
  blacksmith?: BlacksmithTag;
  carpenter?: CarpenterTag;
  workNpc?: WorkNpc;
  home?: HomeTag;
  auctionPodium?: AuctionPodiumTag;
  noticeBoard?: NoticeBoardTag;
  mill?: MillTag;
  tavern?: TavernTag;
  well?: WellTag;
  farmDecoration?: FarmDecoration;
  resources?: ResourceInventory;
  weatherStation?: WeatherStation;
  trust?: TrustScores;
  /** brief 19 — last 1-3 one-line decision reasons (game-side, observer "why"). */
  decisionTrace?: DecisionTrace;
  /** brief 42 — a livestock pen on the farmer's farm. */
  pen?: Pen;
  /** brief 42 — an orchard tree tile on the farmer's farm. */
  orchardTree?: OrchardTree;
  /** brief 43 — per-farm skill XP counters (farming/foraging/fishing/mining). */
  skills?: Skills;
  /** brief 43 — a built greenhouse structure on the farmer's farm. */
  greenhouse?: Greenhouse;
  /** brief 46 — harbor contract board entity. */
  harborBoard?: HarborBoardTag;
  /** brief 46 — dockmaster NPC entity at the harbor. */
  dockmaster?: DockmasterTag;
  [key: string]: unknown;
}

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
