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

export type FarmerFsmState =
  | "WAIT_DAY"
  | "PERCEIVE"
  | "DELIBERATE"
  | "ACT"
  | "FINISH_DAY";

export interface Farmer {
  name: string;
}

export interface Inventory {
  gold: number;
  crops: Record<CropKind, number>;
  seeds: Record<CropKind, number>;
}

export type CropKind = "radish" | "wheat" | "pumpkin";

export interface Plot {
  ownerId: number;
  tileX: number;
  tileY: number;
  state: PlotState;
}

export type PlotState =
  | { kind: "empty" }
  | { kind: "planted"; crop: CropKind; daysGrowing: number; readyAtDay: number };

export interface ActionPoints {
  current: number;
  max: number;
}

export interface GameEntity {
  id?: number;
  transform?: Transform;
  sprite?: Sprite;
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
  [key: string]: unknown;
}
