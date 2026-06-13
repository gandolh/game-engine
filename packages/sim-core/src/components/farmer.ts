import type { RegionId } from "../world/regions";
import type { ItemRef } from "./items";

export type FarmerFsmState =
  | "WAIT_DAY"
  | "PERCEIVE"
  | "DELIBERATE"
  | "ACT"
  | "FIGHTING"
  | "FINISH_DAY"
  | "SLEEP";

export interface Farmer {
  name: string;
  currentRegion: RegionId;
  homeRegion?: RegionId;

  busyUntilTick?: number;
  path?: {
    waypoints: ReadonlyArray<{ x: number; y: number }>;
    nextIndex: number;       
    ticksUntilStep: number;  
  } | undefined;

  renderPos?: { x: number; y: number } | undefined;

  movedThisTick?: boolean;

  helperHiredDay?: number;

  shrinePrayedDay?: number;
  festivalWins?: number;
  harborReputation?: number;
  committedContract?: import('../protocols/harbor').HarborContract | undefined;

  aboard?: boolean;

  hasBat?: boolean;

  chaseTarget?: { peerId: number; startTick: number };

  fleeingFrom?: { peerId: number; untilTick: number };
}

export interface Player {
  readonly isPlayer: true;
  facing: "up" | "down" | "left" | "right";

  pendingMoveX: "left" | "right" | null;
  pendingMoveY: "up" | "down" | null;
  pendingAction: boolean;
  selectedSlot: number;

  pendingActionTile: { x: number; y: number } | null;

  itemSlots?: (ItemRef | null)[];
}
