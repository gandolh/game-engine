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
import { TileFeatureSystem } from "./systems/tile-features";
import { InboxDispatchSystem } from "./systems/inbox-dispatch";
import { PerceiveSystem } from "./systems/perceive";
import { TrustSystem } from "./systems/trust";
import { HarvestSystem } from "./systems/harvest";
import { PlotSenseSystem } from "./systems/plot-sense";
import { DeliberateSystem } from "./systems/deliberate";
import { ActSystem } from "./systems/act";
import { TravelSystem } from "./systems/travel";
import { EncounterSystem } from "./systems/encounter";
import { EncounterTradeSystem } from "./systems/encounter-trade";
import { MeetIndicatorSystem } from "./systems/meet-indicator";
import { EventFeedSystem } from "./systems/event-feed";
import { ShopSlateSystem } from "./systems/shop-slate";
import { NoticeBoardSystem } from "./systems/notice-board";
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
  eventFeed: EventFeedSystem;
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
  const marketShop = setupMarketShopFeature(world, bus, rng, opts.ticksPerDay);

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
  const eventFeed = new EventFeedSystem(world, dayClock);
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
    .add(new NoticeBoardSystem(world, bus, rng))
    .add(new EncounterSystem(world, bus))
    // brief 24 — EncounterTradeSystem drives peer seed trades (brief 09) AND
    // golden-bean gifts on MEET. Its docstring requires the order
    // EncounterSystem → EncounterTradeSystem → PerceiveSystem (PerceiveSystem
    // clears inboxes). It was absent from the scheduler after the worker
    // migration, so peer trades/gifts never fired live; registering it here.
    .add(new EncounterTradeSystem(world))
    .add(meetIndicators)
    .add(new TrustSystem(world, listCoordinators()))
    // Read-only activity-feed snoop: must observe inbox + market-wall messages
    // before PerceiveSystem clears them and before MarketSystem drains the wall.
    .add(eventFeed)
    .add(new PerceiveSystem(world))
    .add(weatherFeature.cropGrowthSystem)
    .add(new TileFeatureSystem(world, rng, bus))
    .add(new HarvestSystem(world))
    // brief 29 — surface owned-plot watering needs into beliefs before agents
    // deliberate, so survival-reflex watering can be queued.
    .add(new PlotSenseSystem(world))
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

  return { world, bus, scheduler, dayClock, rng, farmers, meetIndicators, eventFeed };
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
