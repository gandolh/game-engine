import { World } from "@engine/core";
import type { GameEntity, CropKind, FarmerFsmState } from "./components";
import { setupRegions } from "./world/region-setup";
import type { RegionId } from "./world/regions";

const ZERO_CROPS: Record<CropKind, number> = { radish: 0, wheat: 0, pumpkin: 0 };

/** Personality → region the farmer lives in (Cora N, Atticus E, Hannah S, Otto W). */
const PERSONALITY_TO_REGION: Record<string, RegionId> = {
  conservative: "farm-cora",
  aggressive: "farm-atticus",
  hoarder: "farm-hannah",
  opportunist: "farm-otto",
};

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
  const initialRegion = PERSONALITY_TO_REGION[spec.personality];
  if (!initialRegion) {
    throw new Error(`setupFarmer: no region assigned for personality '${spec.personality}'`);
  }
  const farmer = world.spawn({
    transform: { x: spec.homeX, y: spec.homeY, prevX: spec.homeX, prevY: spec.homeY, rotation: 0 },
    sprite: { atlasId: "main", frame: sprite, layer: 100, tintRgba: 0xffffffff },
    fsm: { current: "WAIT_DAY" as FarmerFsmState, enteredTick: 0 },
    beliefs: { data: { currentDay: 0 }, revision: 0 },
    desires: { data: { riskProfile: spec.riskProfile, minGoldReserve: spec.minGoldReserve } },
    intentions: { queue: [] },
    personality: { kind: spec.personality },
    inbox: { messages: [] },
    farmer: { name: spec.name, currentRegion: initialRegion },
    inventory: {
      gold: spec.startGold,
      crops: { ...ZERO_CROPS },
      seeds: { ...ZERO_CROPS, ...spec.startSeeds },
    },
    ap: { current: 8, max: 8, penaltyPending: false, penaltyCapacity: 4, away: false },
  });
  return farmer;
}

/**
 * Spawn region entities, lay out plots per farm, and place village fixtures.
 * Each farmer's Transform is moved to the center of their assigned farm and
 * their `currentRegion` is set accordingly. Replaces the old flat plot loop.
 */
export function setupWorldRegions(
  world: World<GameEntity>,
  farmers: GameEntity[],
): ReturnType<typeof setupRegions> {
  return setupRegions(world, farmers);
}
