import { World } from "@engine/core";
import type { GameEntity, CropKind, FarmerFsmState } from "./components";

const ZERO_CROPS: Record<CropKind, number> = { radish: 0, wheat: 0, pumpkin: 0 };

export interface FarmerSpec {
  name: string;
  personality: "conservative" | "aggressive" | "hoarder" | "opportunist";
  homeX: number;
  homeY: number;
  startGold: number;
  riskProfile: "low" | "medium" | "high";
  minGoldReserve: number;
  startSeeds: Partial<Record<CropKind, number>>;
}

export function setupFarmer(world: World<GameEntity>, spec: FarmerSpec): GameEntity {
  const sprite = `farmer/${spec.personality}`;
  const farmer = world.spawn({
    transform: { x: spec.homeX, y: spec.homeY, prevX: spec.homeX, prevY: spec.homeY, rotation: 0 },
    sprite: { atlasId: "main", frame: sprite, layer: 100, tintRgba: 0xffffffff },
    fsm: { current: "WAIT_DAY" as FarmerFsmState, enteredTick: 0 },
    beliefs: { data: { currentDay: 0 }, revision: 0 },
    desires: { data: { riskProfile: spec.riskProfile, minGoldReserve: spec.minGoldReserve } },
    intentions: { queue: [] },
    personality: { kind: spec.personality },
    inbox: { messages: [] },
    farmer: { name: spec.name },
    inventory: {
      gold: spec.startGold,
      crops: { ...ZERO_CROPS },
      seeds: { ...ZERO_CROPS, ...spec.startSeeds },
    },
    ap: { current: 8, max: 8, penaltyPending: false, penaltyCapacity: 4, away: false },
  });
  return farmer;
}

export function setupPlot(
  world: World<GameEntity>,
  ownerId: number,
  tileX: number,
  tileY: number,
): GameEntity {
  return world.spawn({
    transform: {
      x: tileX,
      y: tileY,
      prevX: tileX,
      prevY: tileY,
      rotation: 0,
    },
    plot: { ownerId, tileX, tileY, state: { kind: "empty" } },
  });
}
