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
  /**
   * brief 44 — the sim day on which the farmer last hired a day-helper at the
   * tavern. The helper boost (extra AP, applied at the morning wake) lasts only
   * the day of hire; this gates re-hiring to once per day and lets the AP refill
   * know to add the bonus. Absent = no helper hired.
   */
  helperHiredDay?: number;
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

/**
 * brief 41 — expanded crop roster. Season-gated (each crop has a primary season
 * in economy.ts cropSeason; growing out of season accrues growth at half rate).
 */
export type CropKind =
  | "radish"       // spring,  2d,  cost 5,  sell 8
  | "wheat"        // spring,  4d,  cost 8,  sell 14
  | "carrot"       // spring,  3d,  cost 6,  sell 11
  | "tomato"       // summer,  5d,  cost 10, sell 20
  | "corn"         // summer,  6d,  cost 12, sell 26
  | "pumpkin"      // autumn,  7d,  cost 15, sell 35
  | "grape"        // autumn,  9d,  cost 20, sell 50
  | "winter-squash"; // winter,  5d,  cost 9,  sell 22

/**
 * brief 41 — quality tier earned at harvest. Normal is the baseline; Silver
 * and Gold reward consistent watering + husbandry + a seeded roll.
 * Multipliers: Normal ×1.0 / Silver ×1.25 / Gold ×1.5 (see economy.ts).
 */
export type CropQuality = "normal" | "silver" | "gold";

/**
 * Per-quality count for one crop kind. Used in `cropQuality` parallel inventory
 * (see Inventory comment below).
 */
export interface CropQualityCounts {
  normal: number;
  silver: number;
  gold: number;
}

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

/**
 * brief 41 — quality representation choice (DESIGN DECISION):
 *
 * We keep `crops: Record<CropKind, number>` as the TOTAL count (backward-
 * compatible with all existing call sites that read crop totals) and add a
 * parallel optional `cropQuality?: Record<CropKind, CropQualityCounts>` for
 * the quality breakdown. This is the least-invasive path: all existing code
 * that reads `inv.crops[crop]` keeps working; quality-aware code (sell price
 * weighting, leaderboard, tooltip) reads `cropQuality[crop]` with a helper
 * that defaults to all-Normal when absent.
 *
 * Helpers: `totalCropCount(inv, crop)` (= inv.crops[crop]), and
 * `cropInventoryValue(inv, crop, basePrice)` accounting for quality tiers.
 * Both are in economy.ts (co-located with the price constants).
 */
export interface Inventory {
  gold: number;
  /** Total harvested crop count per kind. Use with cropQuality for quality split. */
  crops: Record<CropKind, number>;
  seeds: Record<CropKind, number>;
  /**
   * brief 41 — per-quality breakdown of harvested crops. Optional: when absent
   * (or when a crop's entry is absent), all units are treated as Normal quality.
   * `crops[crop]` always equals `normal + silver + gold` when this is present.
   */
  cropQuality?: Partial<Record<CropKind, CropQualityCounts>>;
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
  /**
   * brief 42 — livestock products held (not yet sold). Each product kind may
   * have quality tiers (reusing CropQualityCounts). Optional so pre-42 saves read as empty.
   * `products[kind]` total == normal + silver + gold in the CropQualityCounts entry.
   */
  products?: Partial<Record<ProductKind, CropQualityCounts>>;
  /**
   * brief 42 — fruit in inventory (from orchard harvest). Quality-tracked like crops.
   * Optional so pre-42 saves read as empty.
   */
  fruit?: Partial<Record<FruitKind, CropQualityCounts>>;
}

export interface Plot {
  ownerId: number;
  regionId: RegionId;
  tileX: number;
  tileY: number;
  state: PlotState;
  /**
   * brief 43 — greenhouse plot flag. When true, this plot is inside a built
   * greenhouse: crops grow at FULL rate regardless of season (CropGrowthSystem
   * skips the out-of-season suitability multiplier). Optional/defaulted so all
   * existing open-field plots read as `false` (season-gated as before).
   */
  greenhouse?: boolean;
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

// ── Livestock (brief 42) ─────────────────────────────────────────────────────

/** Animals that can live in a pen. Coops hold chickens; barns hold cows or sheep. */
export type AnimalKind = "chicken" | "cow" | "sheep";

/** Products from each animal kind. */
export type ProductKind = "egg" | "milk" | "wool";

/** Pen structure — a counter-based herd with care scalar.
 * - coop: holds chickens → eggs
 * - barn: holds cows → milk, OR sheep → wool
 * `care` is 0–1; raised by `tend`, decayed daily by CARE_DECAY_RATE.
 * High care → higher product quality + no yield penalty.
 * `fedToday` is reset to false each day-start; if false at production time,
 * the pen gets no yield and care decays faster.
 */
export interface Pen {
  kind: "coop" | "barn";
  animal: AnimalKind;
  count: number;
  /** Care scalar, 0–1. 1 = well-tended, 0 = neglected. */
  care: number;
  /** True if the farmer has fed/tended this pen today. */
  fedToday: boolean;
  tileX: number;
  tileY: number;
  regionId: RegionId;
  ownerId: number;
}

// ── Orchards (brief 42) ──────────────────────────────────────────────────────

/** Fruit tree variants for orchards. apple = autumn yield, cherry = spring yield. */
export type FruitKind = "apple" | "cherry";

/** A planted orchard tile — tracks maturation and perennial seasonal yields. */
export interface OrchardTree {
  kind: FruitKind;
  tileX: number;
  tileY: number;
  regionId: RegionId;
  ownerId: number;
  /** Days of maturation accrued (counts fractionally like daysGrowing). */
  daysGrown: number;
  /** True once the tree is mature (daysGrown >= ORCHARD_MATURATION_DAYS). */
  mature: boolean;
  /** The game-day of the last fruit harvest (to gate once-per-season yield). */
  lastHarvestDay: number;
  /** Accumulated fruit units ready to pick (produced on season-start once mature). */
  fruitReady: number;
}

// ── Skills (brief 43) ─────────────────────────────────────────────────────────

/**
 * brief 43 — per-farm skill axes. Each is leveled by DOING the matching activity
 * (farming = plant/harvest, foraging = forage, fishing = fish, mining = mine).
 * The skill bonuses are PURE functions of these XP counters (see systems/skills.ts),
 * so determinism is preserved: the same activity history always yields the same
 * level + bonus. No rolls live here — any quality/rarity roll that a bonus shifts
 * still flows through a forked seeded Rng at the resolve site.
 */
export type SkillKind = "farming" | "foraging" | "fishing" | "mining";

export const SKILL_KINDS: readonly SkillKind[] = ["farming", "foraging", "fishing", "mining"];

/**
 * A farmer's accumulated skill XP. One integer counter per axis. Levels are
 * derived (not stored) via `skillLevel(xp)` in systems/skills.ts so there is a
 * single source of truth for the curve. Optional on the farmer so pre-43 saves
 * and bare test fixtures read as all-zero (level 1, no bonus).
 */
export interface Skills {
  farming: number;
  foraging: number;
  fishing: number;
  mining: number;
}

/** A zero-initialized Skills record (level 1 across the board). */
export function zeroSkills(): Skills {
  return { farming: 0, foraging: 0, fishing: 0, mining: 0 };
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

/** Days without tending before an empty plot reverts to green. */
export const PLOT_DECAY_DAYS = 5;

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
  [key: string]: unknown;
}
