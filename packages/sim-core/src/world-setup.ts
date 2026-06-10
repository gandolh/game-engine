import { World } from "@engine/core";
import type { GameEntity, CropKind, FarmerFsmState, Tool } from "./components";
import { zeroFish } from "./components";
import { setupRegions } from "./world/region-setup";
import type { RegionId } from "./world/regions";

// brief 41 — expanded to cover all 8 crop kinds.
const ZERO_CROPS: Record<CropKind, number> = {
  radish: 0, wheat: 0, carrot: 0, tomato: 0, corn: 0, pumpkin: 0, grape: 0, "winter-squash": 0,
};

/**
 * Starting tool kit — one wooden hoe, axe, pickaxe, and a fishing rod. There is
 * only one kind of fishing rod and it has no durability, modelled as
 * `Infinity` so the shared tool plumbing (find `durability > 0`, prune at
 * `<= 0`) never breaks or removes it.
 */
const STARTING_TOOLS: Tool[] = [
  { kind: "hoe",         tier: "wooden", durability: 100 },
  { kind: "axe",         tier: "wooden", durability: 100 },
  { kind: "pickaxe",     tier: "wooden", durability: 100 },
  { kind: "fishing-rod", tier: "wooden", durability: Infinity },
];

export interface FarmerSpec {
  name: string;
  personality: "conservative" | "aggressive" | "hoarder" | "opportunist" | "pip";
  /** The farm island this farmer lives on. Assigned at spec-generation time
   *  (see makeFarmerSpecs); replaces the old personality→region map so any
   *  number of farmers can be placed. */
  homeRegion: RegionId;
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
  const initialRegion = spec.homeRegion;
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
      fish: zeroFish(),
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
            pendingMoveX: null,
            pendingMoveY: null,
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
