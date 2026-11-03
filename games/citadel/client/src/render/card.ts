/**
 * DEV only (`?card`): the games portal's card art for Citadel. A small cozy town at midday on the
 * real terrain's core box (a hall, houses, a chapel, a farm, a mill, a market, a well and a few
 * villagers), drawn by the game's own renderer and `pushScene`. No sim runs. The portal's
 * `scripts/cards.ts` captures it once `window.__cardReady` is true.
 */
import type { BuildingSnapshot, TerrainGrid, VillagerSnapshot } from "@citadel/sim-core";
import { findCoreBox, CORE_BOX_W, CORE_BOX_H } from "@citadel/sim-core";
import { createCitadelRenderer, pushScene } from "./citadel-renderer";
import { computeWash } from "./atmosphere";

function building(type: string, x: number, y: number, w: number, h: number): BuildingSnapshot {
  return {
    type, x, y, w, h,
    connected: true, outputBuffer: 0, workerCount: 1, occupancy: 1, ownerId: 0,
    onFire: false, burning: false,
    level: 1, lacksFaith: false, lacksSafety: false, lacksGoods: false, mood: 85,
    wellServed: true,
  };
}

function villager(id: number, x: number, y: number, job: string): VillagerSnapshot {
  return { id, x, y, fsm: "idle", carryGood: null, job, mood: 80 };
}

export async function runCard(canvas: HTMLCanvasElement, terrain: TerrainGrid): Promise<void> {
  // The page's HTML bar (Settings, Save, Load) is the game's, not the card's.
  const hud = document.getElementById("hud");
  if (hud) hud.style.display = "none";
  const { renderer, camera, iso } = await createCitadelRenderer(canvas, terrain);
  const core = findCoreBox(terrain.cells, terrain.width, terrain.height) ?? { x: 90, y: 90 };
  const x = core.x;
  const y = core.y;
  const buildings = [
    building("town-hall", x + 4, y + 1, 3, 3),
    building("house", x, y, 2, 2),
    building("house", x + 2, y + 3, 2, 2),
    building("house", x + 8, y, 2, 2),
    building("chapel", x + 8, y + 3, 2, 2),
    building("well", x + 3, y + 1, 1, 1),
    building("market", x + 10, y + 2, 2, 2),
    building("farm", x - 1, y + 5, 3, 3),
    building("mill", x + 5, y + 5, 2, 2),
  ];
  const villagers = [
    villager(1, x + 3, y + 2, "farmer"),
    villager(2, x + 7, y + 2, "priest"),
    villager(3, x + 6, y + 4, "trader"),
    villager(4, x + 1, y + 4, "miller"),
  ];
  // Frame the town: the iso box round its tiles, with a margin.
  const corners = [iso.tileCenterToIso(x - 2, y - 1), iso.tileCenterToIso(x + CORE_BOX_W, y - 1), iso.tileCenterToIso(x - 2, y + CORE_BOX_H + 3), iso.tileCenterToIso(x + CORE_BOX_W, y + CORE_BOX_H + 3)];
  const minX = Math.min(...corners.map((c) => c.x));
  const maxX = Math.max(...corners.map((c) => c.x));
  const minY = Math.min(...corners.map((c) => c.y)) - 48; // room for the tallest roofs
  const maxY = Math.max(...corners.map((c) => c.y));
  let frames = 0;
  const frame = (): void => {
    renderer.beginFrame();
    camera.centerX = (minX + maxX) / 2;
    camera.centerY = (minY + maxY) / 2;
    // The town fills the card: set the visible iso extent directly, past the player's zoom limit.
    const aspect = canvas.width / Math.max(1, canvas.height);
    const spanX = Math.max(maxX - minX, (maxY - minY) * aspect);
    camera.worldUnitsX = spanX;
    camera.worldUnitsY = spanX / aspect;
    pushScene(renderer, iso, { buildings, villagers, raiders: [] }, undefined, performance.now(), 0);
    renderer.endFrame(computeWash("summer", 0.45), undefined, undefined);
    frames += 1;
    if (frames === 20) (window as unknown as { __cardReady?: boolean }).__cardReady = true;
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
