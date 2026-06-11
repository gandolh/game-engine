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
import { parseRun } from "@farm/sim-core/run-descriptor";

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
import { AmbientLayer } from "./main/ambient";
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
  const atlasMap = await loadAllAtlasSheets("/atlas/index.json", import.meta.env.BASE_URL);
  const camera = new Camera2D(CAMERA_CONFIG);
  setCamera(camera);
  const renderer = new Canvas2dRenderer(canvas, camera);
  for (const atlas of atlasMap.values()) {
    renderer.addAtlas(atlas);
  }
  // Ocean backdrop beyond the world edge (deep water, not black).
  renderer.clearColor = EDG.blue;
  setupCameraListeners(canvas, camera);
  const keyboard = new Keyboard();
  keyboard.attach(window);
  // Prevent Space/arrow scroll — these drive Pip; WASD already don't scroll.
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

  // Shared run URL: pre-fill seed from hash; don't auto-start.
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

    // Brief 72 — when the server assigns owner=false (spectator), hide playback
    // controls so the spectator cannot issue control commands to the shared run.
    client.onAttach((isOwner) => {
      playback.setVisible(isOwner);
    });

    observer.setOnFarmerClick((id) => {
      setFocusedFarmerId(id);
      setPanOffset({ x: 0, y: 0 });
      if (_camera !== null) applyFocusAndPan(_camera);
    });

    panels.eventFeedPanel.setOnFarmerClick((id) => {
      setFocusedFarmerId(id);
      setPanOffset({ x: 0, y: 0 });
      if (_camera !== null) applyFocusAndPan(_camera);
    });

    const ambient = new AmbientLayer();
    bakeStaticLayer(client, renderer, noiseGen, seed, ambient);

    createSeedBadge(app, seed);

    const tooltip = createTooltip(app);

    const particles = new ParticleSystem();
    const particleDirector = new ParticleDirector(particles, client);

    client.init({
      seed,
      tickRateHz: CONFIG.tickRateHz,
      ticksPerDay,
      maxDays,
    });

    const renderFrame = createRenderLoop({
      client, renderer, keyboard, particles, particleDirector,
      canvas, panels, tooltip, seed, maxDays, ticksPerDay, ambient,
    });

    requestAnimationFrame(renderFrame);
  } catch (err) {
    showFatal(fatal, err);
    throw err;
  }
}

void boot();
