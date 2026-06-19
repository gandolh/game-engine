/**
 * Villager ECS component + entity shape for Citadel (Phase 2).
 *
 * A villager is a worker that walks between home, a workplace, and a
 * storehouse via a per-tick FSM. Movement follows precomputed BFS paths
 * along roads + building tiles.
 */
import type { EngineEntity } from "@engine/core";
import type { GoodType } from "./building";

export type VillagerFsm =
  | "idle"
  | "walkToWork"
  | "work"
  | "haulToStore"
  | "walkHome";

export interface VillagerComponent {
  id: number;
  /** Owning player id (Citadel 28). Solo = all villagers owned by player 0. */
  ownerId: number;
  homeX: number;
  homeY: number;
  workX: number;
  workY: number;
  storeX: number;
  storeY: number;
  fsm: VillagerFsm;
  pathX: number[];
  pathY: number[];
  pathStep: number;
  carryGood: GoodType | null;
  carryAmount: number;
  ticksAtWork: number;
}

export interface VillagerEntity extends EngineEntity {
  villager: VillagerComponent;
}
