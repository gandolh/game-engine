import type { RegionId } from "../world/regions";

export interface MarketWallTag {
  readonly isMarketWall: true;
}

export interface ShopkeeperTag {
  readonly isShopkeeper: true;
  dailySlate?: readonly import("../agents/shop-slate").ShopOffer[];
}

export interface FountainTag {
  readonly isFountain: true;

  regionId: RegionId;
}

export type TileFeatureKind = "tree" | "stone" | "bush";

export interface TileFeature {
  kind: TileFeatureKind;
  tileX: number;
  tileY: number;
  regionId: RegionId;

  ownerId: number;
}

export interface Solid {
  readonly isSolid: true;
  tileX: number;
  tileY: number;
}

export interface BlacksmithTag {
  readonly isBlacksmith: true;
}

export interface CarpenterTag {
  readonly isCarpenter: true;
  pending?: PendingCommission[];
}

export interface PendingCommission {

  ownerId: number;

  regionId: RegionId;

  kind: DecorationKind;

  ticksLeft: number;
}

export interface WorkStation {
  readonly tileX: number;
  readonly tileY: number;
  readonly facing: "down" | "up" | "side";
  readonly flipX: boolean;

  readonly pose: string | null;
}

export interface WorkNpc {
  readonly stations: readonly WorkStation[];
  readonly idlePose: string;
  stationIndex: number;
  phase: "walking" | "working";
  timer: number;

  poseFrame: string | null;
  facing: "down" | "up" | "side";
  flipX: boolean;

  busyFactor?: number;
}

export interface AuctionPodiumTag {
  readonly isAuctionPodium: true;
}

export interface NoticeBoardTag {
  readonly isNoticeBoard: true;

  bountyText?: string | undefined;
}

export interface MillTag {
  readonly isMill: true;
}

export interface TavernTag {
  readonly isTavern: true;

  gossip?: string | undefined;

  gossipDay?: number | undefined;
}

export interface WellTag {
  readonly isWell: true;
  regionId: import('../world/regions').RegionId;
}

export interface FishingSpotTag {
  readonly isFishingSpot: true;
  tileX: number;
  tileY: number;
}

export interface HomeTag {
  readonly isHome: true;
  regionId: RegionId;
  ownerId: number;
}

export interface HarborBoardTag {
  readonly isHarborBoard: true;
  openContracts: import('../protocols/harbor').HarborContract[];

  committed: Map<string, number>;
}

export interface DockmasterTag {
  readonly isDockmaster: true;
}

export type DecorationKind = "scarecrow" | "windmill" | "flower-bed" | "fence-art";

export const DECORATION_RECIPE: Record<DecorationKind, { woodCost: number; yieldBoost: number }> = {
  "scarecrow":   { woodCost: 3,  yieldBoost: 0.10 }, 
  "flower-bed":  { woodCost: 5,  yieldBoost: 0.15 }, 
  "fence-art":   { woodCost: 8,  yieldBoost: 0.20 }, 
  "windmill":    { woodCost: 12, yieldBoost: 0.30 }, 
};

export const MAX_DECORATION_BOOST = 0.75;

export interface FarmDecoration {
  kind: DecorationKind;
  tileX: number;
  tileY: number;
  regionId: RegionId;
  ownerId: number;
}

export interface WeatherStation {
  current: import("../protocols/weather").WeatherCondition;
  multiplier: number;

  season: import("../protocols/weather").Season;
  forecast: ReadonlyArray<{
    condition: import("../protocols/weather").WeatherCondition;
    confidence: number;
  }>;
}

export interface Greenhouse {
  tileX: number;
  tileY: number;
  regionId: RegionId;
  ownerId: number;
}
