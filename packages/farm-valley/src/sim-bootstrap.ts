import {
  MessageBus,
  Scheduler,
  World,
  createRng,
  type Pathfinder,
  type PathfinderGrid,
  type Rng,
} from "@engine/core";

/**
 * Duck-typed pathfinder interface accepted by bootstrapSim. Both the WASM
 * Pathfinder class and the pure-JS JsPathfinder satisfy this shape, so
 * headless runs can use the JS fallback without importing the WASM module.
 */
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

/**
 * The five original, hand-placed farmers (four AI archetypes + the player Pip),
 * each on its named corner/top farm island.
 */
const FIXED_FARMER_SPECS: FarmerSpec[] = [
  {
    name: "Cora",
    personality: "conservative",
    homeRegion: "farm-cora",
    homeX: 24, homeY: 40,
    startGold: 50,
    riskProfile: "low", minGoldReserve: 30,
    startSeeds: { radish: 3 },
  },
  {
    name: "Atticus",
    personality: "aggressive",
    homeRegion: "farm-atticus",
    homeX: 296, homeY: 40,
    startGold: 80,
    riskProfile: "high", minGoldReserve: 10,
    startSeeds: { radish: 1, wheat: 1, pumpkin: 1 },
  },
  {
    name: "Hannah",
    personality: "hoarder",
    homeRegion: "farm-hannah",
    homeX: 24, homeY: 136,
    startGold: 120,
    riskProfile: "high", minGoldReserve: 80,
    startSeeds: { wheat: 2, pumpkin: 1 },
  },
  {
    name: "Otto",
    personality: "opportunist",
    homeRegion: "farm-otto",
    homeX: 296, homeY: 136,
    startGold: 70,
    riskProfile: "medium", minGoldReserve: 50,
    startSeeds: { radish: 2, wheat: 1 },
  },
  {
    // Pip — the player-controlled farmer. Same starting kit as the AI farmers;
    // its intentions come from keyboard input (PlayerControlSystem), not an AI
    // personality. homeX/homeY are nominal (region-setup moves it to farm-pip
    // center). Lives on farm-pip (far east).
    name: "Pip",
    personality: "pip",
    homeRegion: "farm-pip",
    homeX: 33, homeY: 19,
    startGold: 60,
    riskProfile: "medium", minGoldReserve: 0,
    startSeeds: { radish: 3, wheat: 1 },
    player: true,
  },
];

/**
 * The four AI archetypes, in cycle order, each a template for the extra farmers
 * generated to fill the procedural southern farm band (`farm-0`..). Index `i`
 * picks `EXTRA_FARMER_TEMPLATES[i % 4]`; the name is suffixed with the index so
 * every farmer's label is unique (e.g. "Cora-2", "Atticus-2", …).
 */
const EXTRA_FARMER_TEMPLATES: ReadonlyArray<Omit<FarmerSpec, "homeRegion" | "homeX" | "homeY" | "name"> & { baseName: string }> = [
  { baseName: "Cora",    personality: "conservative", startGold: 50,  riskProfile: "low",    minGoldReserve: 30, startSeeds: { radish: 3 } },
  { baseName: "Atticus", personality: "aggressive",   startGold: 80,  riskProfile: "high",   minGoldReserve: 10, startSeeds: { radish: 1, wheat: 1, pumpkin: 1 } },
  { baseName: "Hannah",  personality: "hoarder",      startGold: 120, riskProfile: "high",   minGoldReserve: 80, startSeeds: { wheat: 2, pumpkin: 1 } },
  { baseName: "Otto",    personality: "opportunist",  startGold: 70,  riskProfile: "medium", minGoldReserve: 50, startSeeds: { radish: 2, wheat: 1 } },
];

/**
 * Generate the extra AI farmers that populate the procedural farm band. One per
 * `farm-${i}` region (i in 0..EXTRA_FARM_COUNT-1), cycling the four archetypes.
 * homeX/homeY are nominal — setupRegions repositions each farmer to its farm
 * center. Determinism-safe: pure function of the index, no RNG.
 */
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
  /**
   * Pathfinder for TravelSystem. Accepts either the WASM Pathfinder or the
   * pure-JS JsPathfinder (duck-typed by PathfinderLike). Pass null/undefined
   * to omit TravelSystem (farmers stay put — for legacy tests only).
   */
  pathfinder?: PathfinderLike | Pathfinder | null;
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
  runHistory: RunHistorySystem;
  rivalry: RivalrySystem;
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
  const rivalry = new RivalrySystem(world, listCoordinators());
  const runHistory = new RunHistorySystem(world);
  // Pass runHistory so EventFeedSystem can detect rank-1 changes and emit the
  // "race is on" line. RunHistorySystem is constructed first (no mutual dep).
  const eventFeed = new EventFeedSystem(world, dayClock, rivalry, runHistory);
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
    // brief 37 — RivalrySystem must run BEFORE EventFeedSystem so that the feed
    // can read freshlyFormedThisTick() on the same tick.
    .add(rivalry)
    // brief 45 — FestivalSystem runs in the read-only snoop band: it reads the
    // fresh DAY_START (delivered by InboxDispatchSystem above), announces a
    // festival day + writes festival awareness into beliefs BEFORE PerceiveSystem
    // clears inboxes / DeliberateSystem reads them, and resolves the PREVIOUS
    // festival day's contest into an ONT_FESTIVAL.RESULT broadcast. That RESULT
    // is fanned to the market-wall inbox next tick, where EventFeedSystem snoops
    // it (single surface, exactly like AUCTION_RESULT). It mutates only farmer
    // gold (the prize) + beliefs; it must precede DeliberateSystem.
    .add(new FestivalSystem(bus, world, rng, opts.ticksPerDay))
    // brief 46 — HarborSystem runs in the snoop band: it reads DAY_START from
    // the harbor board inbox, posts new contracts on cadence days, resolves
    // missed deadlines on day boundary, and handles delivery confirmations.
    // Runs BEFORE EventFeedSystem so the feed can snoop the harbor broadcast
    // messages (CONTRACT_POSTED, CONTRACT_DELIVERED, CONTRACT_MISSED) before
    // PerceiveSystem clears inboxes.
    .add(new HarborSystem(world, bus, rng))
    // Read-only activity-feed snoop: must observe inbox + market-wall messages
    // before PerceiveSystem clears them and before MarketSystem drains the wall.
    .add(eventFeed)
    // brief 44 — the tavern barkeep refreshes its daily gossip line from the
    // event feed. Runs right AFTER EventFeedSystem (so the feed is up to date)
    // and before PerceiveSystem clears the tavern inbox's DAY_START. Reads the
    // feed deterministically (highest-drama recent entry).
    .add(new TavernSystem(world, eventFeed))
    // Per-day rank/gold history collector. Snoops DAY_START from the
    // weatherStation inbox (same pattern as BubbleSystem). Runs here in the
    // read-only snoop band so messages are visible before PerceiveSystem clears.
    .add(runHistory)
    .add(new PerceiveSystem(world))
    .add(weatherFeature.cropGrowthSystem)
    .add(new TileFeatureSystem(world, rng, bus))
    .add(new BubbleSystem(world, rng))
    .add(new HarvestSystem(world, rng))
    // brief 42 — livestock daily product yield + care decay (runs after harvest).
    .add(new LivestockSystem(world, rng))
    // brief 42 — orchard maturation + seasonal fruit-drop.
    .add(new OrchardSystem(world))
    // brief 29 — surface owned-plot watering needs into beliefs before agents
    // deliberate, so survival-reflex watering can be queued.
    .add(new PlotSenseSystem(world))
    .add(new DeliberateSystem(world))
    // Player (Pip) input → movement + a context action queued for ActSystem.
    // Runs after DeliberateSystem (which skips the player) and before
    // TravelSystem/ActSystem so a requested action executes the same tick.
    .add(new PlayerControlSystem(world))
    .add(weatherFeature.apSystem);

  if (opts.pathfinder) {
    // Cast to Pathfinder: JsPathfinder satisfies the duck type; WASM Pathfinder
    // is an exact match. Both provide findPath(grid, start, end). The grid is
    // shared with FeatureCollisionSystem, which blocks tree/stone tiles on it
    // each tick so farmers never path through a feature.
    const grid = buildWalkableGrid();
    // brief 48 — the boat-travel grid (water lanes dock→reef). Separate from the
    // land grid so the engine pathfinder + the land walkable-grid are untouched;
    // TravelSystem swaps to it while a farmer is aboard.
    const boatGrid = buildBoatGrid();
    scheduler.add(new FeatureCollisionSystem(world, grid));
    scheduler.add(new TravelSystem(world, opts.pathfinder as Pathfinder, grid, bus, boatGrid));
  }

  scheduler
    .add(new ActSystem(world, bus, rng))
    .add(marketShop.marketSystem)
    .add(marketShop.shopkeeperSystem)
    .add(marketShop.auctionSystem)
    // brief 44 — the carpenter validates + fulfills commissioned builds. Runs in
    // the resolve band next to the shopkeeper (the order→fulfill twin): it drains
    // ONT_COMMISSION.BUILD orders from its inbox (delivered by InboxDispatchSystem
    // the tick after a farmer's commission-build act), escrows the cost, and
    // delivers the structure after a build-time.
    .add(new CarpenterSystem(world, bus))
    // NpcDeliberateSystem sets each service NPC's busyFactor from world state;
    // WorkNpcSystem (next) scales its patrol cadence by it. Cosmetic + pure.
    .add(new NpcDeliberateSystem(world))
    .add(new WorkNpcSystem(world))
    .add(new FinishDaySystem(world));

  return { world, bus, scheduler, dayClock, rng, farmers, meetIndicators, eventFeed, runHistory, rivalry };
}

export interface FarmerSummary {
  id: number;
  name: string;
  personality: string;
  gold: number;
  /** Total crop counts per kind (quality-blind). */
  crops: Partial<Record<import("./components").CropKind, number>>;
  /** brief 41 — quality-weighted value of all held crops. */
  unsoldValue: number;
  /** brief 42 — value of held products + fruit. */
  livestockValue: number;
  /** brief 42 — value of pens (animal count × buy cost) + mature orchards (orchard count × avg fruit value). */
  assetValue: number;
  totalValue: number;
}

export function leaderboard(world: World<GameEntity>): FarmerSummary[] {
  const out: FarmerSummary[] = [];

  // brief 42 — build per-farmer pen and orchard asset values.
  const penValueByOwner = new Map<number, number>();
  const orchardValueByOwner = new Map<number, number>();
  for (const p of world.query("pen")) {
    const ownerId = p.pen.ownerId;
    // Value pens by animal count × buy cost (rough liquidation value).
    const animalVal = (ANIMAL_BUY_COST[p.pen.animal] ?? 0) * p.pen.count;
    penValueByOwner.set(ownerId, (penValueByOwner.get(ownerId) ?? 0) + animalVal);
  }
  for (const t of world.query("orchardTree")) {
    const ownerId = t.orchardTree.ownerId;
    if (!t.orchardTree.mature) continue;
    // Mature orchard value: expected annual yield × sell price.
    const fruitVal = FRUIT_YIELD_PER_HARVEST * FRUIT_SELL_PRICE[t.orchardTree.kind];
    orchardValueByOwner.set(ownerId, (orchardValueByOwner.get(ownerId) ?? 0) + fruitVal);
  }

  for (const f of world.query("farmer", "inventory", "personality")) {
    if (f.id === undefined) continue;
    // brief 41 — quality-weighted unsold value (uses cropQuality if present).
    const unsoldValue = cropInventoryValue(f.inventory);
    // brief 42 — livestock product + fruit value.
    const livestockValue = productInventoryValue(f.inventory) + fruitInventoryValue(f.inventory);
    // brief 42 — pen + orchard asset value.
    const assetValue = (penValueByOwner.get(f.id) ?? 0) + (orchardValueByOwner.get(f.id) ?? 0);
    // Snapshot all crop counts (dynamic keyset so new crops appear automatically).
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
