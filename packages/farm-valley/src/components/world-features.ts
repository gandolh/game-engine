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

/**
 * Marks a tile-occupying obstacle that blocks movement (both the player's step
 * checks and the AI pathfinder grid) without being a gatherable tree/stone.
 * Used for workshop props and the big workshop buildings so farmers and Pip walk
 * AROUND them instead of through them. Static: placed once at world setup, never
 * moved or removed, so connectivity is validated at setup time (see
 * region-setup `SOLID_*` placements + the walkable-grid connectivity test).
 */
export interface Solid {
  readonly isSolid: true;
  tileX: number;
  tileY: number;
}

/** Tags the blacksmith entity in the forge region. */
export interface BlacksmithTag {
  readonly isBlacksmith: true;
}

/**
 * Tags the carpenter NPC entity in the carpentry region.
 *
 * brief 44 — the carpenter now fulfills REAL commissions. `pending` holds
 * accepted build orders (cost already escrowed from the farmer): each ticks
 * down `ticksLeft` and is DELIVERED by CarpenterSystem when it reaches 0.
 */
export interface CarpenterTag {
  readonly isCarpenter: true;
  /** brief 44 — accepted commissions in flight (escrowed, building). */
  pending?: PendingCommission[];
}

/** brief 44 — one accepted carpenter commission being built over a build-time. */
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

/**
 * brief 44 — tags the tavern entity in the village hub. Carries the barkeep's
 * current gossip line (a daily rumor drawn deterministically from the event
 * feed by TavernSystem) for the hover tooltip / observer panel.
 */
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

/**
 * brief 46 — tags the harbor contract board entity. Holds the active open
 * contracts and the committed-contract registry. HarborSystem updates this
 * each day; agents read it via beliefs.
 */
export interface HarborBoardTag {
  readonly isHarborBoard: true;
  /** Currently open (uncommitted) contracts available for farmers to take. */
  openContracts: import('../protocols/harbor').HarborContract[];
  /**
   * Committed contracts: contractId → farmerId.
   * A committed contract is still in openContracts until delivered/missed.
   */
  committed: Map<string, number>;
}

/** brief 46 — tags the dockmaster NPC entity at the harbor. */
export interface DockmasterTag {
  readonly isDockmaster: true;
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
  current: import("../protocols/weather").WeatherCondition;
  multiplier: number;
  /** Current season (pure function of the day index — see protocols/weather). */
  season: import("../protocols/weather").Season;
  forecast: ReadonlyArray<{
    condition: import("../protocols/weather").WeatherCondition;
    confidence: number;
  }>;
}

// ── Greenhouse (brief 43) ─────────────────────────────────────────────────────

/**
 * brief 43 — a buildable greenhouse on a farmer's farm. A single Greenhouse
 * entity owns a small block of season-immune plots (spawned alongside it). It is
 * SOLID art (like a pen): the farmer paths around the glasshouse footprint, and
 * the season-immune plots sit on the open tiles in front of it. Built at the
 * carpenter via a high-cost `build-greenhouse` action (see GREENHOUSE_BUILD_COST).
 */
export interface Greenhouse {
  tileX: number;
  tileY: number;
  regionId: RegionId;
  ownerId: number;
}
