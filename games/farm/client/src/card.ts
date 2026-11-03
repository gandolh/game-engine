/**
 * DEV only (`?card`): the games portal's card art for Farm Valley. A posed island about 213×160
 * world px, drawn 3× into a 640×480 canvas from the game's own atlas (terrain, crops, buildings,
 * farmers), with no sim server. The portal's `scripts/cards.ts` captures it once `window.__cardReady` is true.
 */
import { Camera2D, createRenderer, EDG, loadAllAtlasSheets } from "@engine/core";
import type { Sprite } from "@engine/core/render";

const TILE = 16;
const W = 14; // tiles baked
const H = 10;
/** 640×480 at a whole 3×, so every atlas pixel is a 3×3 block. */
const VIEW_W = 640 / 3;
const VIEW_H = 480 / 3;

function tileAt(tx: number, ty: number): string {
  const inIsland = tx >= 1 && tx <= 12 && ty >= 1 && ty <= 8;
  const rim = inIsland && (tx === 1 || tx === 12 || ty === 1 || ty === 8);
  if (!inIsland) return "tile/ocean";
  if (rim) return "tile/sand";
  if (tx >= 2 && tx <= 6 && ty >= 6 && ty <= 7) return "tile/dirt";
  if (ty === 4 && tx >= 2 && tx <= 11) return "tile/path";
  return "tile/grass-spring";
}

export async function runCard(canvas: HTMLCanvasElement): Promise<void> {
  canvas.style.width = "640px";
  canvas.style.height = "480px";
  const atlases = await loadAllAtlasSheets("/atlas/index.json", import.meta.env.BASE_URL);
  const camera = new Camera2D({ worldUnitsX: VIEW_W, worldUnitsY: VIEW_H, centerX: VIEW_W / 2, centerY: VIEW_H / 2 });
  const renderer = await createRenderer(canvas, camera);
  for (const a of atlases.values()) renderer.addAtlas(a);
  renderer.clearColor = EDG.blue;

  const frameSize = (atlasId: string, frame: string): { w: number; h: number } => {
    const r = atlases.get(atlasId)?.frameRect(frame);
    return r ? { w: r.w, h: r.h } : { w: TILE, h: TILE };
  };
  const sprites: Sprite[] = [];
  const put = (atlasId: string, frame: string, x: number, baseY: number, layer: number, flipX = false): void => {
    const { w, h } = frameSize(atlasId, frame);
    sprites.push({ x, y: baseY - h / 2, width: w, height: h, frame, atlasId, rotation: 0, layer, alpha: 1, sortY: baseY, flipX });
  };

  for (let ty = 0; ty < H; ty++) {
    for (let tx = 0; tx < W; tx++) put("terrain", tileAt(tx, ty), tx * TILE + TILE / 2, ty * TILE + TILE, 0);
  }
  const crops = ["crop/wheat/mature", "crop/pumpkin/mature", "crop/corn/mature", "crop/radish/mature"];
  for (let ty = 6; ty <= 7; ty++) {
    for (let tx = 2; tx <= 6; tx++) put("crops", crops[(ty + tx) % crops.length]!, tx * TILE + TILE / 2, ty * TILE + TILE - 1, 1);
  }
  put("buildings", "structure/home", 9.5 * TILE, 4 * TILE, 2);
  put("buildings", "structure/tree", 2.5 * TILE, 3.6 * TILE, 2);
  put("buildings", "structure/tree", 11.4 * TILE, 8 * TILE, 2);
  put("buildings", "structure/well", 6.5 * TILE, 3.8 * TILE, 2);
  put("props", "decoration/scarecrow", 4.5 * TILE, 7.4 * TILE, 2);
  put("props", "decoration/hay-bale", 8.6 * TILE, 7.2 * TILE, 2);
  put("characters", "farmer/pip", 7.6 * TILE, 5.8 * TILE, 2);
  put("characters", "farmer/conservative/side", 3.2 * TILE, 8.5 * TILE, 2);
  put("characters", "farmer/hoarder", 10.4 * TILE, 6.9 * TILE, 2, true);
  put("characters", "farmer/aggressive/side", 5.3 * TILE, 4.6 * TILE, 2, true);

  renderer.bakeStaticLayer(sprites, W * TILE, H * TILE);
  let frames = 0;
  const frame = (): void => {
    renderer.beginFrame();
    renderer.endFrame();
    frames += 1;
    if (frames === 10) (window as unknown as { __cardReady?: boolean }).__cardReady = true;
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
