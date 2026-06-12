import { Keyboard, ParticleSystem, Profiler, RainField, expSmooth } from "@engine/core";
import { EDG } from "@engine/core";
import type { WeatherKind, RendererLike } from "@engine/core";
import { pushSnapshotSprites, pushOccluderSprites, pushBuildingSprites, pushBridgeSprites, frameToAtlasId, COASTLINE_BUBBLE_TILES, FORGE_OVEN_TILE, FORGE_CHIMNEY_PX, WEATHER_BEACON_PX, sampleCycle, cycleIndex, walkStepsBetween, ACTION_POSE, FOAM_CLIP, FORGE_FIRE_CLIP, FORGE_SMOKE_CLIP, WATERFALL_FALL_CLIP, CAMPFIRE_CLIP, WEATHER_BEACON_CLIP } from "@farm/sim-core/render-systems";
import type { JuiceLayer } from "./juice";
import { WATERFALL_TILE, CAMPFIRE_TILE, VOLCANO_CRATER_TILE, CASINO_NEON_TILE, isWalkable } from "@farm/sim-core/world/regions";
import { washFor, nightnessFor } from "../render/day-night";
import { seasonForDay } from "@farm/sim-core/protocols/weather";
import { HOTBAR_SIZE } from "@farm/sim-core/systems/player-control";
import { TILE, PROFILE_ENABLED } from "./config";
import {
  focusedFarmerId,
  panOffset,
  recenteringOnPip,
  playerFarmerId,
  lastPlayerMoveX,
  lastPlayerMoveY,
  _camera,
  mousePos,
  setFocusedFarmerId,
  setPanOffset,
  setRecenteringOnPip,
  setLastPlayerMoveX,
  setLastPlayerMoveY,
  applyFocusAndPan,
} from "./camera";
import { screenToTile } from "./screen-to-tile";
import { pushWaterDecor } from "../render/water-decor";
import { pushFishSchools } from "../render/fish-decor";
import { frameDataUrl } from "./sprite-icon";
import type { Panels } from "./panels";
import type { ParticleDirector } from "./particles";
import { renderGameOver } from "./game-over";
import { updateTooltip } from "./tooltip";
import type { SimClient } from "../worker/sim-client";
import type { AmbientLayer } from "./ambient";
import { setupProfileExport } from "./profile-export";

// ── Cloud-shadow type guard (brief 15) ───────────────────────────────────────
// Using a local interface + type guard avoids requiring RendererLike to declare
// setCloudOptions, since RendererLike is resolved through shared node_modules at
// typecheck time and may lag the engine worktree (same pattern as setWaterDepthMask
// in static-layer.ts). The GPU renderer exposes the method; the Canvas2D backend
// does not. Structural typing ensures both match at runtime.
interface CloudOpts {
  color: string;
  coverage: number;
  driftSpeed: number;
  timeSec: number;
}
interface RendererWithCloudOptions {
  setCloudOptions(opts: CloudOpts): void;
}
function supportsCloudOptions(r: RendererLike): r is RendererLike & RendererWithCloudOptions {
  return typeof (r as Partial<RendererWithCloudOptions>).setCloudOptions === "function";
}

// Where Pip's carried tool sits relative to the body, per facing (world px from sprite centre).
// `behind` draws the tool behind the body (facing away). Hand-tuned against the 24×24 frames;
// adjust here after an in-browser look (brief 89, Phase A). `side` mirrors via flipX.
const HELD_TOOL_ANCHOR: Record<"down" | "up" | "side", { dx: number; dy: number; behind: boolean }> = {
  down: { dx: 5, dy: 2, behind: false },
  side: { dx: 5, dy: 2, behind: false },
  up: { dx: 5, dy: 2, behind: true },
};
// Carried tools are hand-sized, not body-sized: draw at a fraction of the tile footprint.
const HELD_TOOL_SCALE = 0.6;
// The hotbar can icon is drawn mid-pour; swap to the upright at-rest sprite when merely carried.
const HELD_TOOL_FRAME: Record<string, string> = { "tool/can": "tool/can-held" };

export interface RenderLoopDeps {
  client: SimClient;
  renderer: RendererLike;
  keyboard: Keyboard;
  particles: ParticleSystem;
  particleDirector: ParticleDirector;
  rain: RainField;
  canvas: HTMLCanvasElement;
  panels: Panels;
  tooltip: HTMLElement;
  seed: number;
  maxDays: number;
  ticksPerDay: number;
  ambient: AmbientLayer;
  juice: JuiceLayer;
  onFirstFrame?: () => void;
}

export function createRenderLoop(deps: RenderLoopDeps): () => void {
  const {
    client, renderer, keyboard, particles, particleDirector, rain,
    canvas, panels, tooltip, seed, maxDays, ticksPerDay, ambient, juice,
  } = deps;

  let firstFrameSignaled = false;
  const {
    overlay, worldClock, observer, leaderboardPanel,
    slateBillboard, eventFeedPanel, hotbar, inventory, gameOverPanel, relationshipMatrix,
    wealthGraph,
  } = panels;

  // Inventory drag-drop: a swap is a layout change owned by the sim. Only the run owner
  // may mutate Pip's grid (spectators can open the panel to look, not rearrange).
  inventory.onSwap = (from, to) => {
    if (client.owner) client.swapSlots(from, to);
  };

  let lastFrameMs = performance.now();
  let gameOverShown = false;

  // Rain impact: a raindrop landed at world (wx, wy). Water tiles get a low, spreading ripple;
  // land gets a small dust/droplet pop. isWalkable(tx,ty) is false over ocean. Render-only.
  const spawnRainSplash = (wx: number, wy: number): void => {
    const tx = Math.floor(wx / TILE);
    const ty = Math.floor(wy / TILE);
    if (!isWalkable(tx, ty)) {
      // Water ripple — spreads sideways, near-flat arc, fades fast.
      particles.emit({
        x: wx, y: wy, count: 4, shape: "circle",
        color: EDG.skyBlue, color2: EDG.white,
        speedMin: 10, speedMax: 26,
        angleMin: 0, angleMax: Math.PI, // hemisphere spread, hugging the surface
        lifetimeMin: 0.25, lifetimeMax: 0.5,
        sizeMin: 0.5, sizeMax: 1.1,
        gravity: 24,
      });
    } else {
      // Land splash — small droplets pop up and fall back (positive gravity arc).
      particles.emit({
        x: wx, y: wy, count: 3, shape: "rect",
        color: EDG.silver, color2: EDG.skyBlue,
        speedMin: 14, speedMax: 30,
        angleMin: -Math.PI * 0.75, angleMax: -Math.PI * 0.25, // upward fan
        lifetimeMin: 0.2, lifetimeMax: 0.4,
        sizeMin: 0.3, sizeMax: 0.7,
        gravity: 130,
      });
    }
  };

  // UNCAPPED render loop, DECOUPLED from the display refresh (vsync): re-scheduled via setTimeout(…, 0)
  // so it runs as fast as the loop allows rather than at the monitor's Hz (requestAnimationFrame would
  // hard-cap at the refresh). Practical ceiling is the browser's nested-setTimeout clamp (~4ms ⇒ a few
  // hundred fps) plus per-frame work. NOTE: the browser still composites the canvas at vsync, so frames
  // beyond the refresh are computed but never shown — the fps/ms overlay counts them and input latency
  // drops slightly, but motion isn't visibly smoother on a 60Hz panel, and it pegs CPU/GPU. (First
  // frame is kicked off via rAF in main.ts.)

  const frameProfiler = new Profiler({ enabled: PROFILE_ENABLED });
  if (PROFILE_ENABLED) {
    client.setProfiling(true);
    client.onProfile((_tick, report) => overlay.setWorkerReport(report));
    // Tier-0 FPS-regression diagnostic (2026-06-11): expose the frame report so a
    // Playwright `?profile` pass can read structured per-section timings without
    // OCR'ing the overlay. Wall-clock only; dev-only; remove once attributed.
    (window as unknown as { __frameProfile?: () => unknown }).__frameProfile = () =>
      frameProfiler.report();
    // One-click profile export (brief 84): a bottom-left button + window.__exportProfile()
    // that downloads fps/frame timings + render context + a GPU-identity probe as JSON.
    setupProfileExport({
      parent: document.body,
      overlay,
      camera: renderer.camera,
      canvas,
      frameReport: () => frameProfiler.report(),
      context: { seed, maxDays, ticksPerDay },
    });
  }
  // Emit frame report every ~60 frames to avoid per-frame string churn.
  let frameReportCounter = 0;

  // ---------------------------------------------------------------------------
  // Click-to-act: right-button press/release cycle sends action + tile to server.
  // Only fires for the run owner; spectators cannot control Pip.
  // A press/release is treated as a click only when the pointer moved < 5px —
  // this also guards against accidental taps after the camera gained focus.
  // (Left button is reserved for camera panning — see camera.ts.)
  // ---------------------------------------------------------------------------
  let clickStartX = 0;
  let clickStartY = 0;

  canvas.addEventListener("mousedown", (e: MouseEvent) => {
    if (e.button !== 2) return;
    clickStartX = e.clientX;
    clickStartY = e.clientY;
  });

  canvas.addEventListener("mouseup", (e: MouseEvent) => {
    if (e.button !== 2) return;
    if (!client.owner) return;

    const dist = Math.hypot(e.clientX - clickStartX, e.clientY - clickStartY);
    if (dist >= 5) return; // dragged — not a click

    const cam = _camera;
    if (cam === null) return;

    const rect = canvas.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    const tile = screenToTile(cam, canvas, cx, cy);

    // Pass held movement axes so we don't zero out in-progress movement.
    client.sendInput(lastPlayerMoveX, lastPlayerMoveY, true, null, tile);
  });

  // ---------------------------------------------------------------------------
  // Per-tool cursor: the OS pointer becomes the selected tool/seed sprite, so the
  // mouse reads as "what you're about to use". Hotspot is centered on the icon (the
  // tile under the pointer is the one click-to-act targets). Falls back to a native
  // crosshair if the sprite can't be rasterized. Recomputed only when the selection
  // changes (cheap key compare); driven from the render loop so keyboard slot swaps
  // update the cursor even without mouse movement.
  // ---------------------------------------------------------------------------
  let lastCursorKey = "";

  function applyToolCursor(): void {
    const snap = client.playerHotbar;
    const slot = snap ? snap.slots[snap.selected] : undefined;
    const frame = slot?.frame;
    const key = frame ?? "default";
    if (key === lastCursorKey) return;
    lastCursorKey = key;
    if (!frame) {
      canvas.style.cursor = "default";
      return;
    }
    const url = frameDataUrl(renderer, frame, 2); // 16px frame → 32px cursor
    canvas.style.cursor = url ? `url(${url}) 16 16, crosshair` : "crosshair";
  }

  function renderFrame(): void {
    const frameStart = performance.now();
    const nowMs = frameStart;
    const dt = Math.min((nowMs - lastFrameMs) / 1000, 0.1); // cap at 100ms
    lastFrameMs = nowMs;

    const interpolatedSprites = frameProfiler.time("interp", () =>
      client.getInterpolatedSprites(),
    );

    // Signal the first frame that contains real world content (sprites present).
    if (!firstFrameSignaled && interpolatedSprites.length > 0) {
      firstFrameSignaled = true;
      deps.onFirstFrame?.();
    }

    // Exponential ease panOffset→0 while recentering (avoids snap jump).
    if (recenteringOnPip) {
      setPanOffset({
        x: expSmooth(panOffset.x, 0, 12, dt),
        y: expSmooth(panOffset.y, 0, 12, dt),
      });
      if (Math.abs(panOffset.x) < 0.5 && Math.abs(panOffset.y) < 0.5) {
        setPanOffset({ x: 0, y: 0 });
        setRecenteringOnPip(false);
      }
    }

    const sx = _camera !== null ? canvas.width / _camera.worldUnitsX : 1;
    if (_camera !== null) {
      applyFocusAndPan(_camera, interpolatedSprites, dt, sx);
    }

    // Brief 86 — juice: update popups, shake, hitstop. Must happen AFTER applyFocusAndPan
    // (so shake is post-smoothing) and AFTER interpolatedSprites (so farmerPositions is fresh).
    // Build farmerPositions here (moved up from later in the frame) so juice.update() can
    // anchor popups to farmer sprites without a second pass.
    const farmerPositions = new Map<number, { x: number; y: number }>();
    for (const s of interpolatedSprites) {
      if (s.id !== null && s.interpolate) {
        farmerPositions.set(s.id, { x: s.x, y: s.y });
      }
    }

    if (_camera !== null) {
      juice.update(client.events, farmerPositions, _camera, canvas, dt);
      const hitstopN = juice.consumeHitstopFrames();
      if (hitstopN > 0) client.freezeInterp(hitstopN);
      // Apply shake as a POST-smoothing offset (never fed back into the smooth state).
      // The next frame's applyFocusAndPan will re-derive the smoothed center from scratch.
      const shk = juice.shake;
      if (shk.x !== 0 || shk.y !== 0) {
        _camera.setCenter(_camera.centerX + shk.x, _camera.centerY + shk.y);
      }
    }

    renderer.beginFrame();

    // Water scroll: sin/cos drift for a non-linear current; render-only.
    const t = nowMs / 1000;
    const WATER_DRIFT = TILE * 0.6; // peak scroll amplitude, world px
    renderer.setWaterScroll(
      Math.sin(t * 0.25) * WATER_DRIFT,
      Math.cos(t * 0.17) * WATER_DRIFT,
    );

    // Swell: slow brightness pulse (~7.5s period, alpha 0.06–0.10); render-only.
    const SWELL_PERIOD_S = 7.5;
    const swellPhase = (t * (2 * Math.PI)) / SWELL_PERIOD_S; // [0, 2π) cycling
    const SWELL_ALPHA_MID = 0.08;
    const SWELL_ALPHA_AMP = 0.02; // total range 0.06–0.10
    const swellAlpha = SWELL_ALPHA_MID + SWELL_ALPHA_AMP * Math.sin(swellPhase);
    const SWELL_DRIFT = TILE * 0.4; // offset amplitude, world px — less than base
    renderer.setWaterSwell(
      swellAlpha,
      Math.cos(t * 0.19) * SWELL_DRIFT, // cos/sin at different rates → orthogonal feel
      Math.sin(t * 0.13) * SWELL_DRIFT,
    );

    // Coastline foam: culled to visible rect, zoom-thinned at far zoom.
    // Foam alpha is swell-synced (base 0.45 ± 0.25) with per-tile phase offset.
    const zoom = _camera!.zoom;
    const bubbleStride = zoom >= 1 ? 1 : zoom >= 0.75 ? 2 : zoom >= 0.6 ? 3 : 4;
    const viewLeft = _camera!.centerX - _camera!.worldUnitsX / 2 - TILE;
    const viewRight = _camera!.centerX + _camera!.worldUnitsX / 2 + TILE;
    const viewTop = _camera!.centerY - _camera!.worldUnitsY / 2 - TILE;
    const viewBottom = _camera!.centerY + _camera!.worldUnitsY / 2 + TILE;
    for (let i = 0; i < COASTLINE_BUBBLE_TILES.length; i++) {
      if (i % bubbleStride !== 0) continue; // thin out at low zoom
      const { tx, ty } = COASTLINE_BUBBLE_TILES[i]!;
      const cx = tx * TILE + TILE / 2;
      const cy = ty * TILE + TILE / 2;
      if (cx < viewLeft || cx > viewRight || cy < viewTop || cy > viewBottom) continue;
      const phase = tx * 3 + ty * 5; // per-tile offset
      const frame = sampleCycle(FOAM_CLIP, nowMs, phase);
      // Divide by 8 so tilePhase stays within ~2π over the tile grid.
      const tilePhase = phase * 0.125;
      const foamAlpha = 0.45 + 0.25 * Math.sin(swellPhase + tilePhase);
      renderer.push({
        x: cx,
        y: cy,
        width: TILE,
        height: TILE,
        frame,
        atlasId: "terrain",
        rotation: 0,
        layer: 1,
        alpha: foamAlpha,
      });
    }

    // Animated forge fire: layer 41 (above oven body 40, below NPC 50). ~0.4s cycle.
    const fireFrame = sampleCycle(FORGE_FIRE_CLIP, nowMs);
    renderer.push({
      x: FORGE_OVEN_TILE.x * TILE + TILE / 2,
      y: FORGE_OVEN_TILE.y * TILE + TILE / 2,
      width: TILE,
      height: TILE,
      frame: fireFrame,
      atlasId: "buildings",
      rotation: 0,
      layer: 41,
      alpha: 1,
    });

    // Chimney smoke: layer 6 (above forge-house base 5), alpha 0.55, bobs up ~2px.
    const smokeIdx = cycleIndex(FORGE_SMOKE_CLIP, nowMs);
    const smokeFrame = sampleCycle(FORGE_SMOKE_CLIP, nowMs);
    renderer.push({
      x: FORGE_CHIMNEY_PX.x,
      y: FORGE_CHIMNEY_PX.y - smokeIdx * 2,
      width: TILE,
      height: TILE,
      frame: smokeFrame,
      atlasId: "buildings",
      rotation: 0,
      layer: 6,
      alpha: 0.55,
    });

    // Waterfall: a tall cascade down a rock cleft — clean rock-sided stream tiles stacked above the
    // foam pool (the static structure/waterfall entity at WATERFALL_TILE.y+2). Animated; render-only.
    const WATERFALL_FALL_ROWS = 2;
    for (let r = 0; r < WATERFALL_FALL_ROWS; r++) {
      // Lower tiles step the frame back so the bright streak stays continuous across the 16px tile
      // seam (16 rows % 3-row streak spacing = 1 → compensate by −1 frame per tile down).
      const frame = sampleCycle(WATERFALL_FALL_CLIP, nowMs, (3 - (r % 3)) % 3);
      renderer.push({
        x: WATERFALL_TILE.x * TILE + TILE / 2,
        y: (WATERFALL_TILE.y + r) * TILE + TILE / 2,
        width: TILE,
        height: TILE,
        frame,
        atlasId: frameToAtlasId(frame),
        rotation: 0,
        layer: 41,
        alpha: 1,
      });
    }

    // Waterfall mist/spray at the foot of the falling water (the pool, two rows below the source) —
    // fine droplets that arc back down plus a faint rising mist. Render-only (Math.random, display-
    // only); gated to on-screen + throttled so the particle pool stays small.
    {
      const wfX = WATERFALL_TILE.x * TILE + TILE / 2;
      const wfFootY = (WATERFALL_TILE.y + WATERFALL_FALL_ROWS + 1) * TILE;
      const wfInView =
        wfX >= viewLeft && wfX <= viewRight && wfFootY >= viewTop && wfFootY <= viewBottom;
      if (wfInView) {
        if (Math.random() < 0.5) {
          particles.emit({
            x: wfX + (Math.random() - 0.5) * TILE * 0.8,
            y: wfFootY,
            count: 1, shape: "circle",
            color: EDG.white, color2: EDG.skyBlue,
            speedMin: 10, speedMax: 26,
            angleMin: -Math.PI * 0.85, angleMax: -Math.PI * 0.15, // upward spray fan
            lifetimeMin: 0.3, lifetimeMax: 0.6,
            sizeMin: 0.5, sizeMax: 1.1,
            gravity: 90, // arcs back down
          });
        }
        if (Math.random() < 0.25) {
          particles.emit({
            x: wfX + (Math.random() - 0.5) * TILE,
            y: wfFootY - TILE * 0.3,
            count: 1, shape: "circle",
            color: EDG.white, color2: EDG.silver,
            speedMin: 4, speedMax: 10,
            angleMin: -Math.PI * 0.6, angleMax: -Math.PI * 0.4,
            lifetimeMin: 0.8, lifetimeMax: 1.4,
            sizeMin: 1, sizeMax: 2,
            gravity: -6, // gentle rise, then fades
          });
        }
      }
    }

    // Animated campfire: layer 41, ~390ms cycle; render-only.
    const campfireFrame = sampleCycle(CAMPFIRE_CLIP, nowMs);
    renderer.push({
      x: CAMPFIRE_TILE.x * TILE + TILE / 2,
      y: CAMPFIRE_TILE.y * TILE + TILE / 2,
      width: TILE,
      height: TILE,
      frame: campfireFrame,
      atlasId: "buildings",
      rotation: 0,
      layer: 41,
      alpha: 1,
    });

    // Beacon blink: layer 42, ~1 Hz on/off; wall-clock only, never seeded, never touches worker.
    const beaconFrame = sampleCycle(WEATHER_BEACON_CLIP, nowMs);
    renderer.push({
      x: WEATHER_BEACON_PX.x,
      y: WEATHER_BEACON_PX.y,
      width: TILE,
      height: TILE,
      frame: beaconFrame,
      atlasId: "buildings",
      rotation: 0,
      layer: 42,
      alpha: 1,
    });

    // Volcano: a dark smoke plume drifting up from the crater. Render-only (Math.random + wall-clock,
    // like the waterfall mist); gated to on-screen + throttled so the particle pool stays small.
    {
      const vX = VOLCANO_CRATER_TILE.x * TILE + TILE / 2;
      const vY = VOLCANO_CRATER_TILE.y * TILE + TILE / 2;
      const inView = vX >= viewLeft - TILE && vX <= viewRight + TILE && vY >= viewTop - TILE * 4 && vY <= viewBottom + TILE;
      if (inView && Math.random() < 0.6) {
        particles.emit({
          x: vX + (Math.random() - 0.5) * TILE * 0.7,
          y: vY,
          count: 1, shape: "circle",
          color: EDG.steel, color2: EDG.slate, // grey volcanic smoke
          speedMin: 6, speedMax: 16,
          angleMin: -Math.PI * 0.62, angleMax: -Math.PI * 0.38, // rise, slight drift
          lifetimeMin: 1.6, lifetimeMax: 2.8,
          sizeMin: 1.2, sizeMax: 2.6,
          gravity: -10, // billows upward, then fades
        });
      }
    }

    // Casino: neon glints sparkling off the tower crown. Render-only; gated to on-screen + throttled.
    {
      const cX = CASINO_NEON_TILE.x * TILE + TILE / 2;
      const cY = CASINO_NEON_TILE.y * TILE + TILE / 2;
      const inView = cX >= viewLeft - TILE && cX <= viewRight + TILE && cY >= viewTop - TILE && cY <= viewBottom + TILE;
      if (inView && Math.random() < 0.5) {
        const neon = [EDG.cyan, EDG.hotPink, EDG.gold, EDG.mauve];
        const color = neon[(Math.random() * neon.length) | 0]!;
        particles.emit({
          x: cX + (Math.random() - 0.5) * TILE * 2.5,
          y: cY + (Math.random() - 0.5) * TILE * 1.5,
          count: 1, shape: "star",
          color, color2: EDG.white,
          speedMin: 2, speedMax: 8,
          angleMin: 0, angleMax: Math.PI * 2, // twinkle outward in any direction
          lifetimeMin: 0.3, lifetimeMax: 0.7,
          sizeMin: 0.6, sizeMax: 1.4,
          gravity: 0,
        });
      }
    }

    particleDirector.emitFromDiff(farmerPositions);

    if (Math.random() < 0.15) {
      const snap = client.latestSnapshot();
      if (snap) {
        for (const s of snap.sprites) {
          if (s.id === null && s.frame.includes("/mature") && Math.random() < 0.05) {
            particles.emit({
              x: s.x + (Math.random() - 0.5) * 8,
              y: s.y - 4,
              count: 1,
              shape: "circle",
              color: EDG.green, color2: EDG.green,
              speedMin: 3, speedMax: 8,
              angleMin: -Math.PI * 0.8, angleMax: -Math.PI * 0.2,
              lifetimeMin: 0.8, lifetimeMax: 1.4,
              sizeMin: 1, sizeMax: 2,
              gravity: -5,
            });
          }
        }
      }
    }

    // Weather: persistent pseudo-3D rain/snow field (render-only). Drops carry a height and fall to
    // the ground; rain lands with a splash (ripple on water, dust on land). World-space + camera-
    // tracked density means walking no longer "resets" the curtain (was: per-frame top-edge sprinkle).
    frameProfiler.time("weather", () => {
      const w = client.latestSnapshot()?.weather;
      const isWinter = w?.season === "winter";
      const isWet = w?.condition === "rainy" || w?.condition === "storm";
      const isStorm = w?.condition === "storm";
      let kind: WeatherKind = "none";
      let intensity = 0;
      let color: string = EDG.skyBlue;
      if (isWet && isWinter) {
        kind = "snow"; intensity = isStorm ? 1.0 : 0.6; color = EDG.white;
      } else if (isWet) {
        kind = "rain"; intensity = isStorm ? 1.3 : 0.8; color = EDG.skyBlue;
      }
      rain.setConfig({ kind, intensity, color, alpha: kind === "snow" ? 0.85 : 0.5 });
      rain.update(dt, { left: viewLeft, right: viewRight, top: viewTop, bottom: viewBottom }, spawnRainSplash);
    });

    frameProfiler.time("particles.update", () => particles.update(dt));

    frameProfiler.time("pushSprites", () => {
      pushSnapshotSprites(
        renderer,
        interpolatedSprites,
        client.meets,
        farmerPositions,
        nowMs,
        seasonForDay(client.day), // season computed below; keep separate call for ordering
        playerFarmerId, // x-ray the player when occluded by walls/buildings
      );

      // Occluder sprites: south-facing wall/cliff faces; sortY at face base so
      // a character behind the edge has feet occluded, not painted over the parapet.
      pushOccluderSprites(renderer);
      // Buildings: dynamic layer-50 occluders (sortY at base) so farmers behind them are occluded
      // and the player x-rays through, instead of being painted over the roof (old static layer 5).
      pushBuildingSprites(renderer);
      // Bridges: dynamic at layer 3 with a slow rope-deck sway (no longer baked).
      pushBridgeSprites(renderer, nowMs);
      // "Sea level" depth ordering is encoded in the sprite layer band (sprites sort by
      // (layer, y) over the animated water pass, which is the backdrop):
      //   below the surface — whale (1), baked coral (2), reef fish (4);
      //   at the surface     — bridges (3), foam + paddling ducks (6);
      //   above the surface  — boats / characters / buildings (50+), flying birds (60+).
      // Submerged things look "under" the water via translucency + a cool blue tint
      // (the water shows through them) rather than a dedicated water-surface overpass.
      // Decorative water life: a duck trio flies in/lands/leaves; a whale glides L→R splashing.
      pushWaterDecor(renderer, particles, nowMs, dt, { left: viewLeft, right: viewRight, top: viewTop, bottom: viewBottom });
      // Reef fish: shoals of colourful fish orbit the coral reefs, tinted + translucent (submerged).
      pushFishSchools(renderer, nowMs, dt, { left: viewLeft, right: viewRight, top: viewTop, bottom: viewBottom });

      // Footstep dust: a pale puff on each walk-cycle foot-plant for moving farmers/Pip on land.
      // walkStepsBetween counts contact events in this frame's window (per-entity walk phase).
      const stepPrevMs = nowMs - dt * 1000;
      for (const s of interpolatedSprites) {
        if (s.id === null || s.moving !== true || !s.frame.startsWith("farmer/")) continue;
        if (s.x < viewLeft || s.x > viewRight || s.y < viewTop || s.y > viewBottom) continue;
        if (walkStepsBetween(s.id, stepPrevMs, nowMs) === 0) continue;
        if (!isWalkable(Math.floor(s.x / TILE), Math.floor((s.y + TILE * 0.3) / TILE))) continue;
        particles.emit({
          x: s.x + (Math.random() - 0.5) * TILE * 0.3,
          y: s.y + TILE * 0.42, // at the feet
          count: 2, shape: "circle",
          color: EDG.silver, color2: EDG.white,
          speedMin: 3, speedMax: 10,
          angleMin: -Math.PI * 0.75, angleMax: -Math.PI * 0.25, // low upward fan
          lifetimeMin: 0.22, lifetimeMax: 0.4,
          sizeMin: 0.5, sizeMax: 1.1,
          gravity: 26, // settles back down
        });
      }

      // Carried hotbar tool (brief 89, Phase A): Pip visibly holds the selected tool while idle/
      // walking. Hybrid — during a tool ACTION the pose's baked tool shows instead (skip overlay).
      // Pixel-safe: a per-facing held sprite + flipX, no rotation; rides the body at a hand offset.
      // AI farmers carry nothing between actions (no hotbar). Tune offsets in HELD_TOOL_ANCHOR.
      const hb = client.playerHotbar;
      const heldSlot = hb ? hb.slots[hb.selected] : undefined;
      const heldFrame = heldSlot?.frame;
      if (playerFarmerId !== null && heldFrame && heldFrame.startsWith("tool/")) {
        for (const s of interpolatedSprites) {
          if (s.id !== playerFarmerId) continue;
          if (s.action !== null && s.action in ACTION_POSE) break; // baked tool pose is showing
          const facing = s.facing ?? "down";
          const a = HELD_TOOL_ANCHOR[facing];
          const flip = facing === "side" ? (s.flipX ?? false) : false;
          const toolFrame = HELD_TOOL_FRAME[heldFrame] ?? heldFrame;
          const size = TILE * HELD_TOOL_SCALE; // hand-sized, not body-sized
          renderer.push({
            x: s.x + (flip ? -a.dx : a.dx),
            y: s.y + a.dy,
            width: size,
            height: size,
            frame: toolFrame,
            atlasId: frameToAtlasId(toolFrame),
            rotation: 0,
            layer: s.layer,
            // Sort just in front of / behind the body (behind when facing away).
            sortY: s.y + (a.behind ? -0.1 : 0.1),
            alpha: 1,
            flipX: flip,
          });
          break;
        }
      }
    });

    // Follow arrow: layer 91 (above meet bubble 90), gentle sine bob.
    if (focusedFarmerId !== null) {
      const followed = farmerPositions.get(focusedFarmerId);
      if (followed) {
        const bob = Math.sin(nowMs / 300) * 1.5;
        renderer.push({
          x: followed.x,
          y: followed.y - TILE - 2 + bob,
          width: TILE,
          height: TILE,
          frame: "indicator/follow",
          atlasId: "items-ui",
          rotation: 0,
          layer: 91,
          alpha: 1,
        });
      }
    }

    // Player input: report held direction; worker paces the step cadence.
    // Brief 72 — only forward input when this client is the run owner; spectators
    // can still read the keyboard for camera controls (Space recentre) but must
    // not send Pip movement/action to the shared run.
    {
      let moveX: "left" | "right" | null = null;
      let moveY: "up" | "down" | null = null;
      if (keyboard.isDown("KeyW") || keyboard.isDown("ArrowUp"))         moveY = "up";
      if (keyboard.isDown("KeyS") || keyboard.isDown("ArrowDown"))       moveY = "down";
      if (keyboard.isDown("KeyA") || keyboard.isDown("ArrowLeft"))       moveX = "left";
      if (keyboard.isDown("KeyD") || keyboard.isDown("ArrowRight"))      moveX = "right";
      if (keyboard.justPressed("Space") && playerFarmerId !== null) {
        setFocusedFarmerId(playerFarmerId);
        setRecenteringOnPip(true);
      }
      // E toggles the inventory panel; Esc closes it. Pure client-side UI (no sim message),
      // so spectators can open it to look even though only the owner can rearrange.
      if (keyboard.justPressed("KeyE")) inventory.toggle();
      if (keyboard.justPressed("Escape") && inventory.isOpen()) inventory.setOpen(false);
      // Tab shows/hides the standings panel (hidden by default).
      if (keyboard.justPressed("Tab")) leaderboardPanel.toggle();
      if (client.owner) {
        // Actions fire on right-click (see the click-to-act handler above), not a key.
        let selectSlot: number | null = null;
        for (let n = 1; n <= HOTBAR_SIZE && n <= 9; n++) {
          if (keyboard.justPressed(`Digit${n}`)) {
            selectSlot = n - 1;
            break;
          }
        }
        // Resend only when held axis changes; avoids flooding the worker every frame.
        const moveChanged = moveX !== lastPlayerMoveX || moveY !== lastPlayerMoveY;
        if (moveChanged && (moveX !== null || moveY !== null) && playerFarmerId !== null) {
          setFocusedFarmerId(playerFarmerId);
          setRecenteringOnPip(true);
        }
        if (
          moveChanged ||
          selectSlot !== null
        ) {
          client.sendInput(moveX, moveY, false, selectSlot);
          setLastPlayerMoveX(moveX);
          setLastPlayerMoveY(moveY);
        }
      }
    }
    keyboard.endFrame();

    updateTooltip(tooltip, canvas, interpolatedSprites, _camera);

    const season = seasonForDay(client.day);
    const wash = washFor({
      tick: client.tick,
      ticksPerDay,
      season,
    });
    const nightness = nightnessFor({
      tick: client.tick,
      ticksPerDay,
      season,
    });
    const dtMs = dt * 1000;
    const view = { left: viewLeft, right: viewRight, top: viewTop, bottom: viewBottom };
    frameProfiler.time("ambient", () => {
      ambient.update(dtMs, nowMs, view, nightness, season);
      ambient.pushSprites(renderer);
    });
    // Cloud-shadow coverage: render-side only — reads the already-snapshotted weather.
    // sunny   → coverage 0.06, drift 3 px/s  (sparse slow wisps)
    // normal  → coverage 0.22, drift 6 px/s  (scattered clouds)
    // rainy   → coverage 0.52, drift 9 px/s  (overcast, active drift)
    // storm   → coverage 0.72, drift 14 px/s (heavy cover, fast-moving)
    // Guarded by supportsCloudOptions: no-op on Canvas2D backend.
    if (supportsCloudOptions(renderer)) {
      const wSnap = client.latestSnapshot()?.weather;
      const condition = wSnap?.condition ?? "normal";
      let cloudCoverage: number;
      let cloudDrift: number;
      if (condition === "sunny") {
        cloudCoverage = 0.06;
        cloudDrift = 3;
      } else if (condition === "rainy") {
        cloudCoverage = 0.52;
        cloudDrift = 9;
      } else if (condition === "storm") {
        cloudCoverage = 0.72;
        cloudDrift = 14;
      } else {
        // "normal"
        cloudCoverage = 0.22;
        cloudDrift = 6;
      }
      renderer.setCloudOptions({
        color: EDG.ink,
        coverage: cloudCoverage,
        driftSpeed: cloudDrift,
        timeSec: nowMs / 1000,
      });
    }
    frameProfiler.time("render.endFrame", () => renderer.endFrame(wash, particles, rain));

    const snap = client.latestSnapshot();
    const tick = client.tick;
    overlay.update({ tick, alpha: 0, entityCount: client.entityCount });

    worldClock.update({ tick: client.tick, ticksPerDay, day: client.day });

    const obs = client.observer;
    if (obs !== null) observer.update(obs);

    frameProfiler.time("panels", () => {
      leaderboardPanel.update(client.leaderboard);
      slateBillboard.update(client.slate, (frame) => frameDataUrl(renderer, frame, 2));
      eventFeedPanel.update(client.events);
      hotbar.update(client.playerHotbar, (frame) => frameDataUrl(renderer, frame, 2));
      inventory.update(client.playerInventory, (frame) => frameDataUrl(renderer, frame, 2));
      applyToolCursor();
      frameProfiler.time("panels.relmatrix", () => relationshipMatrix.update(client.relationships));
      wealthGraph.update(client.wealthSeries, client.day);
    });

    if (client.gameOver && !gameOverShown) {
      gameOverShown = true;
      const final = client.finalSummary;
      if (final !== null) {
        renderGameOver(gameOverPanel, final, snap?.day ?? 0, {
          seed,
          maxDays,
          ticksPerDay,
        }, client.recap);
      }
    }

    if (PROFILE_ENABLED) {
      frameProfiler.add("frame", performance.now() - frameStart);
      frameReportCounter += 1;
      if (frameReportCounter >= 60) {
        frameReportCounter = 0;
        overlay.setFrameReport(frameProfiler.report());
      }
    }

    // Uncapped: schedule the next frame ASAP (no fps target). Browsers clamp nested setTimeout to ~4ms.
    setTimeout(renderFrame, 0);
  }

  return renderFrame;
}
