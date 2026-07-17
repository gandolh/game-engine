import { World, createRng } from "@engine/core";
import type { GameEntity, CropKind, FarmerFsmState, Tool, Inventory } from "./components";
import { zeroFish, HEALTH_MAX } from "./components";
import { defaultItemSlots } from "./systems/player-control/items";
import { setupRegions } from "./world/region-setup";
import type { RegionId } from "./world/regions";
import { bakeBdiJitter } from "./agents/bdi-jitter";
import { bankHarvest, CROP_SELL_PRICE } from "./economy";

const ZERO_CROPS: Record<CropKind, number> = {
  radish: 0, wheat: 0, carrot: 0, tomato: 0, corn: 0, pumpkin: 0, grape: 0, "winter-squash": 0,
};

const STARTING_TOOLS: Tool[] = [
  { kind: "hoe",         tier: "wooden", durability: 100 },
  { kind: "axe",         tier: "wooden", durability: 100 },
  { kind: "pickaxe",     tier: "wooden", durability: 100 },
  { kind: "fishing-rod", tier: "wooden", durability: Infinity },
];

// Brief 2026-07-16 (farm-starting-crop-surplus): every farmer starts holding
// 1-2 units of a sellable crop so OFFER_CROP peer trades have stock to close
// against in days 1-15 — brief 70 measured the binding constraint as
// `no-stock`, not gold, so this seeds inventory only and leaves starting
// gold/encounter cadence untouched. All crop kinds are sellable
// (CROP_SELL_PRICE covers every CropKind); variety + quantity are picked
// per-farmer from a named Rng fork so the surplus is deterministic and
// reproducible per seed.
const SELLABLE_CROPS: CropKind[] = Object.keys(CROP_SELL_PRICE) as CropKind[];

function seedStartingCropSurplus(inv: Inventory, spec: FarmerSpec, seed: number): void {
  const rng = createRng(seed).fork(`starting-surplus:${spec.name}`);
  const crop = rng.pick(SELLABLE_CROPS);
  const qty = rng.int(1, 3); // 1 or 2 units — small enough not to distort day-1 wealth ordering
  bankHarvest(inv, crop, qty, "normal");
}

export interface FarmerSpec {
  name: string;
  personality: "conservative" | "aggressive" | "hoarder" | "opportunist" | "pip";

  homeRegion: RegionId;
  homeX: number;
  homeY: number;
  startGold: number;
  riskProfile: "low" | "medium" | "high";
  minGoldReserve: number;
  startSeeds: Partial<Record<CropKind, number>>;

  player?: boolean;
}

export function setupFarmer(world: World<GameEntity>, spec: FarmerSpec, seed: number): GameEntity {
  const sprite = `farmer/${spec.personality}`;
  const initialRegion = spec.homeRegion;

  const bdi = bakeBdiJitter(spec, seed);
  const inventory: Inventory = {
    gold: spec.startGold,
    crops: { ...ZERO_CROPS },
    seeds: { ...ZERO_CROPS, ...spec.startSeeds },
    fish: zeroFish(),
    tools: STARTING_TOOLS.map(t => ({ ...t })),
    wateringCan: { charges: 10, maxCharges: 10 },
  };
  seedStartingCropSurplus(inventory, spec, seed);
  const farmer = world.spawn({
    transform: { x: spec.homeX, y: spec.homeY, prevX: spec.homeX, prevY: spec.homeY, rotation: 0 },
    sprite: { atlasId: "main", frame: sprite, layer: 100, tintRgba: 0xffffffff },
    fsm: { current: "WAIT_DAY" as FarmerFsmState, enteredTick: 0 },
    beliefs: { data: { currentDay: 0 }, revision: 0 },
    desires: {
      data: {
        riskProfile: spec.riskProfile,
        minGoldReserve: bdi.minGoldReserve,
        riskTolerance: bdi.riskTolerance,
        beanValueFactor: bdi.beanValueFactor,
      },
    },
    intentions: { queue: [] },
    personality: { kind: spec.personality },
    inbox: { messages: [] },
    farmer: { name: spec.name, currentRegion: initialRegion, homeRegion: initialRegion },
    inventory,
    resources: { wood: 0, stone: 0, ironOre: 0, geodes: 0 },
      ap: { current: 100, max: 100, penaltyPending: false, penaltyCapacity: 50, away: false }, 
    health: { current: HEALTH_MAX, max: HEALTH_MAX },
    ...(spec.player
      ? {
          player: {
            isPlayer: true as const,
            facing: "down" as const,
            pendingMoveX: null,
            pendingMoveY: null,
            pendingAction: false,
            selectedSlot: 0,
            pendingActionTile: null,
            itemSlots: defaultItemSlots(),
          },
        }
      : {}),
  });
  return farmer;
}

export function setupWorldRegions(
  world: World<GameEntity>,
  farmers: GameEntity[],
): ReturnType<typeof setupRegions> {
  return setupRegions(world, farmers);
}
