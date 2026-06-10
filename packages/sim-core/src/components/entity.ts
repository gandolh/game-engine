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
  decisionTrace?: DecisionTrace;
  pen?: Pen;
  orchardTree?: OrchardTree;
  skills?: Skills;
  greenhouse?: Greenhouse;
  harborBoard?: HarborBoardTag;
  dockmaster?: DockmasterTag;
  [key: string]: unknown;
}

/** Reset decisionTrace at the start of each deliberation tick. Lazily initializes. */
export function resetDecisionTrace(farmer: GameEntity): void {
  if (farmer.decisionTrace === undefined) {
    farmer.decisionTrace = { reasons: [] };
  } else {
    farmer.decisionTrace.reasons.length = 0;
  }
}

/** Append a reason to decisionTrace, capped at DECISION_TRACE_CAP. Lazily initializes. */
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
