import { Canvas2dRenderer, Keyboard, ParticleSystem, Profiler, RainField, expSmooth } from "@engine/core";
import { EDG } from "@engine/core";
import type { WeatherKind } from "@engine/core";
import { pushSnapshotSprites, pushOccluderSprites, COASTLINE_BUBBLE_TILES, FOAM_FRAMES, FORGE_FIRE_FRAMES, FORGE_OVEN_TILE, FORGE_SMOKE_FRAMES, FORGE_CHIMNEY_PX, WATERFALL_FRAMES, CAMPFIRE_FRAMES, WEATHER_BEACON_FRAMES, WEATHER_BEACON_PX } from "@farm/sim-core/render-systems";
import { WATERFALL_TILE, CAMPFIRE_TILE, isWalkable } from "@farm/sim-core/world/regions";
import { washFor, nightnessFor } from "../render/day-night";
import { seasonForDay } from "@farm/sim-core/protocols/weather";
import { HOTBAR_SLOTS } from "@farm/sim-core/systems/player-control";
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
import { frameDataUrl } from "./sprite-icon";
import type { Panels } from "./panels";
import type { ParticleDirector } from "./particles";
import { renderGameOver } from "./game-over";
import { updateTooltip } from "./tooltip";
import type { SimClient } from "../worker/sim-client";
import type { AmbientLayer } from "./ambient";

export interface RenderLoopDeps {
  client: SimClient;
  renderer: Canvas2dRenderer;
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
  onFirstFrame?: () => void;
}

export function createRenderLoop(deps: RenderLoopDeps): () => void {
  const {
    client, renderer, keyboard, particles, particleDirector, rain,
    canvas, panels, tooltip, seed, maxDays, ticksPerDay, ambient,
  } = deps;

  let firstFrameSignaled = false;
  const {
    overlay, worldClock, observer, leaderboardPanel,
    slateBillboard, eventFeedPanel, hotbar, gameOverPanel, relationshipMatrix,
    wealthGraph,
  } = panels;

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

  // Cap render at 60fps (rAF fires at display rate); epsilon avoids dropping a
  // frame that lands a hair early on a 60Hz vsync boundary.
  const TARGET_FPS = 60;
  const MIN_FRAME_MS = 1000 / TARGET_FPS - 1; // ~15.67ms; epsilon = 1ms
  let lastRenderMs = performance.now() - MIN_FRAME_MS;

  const frameProfiler = new Profiler({ enabled: PROFILE_ENABLED });
  if (PROFILE_ENABLED) {
    client.setProfiling(true);
    client.onProfile((_tick, report) => overlay.setWorkerReport(report));
    // Tier-0 FPS-regression diagnostic (2026-06-11): expose the frame report so a
    // Playwright `?profile` pass can read structured per-section timings without
    // OCR'ing the overlay. Wall-clock only; dev-only; remove once attributed.
    (window as unknown as { __frameProfile?: () => unknown }).__frameProfile = () =>
      frameProfiler.report();
  }
  // Emit frame report every ~60 frames to avoid per-frame string churn.
  let frameReportCounter = 0;

  // ---------------------------------------------------------------------------
  // Click-to-act: left-button press/release cycle sends action + tile to server.
  // Only fires for the run owner; spectators cannot control Pip.
  // A press/release is treated as a click only when the pointer moved < 5px —
  // this also guards against accidental taps after the camera gained focus.
  // ---------------------------------------------------------------------------
  let clickStartX = 0;
  let clickStartY = 0;

  canvas.addEventListener("mousedown", (e: MouseEvent) => {
    if (e.button !== 0) return;
    clickStartX = e.clientX;
    clickStartY = e.clientY;
  });

  canvas.addEventListener("mouseup", (e: MouseEvent) => {
    if (e.button !== 0) return;
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
    const slot = snap ? HOTBAR_SLOTS[snap.selected] : undefined;
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

    // Skip work if rAF fired before the frame interval (high-refresh display).
    // dt is measured from the last rendered frame so interpolation is smooth.
    if (frameStart - lastRenderMs < MIN_FRAME_MS) {
      requestAnimationFrame(renderFrame);
      return;
    }
    lastRenderMs = frameStart;

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
    const FOAM_PERIOD_MS = 1800;
    const foamStep = nowMs / (FOAM_PERIOD_MS / FOAM_FRAMES.length);
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
      const frame = FOAM_FRAMES[(Math.floor(foamStep) + phase) % FOAM_FRAMES.length]!;
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
    const FIRE_PERIOD_MS = 420;
    const fireFrame = FORGE_FIRE_FRAMES[
      Math.floor(nowMs / (FIRE_PERIOD_MS / FORGE_FIRE_FRAMES.length)) % FORGE_FIRE_FRAMES.length
    ]!;
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
    const SMOKE_PERIOD_MS = 700;
    const smokeIdx = Math.floor(nowMs / (SMOKE_PERIOD_MS / FORGE_SMOKE_FRAMES.length)) % FORGE_SMOKE_FRAMES.length;
    const smokeFrame = FORGE_SMOKE_FRAMES[smokeIdx]!;
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

    // Animated waterfall: layer 41, ~540ms cycle; render-only.
    const WATERFALL_PERIOD_MS = 540;
    const waterfallFrame = WATERFALL_FRAMES[
      Math.floor(nowMs / (WATERFALL_PERIOD_MS / WATERFALL_FRAMES.length)) % WATERFALL_FRAMES.length
    ]!;
    renderer.push({
      x: WATERFALL_TILE.x * TILE + TILE / 2,
      y: WATERFALL_TILE.y * TILE + TILE / 2,
      width: TILE,
      height: TILE,
      frame: waterfallFrame,
      atlasId: "buildings",
      rotation: 0,
      layer: 41,
      alpha: 1,
    });

    // Animated campfire: layer 41, ~390ms cycle; render-only.
    const CAMPFIRE_PERIOD_MS = 390;
    const campfireFrame = CAMPFIRE_FRAMES[
      Math.floor(nowMs / (CAMPFIRE_PERIOD_MS / CAMPFIRE_FRAMES.length)) % CAMPFIRE_FRAMES.length
    ]!;
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
    const beaconFrame = WEATHER_BEACON_FRAMES[Math.floor(nowMs / 500) % 2]!;
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

    const farmerPositions = new Map<number, { x: number; y: number }>();
    for (const s of interpolatedSprites) {
      if (s.id !== null && s.interpolate) {
        farmerPositions.set(s.id, { x: s.x, y: s.y });
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
      );

      // Occluder sprites: south-facing wall/cliff faces; sortY at face base so
      // a character behind the edge has feet occluded, not painted over the parapet.
      pushOccluderSprites(renderer);
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
      if (client.owner) {
        // Actions fire on left-click (see the click-to-act handler above), not a key.
        let selectSlot: number | null = null;
        for (let n = 1; n <= HOTBAR_SLOTS.length && n <= 9; n++) {
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
    frameProfiler.time("render.endFrame", () => renderer.endFrame(wash, particles, rain));

    const snap = client.latestSnapshot();
    const tick = client.tick;
    overlay.update({ tick, alpha: 0, entityCount: client.entityCount });

    worldClock.update({ tick: client.tick, ticksPerDay, day: client.day });

    const obs = client.observer;
    if (obs !== null) observer.update(obs);

    frameProfiler.time("panels", () => {
      leaderboardPanel.update(client.leaderboard);
      slateBillboard.update(client.slate);
      eventFeedPanel.update(client.events);
      hotbar.update(client.playerHotbar, (frame) => frameDataUrl(renderer, frame, 2));
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

    requestAnimationFrame(renderFrame);
  }

  return renderFrame;
}
