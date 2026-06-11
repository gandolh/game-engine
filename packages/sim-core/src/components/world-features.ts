import type { RegionId } from "../world/regions";

export interface MarketWallTag {
  readonly isMarketWall: true;
}

export interface ShopkeeperTag {
  readonly isShopkeeper: true;
  dailySlate?: readonly import("../agents/shop-slate").ShopOffer[];
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

/** Blocks movement (player + AI pathfinder grid). Static — placed once, never moved. */
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

/** One accepted carpenter commission ticking down to delivery. */
export interface PendingCommission {
  /** The farmer who commissioned (and was already charged for) this build. */
  ownerId: number;
  /** Home farm region to place the delivered structure on. */
  regionId: RegionId;
  /** The decoration to deliver. */
  kind: DecorationKind;
  /** Ticks remaining before delivery. */
  ticksLeft: number;
}

/** A work station an NPC visits. `pose: null` = idle/stand. */
export interface WorkStation {
  readonly tileX: number;
  readonly tileY: number;
  readonly facing: "down" | "up" | "side";
  readonly flipX: boolean;
  /** Pose frame prefix (the system appends `-a`/`-b`), or null to idle. */
  readonly pose: string | null;
}

/** Patrol NPC state: walks to stations in a loop, dwells + plays a pose. Cosmetic; no sim coupling. */
export interface WorkNpc {
  readonly stations: readonly WorkStation[];
  readonly idlePose: string;
  stationIndex: number;
  phase: "walking" | "working";
  timer: number;
  /** Pose frame to render this tick (null = facing idle). */
  poseFrame: string | null;
  facing: "down" | "up" | "side";
  flipX: boolean;
  /** Patrol speed multiplier set by NpcDeliberateSystem (<1 = busier, >1 = idle). Optional → 1. */
  busyFactor?: number;
}

export interface AuctionPodiumTag {
  readonly isAuctionPodium: true;
}

/** Tags the notice board entity on the west edge of the town square. */
export interface NoticeBoardTag {
  readonly isNoticeBoard: true;
  /** Today's bounty description, set each day-start by the day-phase system. Absent until first day fires. */
  bountyText?: string | undefined;
}

export interface MillTag {
  readonly isMill: true;
}

export interface TavernTag {
  readonly isTavern: true;
  /** The barkeep's current rumor line (set each day-start by TavernSystem). */
  gossip?: string | undefined;
  /** Sim day the gossip line was last refreshed. */
  gossipDay?: number | undefined;
}

/** Tags a well entity near a quarry — agents refill watering cans here. */
export interface WellTag {
  readonly isWell: true;
  regionId: import('../world/regions').RegionId;
}

/** Transient bubble spot in the ocean ring. Casting into one skews toward rarer fish. */
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

/** Harbor contract board. HarborSystem updates it each day; agents read via beliefs. */
export interface HarborBoardTag {
  readonly isHarborBoard: true;
  openContracts: import('../protocols/harbor').HarborContract[];
  /** contractId → farmerId. Committed contracts stay in openContracts until delivered/missed. */
  committed: Map<string, number>;
}

export interface DockmasterTag {
  readonly isDockmaster: true;
}

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
  current: import("../protocols/weather").WeatherCondition;
  multiplier: number;
  /** Current season (pure function of the day index — see protocols/weather). */
  season: import("../protocols/weather").Season;
  forecast: ReadonlyArray<{
    condition: import("../protocols/weather").WeatherCondition;
    confidence: number;
  }>;
}

/** Buildable greenhouse: plots inside it ignore the out-of-season growth penalty. */
export interface Greenhouse {
  tileX: number;
  tileY: number;
  regionId: RegionId;
  ownerId: number;
}
