import {
  MessageBus,
  Scheduler,
  World,
  createRng,
  type Pathfinder,
  type PathfinderGrid,
  type Rng,
} from "@engine/core";

export interface PathfinderLike {
  findPath(
    grid: PathfinderGrid,
    start: { x: number; y: number },
    end: { x: number; y: number },
  ): { x: number; y: number }[];
}
import type { GameEntity } from "./components";
import { setupFarmer, setupWorldRegions, type FarmerSpec } from "./world-setup";
import { EXTRA_FARM_COUNT, type RegionId } from "./world/regions";
import { buildWalkableGrid } from "./world/walkable-grid";
import { buildBoatGrid } from "./world/coral";
import { DayClockSystem } from "./systems/day-clock";
import { ShockSystem, defaultShockDay } from "./systems/shock";
import { TileFeatureSystem } from "./systems/tile-features";
import { BubbleSystem } from "./systems/bubbles";
import { InboxDispatchSystem } from "./systems/inbox-dispatch";
import { PerceiveSystem } from "./systems/perceive";
import { TrustSystem } from "./systems/trust";
import { HarvestSystem } from "./systems/harvest";
import { PlotSenseSystem } from "./systems/plot-sense";
import { DeliberateSystem } from "./systems/deliberate";
import { PlayerControlSystem } from "./systems/player-control";
import { ActSystem } from "./systems/act";
import { TravelSystem } from "./systems/travel";
import { FeatureCollisionSystem } from "./systems/feature-collision";
import { EncounterSystem } from "./systems/encounter";
import { EncounterTradeSystem } from "./systems/encounter-trade";
import { MeetIndicatorSystem } from "./systems/meet-indicator";
import { EventFeedSystem } from "./systems/event-feed";
import { RunHistorySystem } from "./systems/run-history";
import { RivalrySystem } from "./systems/rivalry";
import { CombatSystem, ChaseSystem, AggressionSystem } from "./systems/combat";
import { ShopSlateSystem } from "./systems/shop-slate";
import { NoticeBoardSystem } from "./systems/notice-board";
import { FinishDaySystem } from "./systems/finish-day";
import { WorkNpcSystem } from "./systems/work-npc";
import { NpcDeliberateSystem } from "./systems/npc-deliberate";
import { CarpenterSystem } from "./systems/carpenter";
import { TavernSystem } from "./systems/tavern";
import { FestivalSystem } from "./systems/festival";
import { LivestockSystem } from "./systems/livestock";
import { OrchardSystem } from "./systems/orchard";
import { HarborSystem } from "./systems/harbor";
import { setupWeatherFeature } from "./agents/weather-station";
import { setupMarketShopFeature } from "./agents/market-wall";
import { listCoordinators } from "./agents/cnp-registry";
import { cropInventoryValue, productInventoryValue, fruitInventoryValue, ANIMAL_BUY_COST, FRUIT_SELL_PRICE, FRUIT_YIELD_PER_HARVEST } from "./economy";
import "./agents/conservative";
import "./agents/aggressive";
import "./agents/hoarder";
import "./agents/opportunist";

const FIXED_FARMER_SPECS: FarmerSpec[] = [
  {
    name: "Cora",
    personality: "conservative",
    homeRegion: "farm-cora",
    homeX: 24, homeY: 40,
    startGold: 80,
    riskProfile: "low", minGoldReserve: 30,
    startSeeds: { radish: 3 },
  },
  {
    name: "Atticus",
    personality: "aggressive",
    homeRegion: "farm-atticus",
    homeX: 296, homeY: 40,
    startGold: 110,
    riskProfile: "high", minGoldReserve: 10,
    startSeeds: { radish: 1, wheat: 1, pumpkin: 1 },
  },
  {
    name: "Hannah",
    personality: "hoarder",
    homeRegion: "farm-hannah",
    homeX: 24, homeY: 136,
    startGold: 150,
    riskProfile: "high", minGoldReserve: 80,
    startSeeds: { wheat: 2, pumpkin: 1 },
  },
  {
    name: "Otto",
    personality: "opportunist",
    homeRegion: "farm-otto",
    homeX: 296, homeY: 136,
    startGold: 100,
    riskProfile: "medium", minGoldReserve: 50,
    startSeeds: { radish: 2, wheat: 1 },
  },
  {
    name: "Pip",
    personality: "pip",
    homeRegion: "farm-pip",
    homeX: 33, homeY: 19,
    startGold: 90,
    riskProfile: "medium", minGoldReserve: 0,
    startSeeds: { radish: 3, wheat: 1 },
    player: true,
  },
];

const EXTRA_FARMER_TEMPLATES: ReadonlyArray<Omit<FarmerSpec, "homeRegion" | "homeX" | "homeY" | "name"> & { baseName: string }> = [
  { baseName: "Cora",    personality: "conservative", startGold: 80,  riskProfile: "low",    minGoldReserve: 30, startSeeds: { radish: 3 } },
  { baseName: "Atticus", personality: "aggressive",   startGold: 110, riskProfile: "high",   minGoldReserve: 10, startSeeds: { radish: 1, wheat: 1, pumpkin: 1 } },
  { baseName: "Hannah",  personality: "hoarder",      startGold: 150, riskProfile: "high",   minGoldReserve: 80, startSeeds: { wheat: 2, pumpkin: 1 } },
  { baseName: "Otto",    personality: "opportunist",  startGold: 100, riskProfile: "medium", minGoldReserve: 50, startSeeds: { radish: 2, wheat: 1 } },
];

function makeExtraFarmerSpecs(): FarmerSpec[] {
  const specs: FarmerSpec[] = [];
  for (let i = 0; i < EXTRA_FARM_COUNT; i++) {
    const t = EXTRA_FARMER_TEMPLATES[i % EXTRA_FARMER_TEMPLATES.length]!;
    specs.push({
      name: `${t.baseName}-${i}`,
      personality: t.personality,
      homeRegion: `farm-${i}` as RegionId,
      homeX: 0, homeY: 0,
      startGold: t.startGold,
      riskProfile: t.riskProfile,
      minGoldReserve: t.minGoldReserve,
      startSeeds: { ...t.startSeeds },
    });
  }
  return specs;
}

export const DEFAULT_FARMER_SPECS: FarmerSpec[] = [
  ...FIXED_FARMER_SPECS,
  ...makeExtraFarmerSpecs(),
];

export interface SimBootstrapOptions {
  seed: number;
  ticksPerDay: number;
  maxDays?: number;
  farmerSpecs?: FarmerSpec[];
  /** Accepts WASM Pathfinder or pure-JS JsPathfinder (duck-typed). Null/undefined omits TravelSystem. */
  pathfinder?: PathfinderLike | Pathfinder | null;
  /** Mid-game shock. Defaults to a blight at the run midpoint. Pass `false` to disable. */
  shock?: false | { shockDay?: number; kind?: "blight" };
}

const DEFAULT_MAX_DAYS = 100;

export interface BootedSim {
  world: World<GameEntity>;
  bus: MessageBus;
  scheduler: Scheduler;
  dayClock: DayClockSystem;
  rng: Rng;
  farmers: GameEntity[];
  meetIndicators: MeetIndicatorSystem;
  eventFeed: EventFeedSystem;
  runHistory: RunHistorySystem;
  rivalry: RivalrySystem;
  combat: CombatSystem;
}

export function bootstrapSim(opts: SimBootstrapOptions): BootedSim {
  const rng = createRng(opts.seed);
  const world = new World<GameEntity>();
  const bus = new MessageBus();

  const specs = opts.farmerSpecs ?? DEFAULT_FARMER_SPECS;
  const farmers: GameEntity[] = [];
  for (const spec of specs) {
    const farmer = setupFarmer(world, spec, opts.seed);
    if (farmer.id === undefined) throw new Error(`Farmer ${spec.name} id missing`);
    farmers.push(farmer);
  }

  const weatherFeature = setupWeatherFeature(world, bus, rng);
  const marketShop = setupMarketShopFeature(world, bus, rng, opts.ticksPerDay);

  // After market-wall + shopkeeper entities exist: spawns farm plots and gives them a Transform.
  setupWorldRegions(world, farmers);

  const maxDays = opts.maxDays ?? DEFAULT_MAX_DAYS;
  const dayClock = new DayClockSystem(bus, {
    ticksPerDay: opts.ticksPerDay,
    maxDays,
  });
  const meetIndicators = new MeetIndicatorSystem(world);
  const rivalry = new RivalrySystem(world);
  const combat = new CombatSystem(world, bus, rng, opts.ticksPerDay);
  const runHistory = new RunHistorySystem(world, bus);
  const eventFeed = new EventFeedSystem(world, dayClock, rivalry, runHistory);
  const scheduler = new Scheduler()
    .stage("CLOCK")
    .add(dayClock);

  if (opts.shock !== false) {
    scheduler.add(
      new ShockSystem(bus, world, rng, opts.ticksPerDay, {
        shockDay: opts.shock?.shockDay ?? defaultShockDay(maxDays),
        kind: opts.shock?.kind ?? "blight",
      }),
    );
  }

  scheduler
    .stage("DISPATCH")
    .add(weatherFeature.weatherSystem)
    .add(new InboxDispatchSystem(bus, world))
    .add(new ShopSlateSystem(world, bus, rng))
    .add(new NoticeBoardSystem(world, bus, rng))
    .stage("SNOOP")
    .add(new EncounterSystem(world, bus))
    .add(new EncounterTradeSystem(world))
    .add(meetIndicators)
    .add(new TrustSystem(world, listCoordinators()))
    .add(rivalry)
    .add(new FestivalSystem(bus, world, rng, opts.ticksPerDay))
    .add(new HarborSystem(world, bus, rng))
    .add(eventFeed)
    .add(new TavernSystem(world, eventFeed, bus))
    .add(runHistory)
    .stage("PERCEIVE")
    .add(new PerceiveSystem(world))
    .stage("GROW")
    .add(weatherFeature.cropGrowthSystem)
    .add(new TileFeatureSystem(world, rng, bus))
    .add(new BubbleSystem(world, rng))
    .add(new HarvestSystem(world, rng))
    .add(new LivestockSystem(world, rng))
    .add(new OrchardSystem(world))
    .add(new PlotSenseSystem(world))
    .stage("DELIBERATE")
    .add(new DeliberateSystem(world))
    .add(new PlayerControlSystem(world))
    .add(new AggressionSystem(world, combat))
    .add(weatherFeature.apSystem);

  if (opts.pathfinder) {
    const grid = buildWalkableGrid();
    // separate boat grid (water lanes); TravelSystem swaps to it while a farmer is aboard
    const boatGrid = buildBoatGrid();
    scheduler.stage("MOVE");
    scheduler.add(new FeatureCollisionSystem(world, grid));
    // ChaseSystem (re)points the pursuit travel intent BEFORE TravelSystem steps it.
    scheduler.add(new ChaseSystem(world, bus, combat, opts.ticksPerDay));
    scheduler.add(new TravelSystem(world, opts.pathfinder as Pathfinder, grid, bus, boatGrid));
  }

  scheduler
    .stage("ACT")
    .add(new ActSystem(world, rng, bus))
    .add(marketShop.marketSystem)
    .add(marketShop.shopkeeperSystem)
    .add(marketShop.auctionSystem)
    .add(new CarpenterSystem(world, bus))
    .add(new NpcDeliberateSystem(world))
    .add(new WorkNpcSystem(world))
    .add(combat)
    .add(new FinishDaySystem(world));

  return { world, bus, scheduler, dayClock, rng, farmers, meetIndicators, eventFeed, runHistory, rivalry, combat };
}

export interface FarmerSummary {
  id: number;
  name: string;
  personality: string;
  gold: number;
  crops: Partial<Record<import("./components").CropKind, number>>;
  /** Quality-weighted value of all held crops. */
  unsoldValue: number;
  /** Value of held products + fruit. */
  livestockValue: number;
  /** Value of pens (animal count × buy cost) + mature orchards (× avg fruit value). */
  assetValue: number;
  totalValue: number;
}

export function leaderboard(world: World<GameEntity>): FarmerSummary[] {
  const out: FarmerSummary[] = [];

  const penValueByOwner = new Map<number, number>();
  const orchardValueByOwner = new Map<number, number>();
  for (const p of world.query("pen")) {
    const ownerId = p.pen.ownerId;
    const animalVal = (ANIMAL_BUY_COST[p.pen.animal] ?? 0) * p.pen.count;
    penValueByOwner.set(ownerId, (penValueByOwner.get(ownerId) ?? 0) + animalVal);
  }
  for (const t of world.query("orchardTree")) {
    const ownerId = t.orchardTree.ownerId;
    if (!t.orchardTree.mature) continue;
    const fruitVal = FRUIT_YIELD_PER_HARVEST * FRUIT_SELL_PRICE[t.orchardTree.kind];
    orchardValueByOwner.set(ownerId, (orchardValueByOwner.get(ownerId) ?? 0) + fruitVal);
  }

  for (const f of world.query("farmer", "inventory", "personality")) {
    if (f.id === undefined) continue;
    const unsoldValue = cropInventoryValue(f.inventory);
    const livestockValue = productInventoryValue(f.inventory) + fruitInventoryValue(f.inventory);
    const assetValue = (penValueByOwner.get(f.id) ?? 0) + (orchardValueByOwner.get(f.id) ?? 0);
    const crops: Partial<Record<import("./components").CropKind, number>> = {};
    for (const [k, v] of Object.entries(f.inventory.crops) as [import("./components").CropKind, number][]) {
      if (v > 0) crops[k] = v;
    }
    out.push({
      id: f.id,
      name: f.farmer.name,
      personality: f.personality.kind,
      gold: f.inventory.gold,
      crops,
      unsoldValue,
      livestockValue,
      assetValue,
      totalValue: f.inventory.gold + unsoldValue + livestockValue + assetValue,
    });
  }
  out.sort((a, b) => b.totalValue - a.totalValue);
  return out;
}
