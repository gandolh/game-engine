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

/**
 * Whether a villager in this FSM state is TRAVELLING (walking between places)
 * rather than stationed at a building. The three walk states are in-transit; a
 * villager that is `idle` sits at home and `work` is stationed at its workplace.
 *
 * This is the single rule that keeps the renderer consistent: a travelling
 * villager is drawn as a dot on the road, a stationary one is folded into its
 * building's occupancy badge instead — so every villager is counted in exactly
 * one place (road OR a building), never both. Pure; shared by the snapshot
 * (occupancy tally) and the client (road-dot suppression).
 */
export function isTravellingFsm(fsm: string): boolean {
  return fsm === "walkToWork" || fsm === "haulToStore" || fsm === "walkHome";
}

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
