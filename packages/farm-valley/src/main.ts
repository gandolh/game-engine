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
import { setupFarmer, setupPlot } from "./world-setup";
import { DayClockSystem } from "./systems/day-clock";
import { InboxDispatchSystem } from "./systems/inbox-dispatch";
import { PerceiveSystem } from "./systems/perceive";
import { HarvestSystem } from "./systems/harvest";
import { DeliberateSystem } from "./systems/deliberate";
import { ActSystem } from "./systems/act";
import { FinishDaySystem } from "./systems/finish-day";
import { buildSpriteFrame } from "./render-systems";

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
      centerX: 80,
      centerY: 60,
    });
    const renderer = new Renderer(gpu, camera);
    renderer.spriteBatch.setAtlas(atlas.view);

    const rng = createRng(CONFIG.seed);
    const world = new World<GameEntity>();
    const bus = new MessageBus();
    const inputLog = new InputLog();

    const conservative = setupFarmer(world, {
      name: "Cora",
      personality: "conservative",
      homeX: 16,
      homeY: 64,
      startGold: 50,
      riskProfile: "low",
      minGoldReserve: 30,
      startSeeds: { radish: 3 },
    });
    if (conservative.id === undefined) throw new Error("Farmer id missing");
    for (let i = 0; i < 4; i++) {
      setupPlot(world, conservative.id, 4 + i, 6);
    }

    const dayClock = new DayClockSystem(bus, { ticksPerDay: CONFIG.ticksPerDay });
    const scheduler = new Scheduler()
      .add(dayClock)
      .add(new InboxDispatchSystem(bus, world))
      .add(new PerceiveSystem(world))
      .add(new HarvestSystem(world))
      .add(new DeliberateSystem(world))
      .add(new ActSystem(world))
      .add(new FinishDaySystem(world));

    const clock = new FixedStepClock({ tickRateHz: CONFIG.tickRateHz });
    const overlay = new DebugOverlay(app);

    void rng;
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
      },
    });
    loop.start();
  } catch (err) {
    showFatal(fatal, err);
    throw err;
  }
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
