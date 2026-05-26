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
}

export interface WeatherStation {
  current: import("./protocols/weather").WeatherCondition;
  multiplier: number;
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
  [key: string]: unknown;
}
