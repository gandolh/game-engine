import { World } from "@engine/core";
import type { GameEntity, CropKind, FarmerFsmState, Tool } from "./components";
import { setupRegions } from "./world/region-setup";
import type { RegionId } from "./world/regions";

const ZERO_CROPS: Record<CropKind, number> = { radish: 0, wheat: 0, pumpkin: 0 };

/** Starting tool kit — one wooden hoe, axe, and pickaxe. */
const STARTING_TOOLS: Tool[] = [
  { kind: "hoe",     tier: "wooden", durability: 100 },
  { kind: "axe",     tier: "wooden", durability: 100 },
  { kind: "pickaxe", tier: "wooden", durability: 100 },
];

/** Personality → region the farmer lives in (Cora NW, Atticus NE, Hannah SE, Otto SW, Pip top). */
const PERSONALITY_TO_REGION: Record<string, RegionId> = {
  conservative: "farm-cora",
  aggressive: "farm-atticus",
  hoarder: "farm-hannah",
  opportunist: "farm-otto",
  pip: "farm-pip",
};

export interface FarmerSpec {
  name: string;
  personality: "conservative" | "aggressive" | "hoarder" | "opportunist" | "pip";
  homeX: number;
  homeY: number;
  startGold: number;
  riskProfile: "low" | "medium" | "high";
  minGoldReserve: number;
  startSeeds: Partial<Record<CropKind, number>>;
  /** When true, spawn the player tag so PlayerControlSystem drives this farmer. */
  player?: boolean;
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
    farmer: { name: spec.name, currentRegion: initialRegion, homeRegion: initialRegion },
    inventory: {
      gold: spec.startGold,
      crops: { ...ZERO_CROPS },
      seeds: { ...ZERO_CROPS, ...spec.startSeeds },
      tools: STARTING_TOOLS.map(t => ({ ...t })),
      wateringCan: { charges: 10, maxCharges: 10 },
    },
    resources: { wood: 0, stone: 0, ironOre: 0, geodes: 0 },
    // brief 28 — AP is a large daily budget that grows +2/day; day-1 ceiling
    // is 100 (maxApForDay(0)). penaltyCapacity is legacy (unrested halving now
    // lives in the morning wake); kept at half for any old reader.
    ap: { current: 100, max: 100, penaltyPending: false, penaltyCapacity: 50, away: false },
    ...(spec.player
      ? {
          player: {
            isPlayer: true as const,
            facing: "down" as const,
            pendingMove: null,
            pendingAction: false,
            selectedSlot: 0,
          },
        }
      : {}),
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
