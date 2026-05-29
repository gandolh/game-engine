import {
  MessageBus,
  Scheduler,
  World,
  createRng,
  type Pathfinder,
  type Rng,
} from "@engine/core";
import type { GameEntity } from "./components";
import { setupFarmer, setupWorldRegions, type FarmerSpec } from "./world-setup";
import { buildWalkableGrid } from "./world/walkable-grid";
import { DayClockSystem } from "./systems/day-clock";
import { ShockSystem, defaultShockDay } from "./systems/shock";
import { InboxDispatchSystem } from "./systems/inbox-dispatch";
import { PerceiveSystem } from "./systems/perceive";
import { TrustSystem } from "./systems/trust";
import { HarvestSystem } from "./systems/harvest";
import { DeliberateSystem } from "./systems/deliberate";
import { ActSystem } from "./systems/act";
import { TravelSystem } from "./systems/travel";
import { EncounterSystem } from "./systems/encounter";
import { MeetIndicatorSystem } from "./systems/meet-indicator";
import { ShopSlateSystem } from "./systems/shop-slate";
import { FinishDaySystem } from "./systems/finish-day";
import { setupWeatherFeature } from "./agents/weather-station";
import { setupMarketShopFeature } from "./agents/market-wall";
import { listCoordinators } from "./agents/cnp-registry";
import "./agents/conservative";
import "./agents/aggressive";
import "./agents/hoarder";
import "./agents/opportunist";

export const DEFAULT_FARMER_SPECS: FarmerSpec[] = [
  {
    name: "Cora",
    personality: "conservative",
    homeX: 24, homeY: 40,
    startGold: 50,
    riskProfile: "low", minGoldReserve: 30,
    startSeeds: { radish: 3 },
  },
  {
    name: "Atticus",
    personality: "aggressive",
    homeX: 296, homeY: 40,
    startGold: 80,
    riskProfile: "high", minGoldReserve: 10,
    startSeeds: { radish: 1, wheat: 1, pumpkin: 1 },
  },
  {
    name: "Hannah",
    personality: "hoarder",
    homeX: 24, homeY: 136,
    startGold: 120,
    riskProfile: "high", minGoldReserve: 80,
    startSeeds: { wheat: 2, pumpkin: 1 },
  },
  {
    name: "Otto",
    personality: "opportunist",
    homeX: 296, homeY: 136,
    startGold: 70,
    riskProfile: "medium", minGoldReserve: 50,
    startSeeds: { radish: 2, wheat: 1 },
  },
];

export interface SimBootstrapOptions {
  seed: number;
  ticksPerDay: number;
  maxDays?: number;
  farmerSpecs?: FarmerSpec[];
  pathfinder?: Pathfinder | null;
  /**
   * Mid-game shock (brief 23, Direction B). Defaults to a blight on the run
   * midpoint. Pass `false` to disable, or override the day/kind.
   */
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
}

export function bootstrapSim(opts: SimBootstrapOptions): BootedSim {
  const rng = createRng(opts.seed);
  const world = new World<GameEntity>();
  const bus = new MessageBus();

  const specs = opts.farmerSpecs ?? DEFAULT_FARMER_SPECS;
  const farmers: GameEntity[] = [];
  for (const spec of specs) {
    const farmer = setupFarmer(world, spec);
    if (farmer.id === undefined) throw new Error(`Farmer ${spec.name} id missing`);
    farmers.push(farmer);
  }

  const weatherFeature = setupWeatherFeature(world, bus, rng);
  const marketShop = setupMarketShopFeature(world, bus, rng);

  // After market-wall + shopkeeper entities exist, lay out the regions —
  // setupWorldRegions both spawns farm plots (3×3 per farm) and decorates
  // the existing market-wall / shopkeeper entities with a Transform.
  setupWorldRegions(world, farmers);

  const maxDays = opts.maxDays ?? DEFAULT_MAX_DAYS;
  const dayClock = new DayClockSystem(bus, {
    ticksPerDay: opts.ticksPerDay,
    maxDays,
  });
  const meetIndicators = new MeetIndicatorSystem(world);
  const scheduler = new Scheduler()
    .add(dayClock);

  // Mid-game shock (default on): runs right after the clock so it sees the
  // current day boundary, before crop growth / harvest resolve that day.
  if (opts.shock !== false) {
    scheduler.add(
      new ShockSystem(bus, world, rng, opts.ticksPerDay, {
        shockDay: opts.shock?.shockDay ?? defaultShockDay(maxDays),
        kind: opts.shock?.kind ?? "blight",
      }),
    );
  }

  scheduler
    .add(weatherFeature.weatherSystem)
    .add(new InboxDispatchSystem(bus, world))
    .add(new ShopSlateSystem(world, bus, rng))
    .add(new EncounterSystem(world, bus))
    .add(meetIndicators)
    .add(new TrustSystem(world, listCoordinators()))
    .add(new PerceiveSystem(world))
    .add(weatherFeature.cropGrowthSystem)
    .add(new HarvestSystem(world))
    .add(new DeliberateSystem(world))
    .add(weatherFeature.apSystem);

  if (opts.pathfinder) {
    scheduler.add(new TravelSystem(world, opts.pathfinder, buildWalkableGrid(), bus));
  }

  scheduler
    .add(new ActSystem(world, bus))
    .add(marketShop.marketSystem)
    .add(marketShop.shopkeeperSystem)
    .add(marketShop.auctionSystem)
    .add(new FinishDaySystem(world));

  return { world, bus, scheduler, dayClock, rng, farmers, meetIndicators };
}

export interface FarmerSummary {
  id: number;
  name: string;
  personality: string;
  gold: number;
  crops: { radish: number; wheat: number; pumpkin: number };
  unsoldValue: number;
  totalValue: number;
}

const SELL_PRICE = { radish: 8, wheat: 14, pumpkin: 35 };

export function leaderboard(world: World<GameEntity>): FarmerSummary[] {
  const out: FarmerSummary[] = [];
  for (const f of world.query("farmer", "inventory", "personality")) {
    if (f.id === undefined) continue;
    const crops = {
      radish: f.inventory.crops.radish,
      wheat: f.inventory.crops.wheat,
      pumpkin: f.inventory.crops.pumpkin,
    };
    const unsoldValue =
      crops.radish * SELL_PRICE.radish +
      crops.wheat * SELL_PRICE.wheat +
      crops.pumpkin * SELL_PRICE.pumpkin;
    out.push({
      id: f.id,
      name: f.farmer.name,
      personality: f.personality.kind,
      gold: f.inventory.gold,
      crops,
      unsoldValue,
      totalValue: f.inventory.gold + unsoldValue,
    });
  }
  out.sort((a, b) => b.totalValue - a.totalValue);
  return out;
}
