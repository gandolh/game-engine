import {
  FixedStepClock,
  GameLoop,
  InputLog,
  loadAtlasImage,
  Camera2D,
  Canvas2dRenderer,
  DebugOverlay,
  createPathfinderFromUrl,
} from "@engine/core";
import type { AtlasManifest, Pathfinder } from "@engine/core";
import { buildCanvasFrame } from "./render-systems";
import { bootstrapSim, leaderboard, type FarmerSummary } from "./sim-bootstrap";
import { ObserverPanel, type ObserverSnapshot } from "./ui";
import { HomeScreen } from "./screens";
import { WORLD_WIDTH, WORLD_HEIGHT } from "./world/regions";

interface BootConfig {
  seed: number;
  tickRateHz: number;
  ticksPerDay: number;
  maxDays: number;
}

const CONFIG: BootConfig = {
  seed: 0xc0ffee,
  tickRateHz: 20,
  ticksPerDay: 20,
  maxDays: 100,
};

const TILE = 16;
const CAMERA_CONFIG = {
  worldUnitsX: WORLD_WIDTH * TILE,
  worldUnitsY: WORLD_HEIGHT * TILE,
  centerX: (WORLD_WIDTH * TILE) / 2,
  centerY: (WORLD_HEIGHT * TILE) / 2,
} as const;

interface Runtime {
  renderer: Canvas2dRenderer;
  pathfinder: Pathfinder | null;
}

async function setupRuntime(canvas: HTMLCanvasElement): Promise<Runtime> {
  const manifest = await fetchAtlasManifest();
  const atlasImage = await loadAtlasImage(manifest);
  const camera = new Camera2D(CAMERA_CONFIG);
  const renderer = new Canvas2dRenderer(canvas, camera);
  renderer.setAtlas(atlasImage);
  const pathfinder = await loadPathfinder();
  return { renderer, pathfinder };
}

async function boot(): Promise<void> {
  const canvas = document.getElementById("canvas") as HTMLCanvasElement | null;
  const app = document.getElementById("app") as HTMLElement | null;
  const fatal = document.getElementById("fatal") as HTMLElement | null;
  if (!canvas || !app || !fatal) throw new Error("Missing #canvas/#app/#fatal");

  const home = new HomeScreen(app);

  const runtimePromise = setupRuntime(canvas);
  runtimePromise.catch(() => {});

  home.onStartClicked(() => {
    void startGame(app, fatal, runtimePromise);
  });
}

async function startGame(
  app: HTMLElement,
  fatal: HTMLElement,
  runtimePromise: Promise<Runtime>,
): Promise<void> {
  try {
    const { renderer, pathfinder } = await runtimePromise;

    const { world, scheduler, dayClock } = bootstrapSim({
      seed: CONFIG.seed,
      ticksPerDay: CONFIG.ticksPerDay,
      maxDays: CONFIG.maxDays,
      pathfinder,
    });

    const clock = new FixedStepClock({ tickRateHz: CONFIG.tickRateHz });
    const overlay = new DebugOverlay(app);
    const observer = new ObserverPanel(app);
    const gameOverPanel = createGameOverPanel(app);
    const inputLog = new InputLog();
    let gameOver = false;
    let finalSummary: FarmerSummary[] = [];

    void inputLog;

    const loop = new GameLoop(clock, {
      onTick(tick) {
        if (gameOver) return;
        for (const e of world.query("transform")) {
          e.transform.prevX = e.transform.x;
          e.transform.prevY = e.transform.y;
        }
        scheduler.tick({ tick });
        if (dayClock.day >= CONFIG.maxDays) {
          gameOver = true;
          finalSummary = leaderboard(world);
          renderGameOver(gameOverPanel, finalSummary, dayClock.day);
        }
      },
      onRender(alpha) {
        renderer.beginFrame();
        buildCanvasFrame(renderer, world, alpha);
        renderer.endFrame();
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

/**
 * Compute the humanized region label for a farmer:
 *  - traveling (path !== undefined) → 'traveling'
 *  - in village                     → 'village'
 *  - on their own farm              → 'home'
 *  - on a peer's farm               → the raw region id (e.g. 'farm-otto')
 */
function deriveRegionLabel(
  name: string,
  currentRegion: string,
  isTraveling: boolean,
): string {
  if (isTraveling) return "traveling";
  if (currentRegion === "village") return "village";
  if (currentRegion === `farm-${name.toLowerCase()}`) return "home";
  return currentRegion;
}

function buildObserverSnapshot(
  world: ReturnType<typeof bootstrapSim>["world"],
  day: number,
): ObserverSnapshot {
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
      region: deriveRegionLabel(f.farmer.name, f.farmer.currentRegion, f.farmer.path !== undefined),
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

function createGameOverPanel(parent: HTMLElement): HTMLElement {
  const panel = document.createElement("div");
  panel.style.cssText = [
    "position: absolute",
    "left: 50%",
    "top: 50%",
    "transform: translate(-50%, -50%)",
    "min-width: 480px",
    "padding: 24px 32px",
    "font: 13px/1.5 ui-monospace, monospace",
    "color: #f5e9c8",
    "background: rgba(20, 18, 28, 0.95)",
    "border: 2px solid #c9a85a",
    "border-radius: 8px",
    "box-shadow: 0 0 60px rgba(201, 168, 90, 0.35)",
    "z-index: 200",
    "display: none",
    "white-space: pre",
  ].join(";");
  parent.appendChild(panel);
  return panel;
}

function renderGameOver(
  panel: HTMLElement,
  rows: FarmerSummary[],
  finalDay: number,
): void {
  const lines: string[] = [];
  lines.push(`╔══ FARM VALLEY — final standings after ${finalDay} days ══╗`);
  lines.push("");
  lines.push("  rank  name      personality      gold  unsold  total   crops");
  lines.push("  " + "─".repeat(60));
  rows.forEach((r, i) => {
    const cropStr = `r${r.crops.radish} w${r.crops.wheat} p${r.crops.pumpkin}`;
    lines.push(
      `  ${String(i + 1).padEnd(5)} ${r.name.padEnd(9)} ${r.personality.padEnd(15)} ${String(r.gold).padStart(5)}  ${String(r.unsoldValue).padStart(5)}  ${String(r.totalValue).padStart(5)}   ${cropStr}`,
    );
  });
  lines.push("");
  lines.push(`  winner: ${rows[0]?.name ?? "—"} (${rows[0]?.totalValue ?? 0}g total value)`);
  panel.textContent = lines.join("\n");
  panel.style.display = "block";
}

function countEntities(world: ReturnType<typeof bootstrapSim>["world"]): number {
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

async function loadPathfinder(): Promise<Pathfinder | null> {
  try {
    const pf = await createPathfinderFromUrl("/wasm/pathfinding.wasm");
    console.info("[wasm] pathfinding module loaded");
    return pf;
  } catch (err) {
    console.warn("[wasm] pathfinding module unavailable — run `npm run build-wasm`:", err);
    return null;
  }
}

function showFatal(el: HTMLElement, err: unknown): void {
  el.classList.add("visible");
  const msg = err instanceof Error ? err.message : String(err);
  el.textContent = `Failed to boot: ${msg}`;
}

void boot();
