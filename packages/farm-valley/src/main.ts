import {
  FixedStepClock,
  GameLoop,
  InputLog,
  MessageBus,
  Scheduler,
  World,
  createRng,
  initWebGpu,
  loadAtlas,
  Camera2D,
  Renderer,
  DebugOverlay,
} from "@engine/core";
import type { AtlasManifest } from "@engine/core";
import type { GameEntity } from "./components";
import { setupFarmer, setupPlot, type FarmerSpec } from "./world-setup";
import { DayClockSystem } from "./systems/day-clock";
import { InboxDispatchSystem } from "./systems/inbox-dispatch";
import { PerceiveSystem } from "./systems/perceive";
import { HarvestSystem } from "./systems/harvest";
import { DeliberateSystem } from "./systems/deliberate";
import { ActSystem } from "./systems/act";
import { FinishDaySystem } from "./systems/finish-day";
import { buildSpriteFrame } from "./render-systems";
import { setupWeatherFeature } from "./agents/weather-station";
import { setupMarketShopFeature } from "./agents/market-wall";
import { ObserverPanel, type ObserverSnapshot } from "./ui";
import "./agents/conservative";
import "./agents/aggressive";
import "./agents/hoarder";
import "./agents/opportunist";

interface BootConfig {
  seed: number;
  tickRateHz: number;
  ticksPerDay: number;
}

const CONFIG: BootConfig = {
  seed: 0xc0ffee,
  tickRateHz: 20,
  ticksPerDay: 20,
};

const FARMER_SPECS: FarmerSpec[] = [
  {
    name: "Cora",
    personality: "conservative",
    homeX: 56, homeY: 48,
    startGold: 50,
    riskProfile: "low", minGoldReserve: 30,
    startSeeds: { radish: 3 },
  },
  {
    name: "Atticus",
    personality: "aggressive",
    homeX: 120, homeY: 48,
    startGold: 80,
    riskProfile: "high", minGoldReserve: 10,
    startSeeds: { radish: 1, wheat: 1, pumpkin: 1 },
  },
  {
    name: "Hannah",
    personality: "hoarder",
    homeX: 56, homeY: 112,
    startGold: 120,
    riskProfile: "high", minGoldReserve: 80,
    startSeeds: { wheat: 2, pumpkin: 1 },
  },
  {
    name: "Otto",
    personality: "opportunist",
    homeX: 120, homeY: 112,
    startGold: 70,
    riskProfile: "medium", minGoldReserve: 50,
    startSeeds: { radish: 2, wheat: 1 },
  },
];

async function boot(): Promise<void> {
  const canvas = document.getElementById("canvas") as HTMLCanvasElement | null;
  const app = document.getElementById("app") as HTMLElement | null;
  const fatal = document.getElementById("fatal") as HTMLElement | null;
  if (!canvas || !app || !fatal) throw new Error("Missing #canvas/#app/#fatal");

  try {
    const gpu = await initWebGpu({ canvas });
    const manifest = await fetchAtlasManifest();
    const atlas = await loadAtlas(gpu.device, manifest);

    const camera = new Camera2D({
      worldUnitsX: 320,
      worldUnitsY: 180,
      centerX: 88,
      centerY: 80,
    });
    const renderer = new Renderer(gpu, camera);
    renderer.spriteBatch.setAtlas(atlas.view);

    const rng = createRng(CONFIG.seed);
    const world = new World<GameEntity>();
    const bus = new MessageBus();
    const inputLog = new InputLog();

    const farmers: GameEntity[] = [];
    for (const [idx, spec] of FARMER_SPECS.entries()) {
      const farmer = setupFarmer(world, spec);
      if (farmer.id === undefined) throw new Error(`Farmer ${spec.name} id missing`);
      farmers.push(farmer);
      const plotOriginX = (idx % 2) * 8 + 3;
      const plotOriginY = Math.floor(idx / 2) * 4 + 3;
      for (let i = 0; i < 4; i++) {
        setupPlot(world, farmer.id, plotOriginX + (i % 2), plotOriginY + Math.floor(i / 2));
      }
    }

    const weatherFeature = setupWeatherFeature(world, bus, rng);
    const marketShop = setupMarketShopFeature(world, bus, rng);

    const dayClock = new DayClockSystem(bus, { ticksPerDay: CONFIG.ticksPerDay });
    const scheduler = new Scheduler()
      .add(dayClock)
      .add(weatherFeature.weatherSystem)
      .add(new InboxDispatchSystem(bus, world))
      .add(new PerceiveSystem(world))
      .add(weatherFeature.cropGrowthSystem)
      .add(new HarvestSystem(world))
      .add(new DeliberateSystem(world))
      .add(weatherFeature.apSystem)
      .add(new ActSystem(world, bus))
      .add(marketShop.marketSystem)
      .add(marketShop.shopkeeperSystem)
      .add(marketShop.auctionSystem)
      .add(new FinishDaySystem(world));

    const clock = new FixedStepClock({ tickRateHz: CONFIG.tickRateHz });
    const overlay = new DebugOverlay(app);
    const observer = new ObserverPanel(app);

    void inputLog;

    const loop = new GameLoop(clock, {
      onTick(tick) {
        for (const e of world.query("transform")) {
          e.transform.prevX = e.transform.x;
          e.transform.prevY = e.transform.y;
        }
        scheduler.tick({ tick });
      },
      onRender(alpha) {
        const encoder = renderer.beginFrame();
        buildSpriteFrame(renderer, world, atlas, alpha);
        renderer.endFrame(encoder);
        const entityCount = countEntities(world);
        overlay.update({ tick: clock.tick, alpha, entityCount });
        observer.update(buildObserverSnapshot(world, dayClock.day));
      },
    });
    loop.start();
  } catch (err) {
    showFatal(fatal, err);
    throw err;
  }
}

function buildObserverSnapshot(world: World<GameEntity>, day: number): ObserverSnapshot {
  const station = (() => {
    for (const w of world.query("weatherStation")) return w.weatherStation;
    return null;
  })();
  const farmerEntries: ObserverSnapshot["farmers"] = [];
  for (const f of world.query("farmer", "inventory", "fsm", "ap", "personality")) {
    if (f.id === undefined) continue;
    farmerEntries.push({
      id: f.id,
      name: f.farmer.name,
      personality: f.personality.kind,
      gold: f.inventory.gold,
      crops: {
        radish: f.inventory.crops.radish,
        wheat: f.inventory.crops.wheat,
        pumpkin: f.inventory.crops.pumpkin,
      },
      fsm: f.fsm.current,
      apCurrent: f.ap.current,
      apMax: f.ap.max,
      apPenaltyPending: f.ap.penaltyPending,
    });
  }
  farmerEntries.sort((a, b) => a.id - b.id);
  return {
    day,
    weather: {
      condition: station?.current ?? "normal",
      multiplier: station?.multiplier ?? 1,
    },
    forecast: (station?.forecast ?? []).map((f) => ({
      condition: f.condition,
      confidence: f.confidence,
    })),
    farmers: farmerEntries,
  };
}

function countEntities(world: World<GameEntity>): number {
  let n = 0;
  for (const _ of world.query("transform")) n += 1;
  for (const _ of world.query("plot")) n += 1;
  return n;
}

async function fetchAtlasManifest(): Promise<AtlasManifest> {
  const res = await fetch("/atlas/main.json");
  if (!res.ok) throw new Error(`Atlas manifest fetch failed: ${res.status}`);
  return (await res.json()) as AtlasManifest;
}

function showFatal(el: HTMLElement, err: unknown): void {
  el.classList.add("visible");
  const msg = err instanceof Error ? err.message : String(err);
  el.textContent = `Failed to boot: ${msg}`;
}

void boot();
