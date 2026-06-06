import {
  loadAllAtlasSheets,
  Camera2D,
  Canvas2dRenderer,
  EDG,
  Keyboard,
  ParticleSystem,
  createNoiseGeneratorFromUrl,
} from "@engine/core";
import type { NoiseGenerator } from "@engine/core";
import { HomeScreen } from "./screens";
import { SimClient } from "./worker/sim-client";
import { parseRun } from "./run-descriptor";

import { CONFIG, CAMERA_CONFIG } from "./main/config";
import {
  setupCameraListeners,
  setSimClient,
  setCamera,
  setFocusedFarmerId,
  setPanOffset,
  applyFocusAndPan,
  _camera,
} from "./main/camera";
import { buildPanels } from "./main/panels";
import { wirePlayback, registerHotkeys } from "./main/playback";
import { bakeStaticLayer } from "./main/static-layer";
import { createSeedBadge } from "./main/game-over";
import { createTooltip } from "./main/tooltip";
import { ParticleDirector } from "./main/particles";
import { createRenderLoop } from "./main/render-loop";
import { showFatal } from "./main/fatal";

interface Runtime {
  renderer: Canvas2dRenderer;
  noiseGen: NoiseGenerator | null;
  keyboard: Keyboard;
}

async function loadNoiseGenerator(): Promise<NoiseGenerator | null> {
  try {
    const gen = await createNoiseGeneratorFromUrl(`${import.meta.env.BASE_URL}wasm/noise.wasm`);
    console.info("[wasm] noise module loaded");
    return gen;
  } catch (err) {
    console.warn("[wasm] noise module unavailable:", err);
    return null;
  }
}

async function setupRuntime(canvas: HTMLCanvasElement): Promise<Runtime> {
  // Load all atlas sheets from the builder-emitted index; no hardcoded sheet list.
  const atlasMap = await loadAllAtlasSheets("/atlas/index.json", import.meta.env.BASE_URL);
  const camera = new Camera2D(CAMERA_CONFIG);
  setCamera(camera);
  const renderer = new Canvas2dRenderer(canvas, camera);
  for (const atlas of atlasMap.values()) {
    renderer.addAtlas(atlas);
  }
  // Ocean backdrop beyond the world edge — the map is islands in an ocean, so
  // the area outside the 40×40 grid is deep water, not black.
  renderer.clearColor = EDG.blue;
  setupCameraListeners(canvas, camera);
  const keyboard = new Keyboard();
  keyboard.attach(window);
  // Stop Space / arrow keys from scrolling the page — they drive Pip's movement
  // and context action. WASD already don't scroll; we guard the rest.
  const SCROLL_KEYS = new Set([
    "Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight",
  ]);
  window.addEventListener("keydown", (e: KeyboardEvent) => {
    const target = e.target as HTMLElement | null;
    const tag = target?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable) return;
    if (SCROLL_KEYS.has(e.code)) e.preventDefault();
  });
  const noiseGen = await loadNoiseGenerator();
  return { renderer, noiseGen, keyboard };
}

async function boot(): Promise<void> {
  const canvas = document.getElementById("canvas") as HTMLCanvasElement | null;
  const app = document.getElementById("app") as HTMLElement | null;
  const fatal = document.getElementById("fatal") as HTMLElement | null;
  if (!canvas || !app || !fatal) throw new Error("Missing #canvas/#app/#fatal");

  // brief-17: save/replay — if the URL hash carries a shared run descriptor,
  // use it for this run. Lowest-touch correct option: we do NOT auto-start;
  // instead we pre-fill the home screen's seed with the shared seed (so the
  // run picker still drives the launch) and carry the shared maxDays/ticksPerDay
  // into the run. If no/invalid hash, fall back to CONFIG defaults.
  const shared = parseRun(location.hash);
  const defaultSeed = shared?.seed ?? CONFIG.seed;
  const maxDays = shared?.maxDays ?? CONFIG.maxDays;
  const ticksPerDay = shared?.ticksPerDay ?? CONFIG.ticksPerDay;

  const home = new HomeScreen(app, { defaultSeed });

  const runtimePromise = setupRuntime(canvas);
  runtimePromise.catch(() => {});

  home.onStartClicked((seed) => {
    void startGame(canvas, app, fatal, runtimePromise, { seed, maxDays, ticksPerDay });
  });
}

// ── startGame orchestrator ───────────────────────────────────────────────────

async function startGame(
  canvas: HTMLCanvasElement,
  app: HTMLElement,
  fatal: HTMLElement,
  runtimePromise: Promise<Runtime>,
  run: { seed: number; maxDays: number; ticksPerDay: number },
): Promise<void> {
  const { seed, maxDays, ticksPerDay } = run;
  try {
    const { renderer, noiseGen, keyboard } = await runtimePromise;

    const client = new SimClient();
    setSimClient(client);

    const panels = buildPanels(app);
    const { observer, playback } = panels;

    const playbackHandlers = wirePlayback(playback, client);
    registerHotkeys(playbackHandlers);

    // brief-11: focus-camera — set up observer row click handler
    observer.setOnFarmerClick((id) => {
      setFocusedFarmerId(id);
      setPanOffset({ x: 0, y: 0 });
      if (_camera !== null) applyFocusAndPan(_camera);
    });

    // Brief 40 — feed entry click → focus the involved farmer.
    panels.eventFeedPanel.setOnFarmerClick((id) => {
      setFocusedFarmerId(id);
      setPanOffset({ x: 0, y: 0 });
      if (_camera !== null) applyFocusAndPan(_camera);
    });

    bakeStaticLayer(client, renderer, noiseGen, seed);

    // brief-18: seed badge — show the chosen seed during play (low-touch,
    // own DOM element so we don't touch the engine DebugOverlay signature).
    createSeedBadge(app, seed);

    const tooltip = createTooltip(app);

    const particles = new ParticleSystem();
    const particleDirector = new ParticleDirector(particles, client);

    // Start the sim worker with the run descriptor (seed from the home screen;
    // maxDays/ticksPerDay from a shared run hash or CONFIG defaults).
    client.init({
      seed,
      tickRateHz: CONFIG.tickRateHz,
      ticksPerDay,
      maxDays,
    });

    const renderFrame = createRenderLoop({
      client, renderer, keyboard, particles, particleDirector,
      canvas, panels, tooltip, seed, maxDays, ticksPerDay,
    });

    requestAnimationFrame(renderFrame);
  } catch (err) {
    showFatal(fatal, err);
    throw err;
  }
}

void boot();
