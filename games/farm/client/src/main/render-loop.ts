import { Keyboard, ParticleSystem, Profiler, RainField, expSmooth } from "@engine/core";
import { EDG } from "@engine/core";
import type { WeatherKind, RendererLike } from "@engine/core";
import { pushSnapshotSprites, pushOccluderSprites, pushBuildingSprites, pushBridgeSprites, frameToAtlasId, FORGE_OVEN_TILE, FORGE_CHIMNEY_PX, WEATHER_BEACON_PX, sampleCycle, cycleIndex, walkStepsBetween, ACTION_POSE, FORGE_FIRE_CLIP, FORGE_SMOKE_CLIP, WATERFALL_FALL_CLIP, CAMPFIRE_CLIP, WEATHER_BEACON_CLIP } from "@farm/sim-core/render-systems";
import type { JuiceLayer } from "./juice";
import { WATERFALL_TILE, CAMPFIRE_TILE, VOLCANO_CRATER_TILE, isWalkable } from "@farm/sim-core/world/regions";
import { washFor, nightnessFor } from "../render/day-night";
import { makeLightOverlay } from "../render/lights";
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

const HELD_TOOL_ANCHOR: Record<"down" | "up" | "side", { dx: number; dy: number; behind: boolean }> = {
  down: { dx: 5, dy: 2, behind: false },
  side: { dx: 5, dy: 2, behind: false },
  up: { dx: 5, dy: 2, behind: true },
};

const HELD_TOOL_SCALE = 0.6;

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

  inventory.onSwap = (from, to) => {
    if (client.owner) client.swapSlots(from, to);
  };

  let lastFrameMs = performance.now();
  let gameOverShown = false;

  const spawnRainSplash = (wx: number, wy: number): void => {
    const tx = Math.floor(wx / TILE);
    const ty = Math.floor(wy / TILE);
    if (!isWalkable(tx, ty)) {

      particles.emit({
        x: wx, y: wy, count: 4, shape: "circle",
        color: EDG.skyBlue, color2: EDG.white,
        speedMin: 10, speedMax: 26,
        angleMin: 0, angleMax: Math.PI, 
        lifetimeMin: 0.25, lifetimeMax: 0.5,
        sizeMin: 0.5, sizeMax: 1.1,
        gravity: 24,
      });
    } else {

      particles.emit({
        x: wx, y: wy, count: 3, shape: "rect",
        color: EDG.silver, color2: EDG.skyBlue,
        speedMin: 14, speedMax: 30,
        angleMin: -Math.PI * 0.75, angleMax: -Math.PI * 0.25, 
        lifetimeMin: 0.2, lifetimeMax: 0.4,
        sizeMin: 0.3, sizeMax: 0.7,
        gravity: 130,
      });
    }
  };

  const frameProfiler = new Profiler({ enabled: PROFILE_ENABLED });
  if (PROFILE_ENABLED) {
    client.setProfiling(true);
    client.onProfile((_tick, report) => overlay.setWorkerReport(report));

    (window as unknown as { __frameProfile?: () => unknown }).__frameProfile = () =>
      frameProfiler.report();

    setupProfileExport({
      parent: document.body,
      overlay,
      camera: renderer.camera,
      canvas,
      frameReport: () => frameProfiler.report(),
      context: { seed, maxDays, ticksPerDay },
    });
  }

  let frameReportCounter = 0;

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
    if (dist >= 5) return; 

    const cam = _camera;
    if (cam === null) return;

    const rect = canvas.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    const tile = screenToTile(cam, canvas, cx, cy);

    client.sendInput(lastPlayerMoveX, lastPlayerMoveY, true, null, tile);
  });

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
    const url = frameDataUrl(renderer, frame, 2); 
    canvas.style.cursor = url ? `url(${url}) 16 16, crosshair` : "crosshair";
  }

  function renderFrame(): void {
    const frameStart = performance.now();
    const nowMs = frameStart;
    const dt = Math.min((nowMs - lastFrameMs) / 1000, 0.1); 
    lastFrameMs = nowMs;

    const interpolatedSprites = frameProfiler.time("interp", () =>
      client.getInterpolatedSprites(),
    );

    if (!firstFrameSignaled && interpolatedSprites.length > 0) {
      firstFrameSignaled = true;
      deps.onFirstFrame?.();
    }

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

      const shk = juice.shake;
      if (shk.x !== 0 || shk.y !== 0) {
        _camera.setCenter(_camera.centerX + shk.x, _camera.centerY + shk.y);
      }
    }

    renderer.beginFrame();

    const t = nowMs / 1000;
    const WATER_DRIFT = TILE * 0.6; 
    renderer.setWaterScroll(
      Math.sin(t * 0.25) * WATER_DRIFT,
      Math.cos(t * 0.17) * WATER_DRIFT,
    );

    const SWELL_PERIOD_S = 7.5;
    const swellPhase = (t * (2 * Math.PI)) / SWELL_PERIOD_S; 
    const SWELL_ALPHA_MID = 0.08;
    const SWELL_ALPHA_AMP = 0.02; 
    const swellAlpha = SWELL_ALPHA_MID + SWELL_ALPHA_AMP * Math.sin(swellPhase);
    const SWELL_DRIFT = TILE * 0.4; 
    renderer.setWaterSwell(
      swellAlpha,
      Math.cos(t * 0.19) * SWELL_DRIFT, 
      Math.sin(t * 0.13) * SWELL_DRIFT,
    );

    const viewLeft = _camera!.centerX - _camera!.worldUnitsX / 2 - TILE;
    const viewRight = _camera!.centerX + _camera!.worldUnitsX / 2 + TILE;
    const viewTop = _camera!.centerY - _camera!.worldUnitsY / 2 - TILE;
    const viewBottom = _camera!.centerY + _camera!.worldUnitsY / 2 + TILE;

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

    const WATERFALL_FALL_ROWS = 2;
    for (let r = 0; r < WATERFALL_FALL_ROWS; r++) {

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
            angleMin: -Math.PI * 0.85, angleMax: -Math.PI * 0.15, 
            lifetimeMin: 0.3, lifetimeMax: 0.6,
            sizeMin: 0.5, sizeMax: 1.1,
            gravity: 90, 
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
            gravity: -6, 
          });
        }
      }
    }

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

    {
      const vX = VOLCANO_CRATER_TILE.x * TILE + TILE / 2;
      const vY = VOLCANO_CRATER_TILE.y * TILE + TILE / 2;
      const inView = vX >= viewLeft - TILE && vX <= viewRight + TILE && vY >= viewTop - TILE * 4 && vY <= viewBottom + TILE;
      if (inView && Math.random() < 0.6) {
        particles.emit({
          x: vX + (Math.random() - 0.5) * TILE * 0.7,
          y: vY,
          count: 1, shape: "circle",
          color: EDG.steel, color2: EDG.slate, 
          speedMin: 6, speedMax: 16,
          angleMin: -Math.PI * 0.62, angleMax: -Math.PI * 0.38, 
          lifetimeMin: 1.6, lifetimeMax: 2.8,
          sizeMin: 1.2, sizeMax: 2.6,
          gravity: -10, 
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
        seasonForDay(client.day), 
        playerFarmerId, 
      );

      pushOccluderSprites(renderer);

      pushBuildingSprites(renderer, seasonForDay(client.day));

      pushBridgeSprites(renderer, nowMs);

      pushWaterDecor(renderer, particles, nowMs, dt, { left: viewLeft, right: viewRight, top: viewTop, bottom: viewBottom });

      pushFishSchools(renderer, nowMs, dt, { left: viewLeft, right: viewRight, top: viewTop, bottom: viewBottom });

      const stepPrevMs = nowMs - dt * 1000;
      for (const s of interpolatedSprites) {
        if (s.id === null || s.moving !== true || !s.frame.startsWith("farmer/")) continue;
        if (s.x < viewLeft || s.x > viewRight || s.y < viewTop || s.y > viewBottom) continue;
        if (walkStepsBetween(s.id, stepPrevMs, nowMs) === 0) continue;
        if (!isWalkable(Math.floor(s.x / TILE), Math.floor((s.y + TILE * 0.3) / TILE))) continue;
        particles.emit({
          x: s.x + (Math.random() - 0.5) * TILE * 0.3,
          y: s.y + TILE * 0.42, 
          count: 2, shape: "circle",
          color: EDG.silver, color2: EDG.white,
          speedMin: 3, speedMax: 10,
          angleMin: -Math.PI * 0.75, angleMax: -Math.PI * 0.25, 
          lifetimeMin: 0.22, lifetimeMax: 0.4,
          sizeMin: 0.5, sizeMax: 1.1,
          gravity: 26, 
        });
      }

      const hb = client.playerHotbar;
      const heldSlot = hb ? hb.slots[hb.selected] : undefined;
      const heldFrame = heldSlot?.frame;
      if (playerFarmerId !== null && heldFrame && heldFrame.startsWith("tool/")) {
        for (const s of interpolatedSprites) {
          if (s.id !== playerFarmerId) continue;
          if (s.action !== null && s.action in ACTION_POSE) break; 
          const facing = s.facing ?? "down";
          const a = HELD_TOOL_ANCHOR[facing];
          const facingLeft = facing === "side" && (s.flipX ?? false);
          const toolFrame = HELD_TOOL_FRAME[heldFrame] ?? heldFrame;

          const carryFlip = heldFrame !== "tool/can";
          const size = TILE * HELD_TOOL_SCALE; 
          renderer.push({
            x: s.x + (facingLeft ? -a.dx : a.dx), 
            y: s.y + a.dy,
            width: size,
            height: size,
            frame: toolFrame,
            atlasId: frameToAtlasId(toolFrame),
            rotation: 0,
            layer: s.layer,

            sortY: s.y + (a.behind ? -0.1 : 0.1),
            alpha: 1,
            flipX: carryFlip !== facingLeft, 
          });
          break;
        }
      }
    });

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

      if (keyboard.justPressed("KeyE")) inventory.toggle();
      if (keyboard.justPressed("Escape") && inventory.isOpen()) inventory.setOpen(false);

      if (keyboard.justPressed("Tab")) leaderboardPanel.toggle();
      if (client.owner) {

        let selectSlot: number | null = null;
        for (let n = 1; n <= HOTBAR_SIZE && n <= 9; n++) {
          if (keyboard.justPressed(`Digit${n}`)) {
            selectSlot = n - 1;
            break;
          }
        }

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
    const lightOverlay = makeLightOverlay(nightness, view);
    frameProfiler.time("render.endFrame", () => renderer.endFrame(wash, particles, rain, lightOverlay));

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

    setTimeout(renderFrame, 0);
  }

  return renderFrame;
}
