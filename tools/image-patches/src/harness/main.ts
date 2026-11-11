/**
 * The patch harness (dev only, at /harness/): the engine's patched static layer on a real WebGL2 context.
 *
 * - `?mode=world` (default): a synthetic world of `?tiles=480` × 480 16 px tiles (7680 px a side,
 *   twice Farm's width), baked from sprites plus a decorator, so it is patched on any device.
 * - `?mode=painted`: the generated EDG32 sample image, cut into 2048 px patches by
 *   `harness-prep.ts`, loaded with `loadPatchedImage`.
 * - `?textureLimit=<px>` behaves as a device with that `MAX_TEXTURE_SIZE`; `?zoom=<z>` sets the
 *   zoom; `?pan=<px>` pans that many world px a frame, left to right along the middle, wrapping.
 *
 * `window.__patchHarness()` reports the layer (`staticLayerInfo`) and the most it has held;
 * `window.__patchHarnessMove(x, y, zoom)` moves the camera.
 */
import { Camera2D, createRenderer, EDG } from "@engine/core/render";
import type { DecorateFn, Sprite, StaticLayerInfo } from "@engine/core/render";
import { loadPatchedImage } from "@engine/core/assets";
import type { LoadedAtlasImage } from "@engine/core/assets";

declare global {
  interface Window {
    __patchHarness?: () => { mode: string; info: StaticLayerInfo; maxLive: number; maxLargest: number; frames: number };
    __patchHarnessMove?: (x: number, y: number, zoom?: number) => void;
  }
}

const TILE = 16;
const FRAMES = ["grass", "meadow", "sand", "water"] as const;
const FRAME_COLOURS = [EDG.greenMid, EDG.green, EDG.tan, EDG.skyBlue];

/** Four 16 px tiles, each with a darker top-left pixel so a shifted or missing row shows. */
async function makeAtlas(): Promise<LoadedAtlasImage> {
  const canvas = new OffscreenCanvas(TILE * FRAMES.length, TILE);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("harness: no 2d context");
  const frames: Record<string, { x: number; y: number; w: number; h: number }> = {};
  FRAMES.forEach((name, i) => {
    ctx.fillStyle = FRAME_COLOURS[i]!;
    ctx.fillRect(i * TILE, 0, TILE, TILE);
    ctx.fillStyle = EDG.greenDark;
    ctx.fillRect(i * TILE, 0, 1, 1);
    frames[name] = { x: i * TILE, y: 0, w: TILE, h: TILE };
  });
  const bitmap = await createImageBitmap(canvas);
  return {
    manifest: { id: "harness", imageUrl: "", width: canvas.width, height: canvas.height, frames },
    bitmap,
    frameRect: (name) => {
      const f = frames[name];
      if (!f) throw new Error(`harness atlas has no frame ${name}`);
      return f;
    },
  };
}

/**
 * A deterministic tile pick: an island of grass and meadow in water, sand at the shore, and a
 * sand band along the top edge only, so a vertical flip anywhere shows.
 */
function frameAt(tx: number, ty: number, tiles: number): (typeof FRAMES)[number] {
  if (ty < 4) return "sand";
  const cx = tiles / 2;
  const d = Math.hypot(tx - cx, ty - cx) / cx;
  const wave = Math.sin(tx * 0.07) * Math.cos(ty * 0.05) * 0.25;
  const h = 1 - d + wave;
  if (h < 0.15) return "water";
  if (h < 0.2) return "sand";
  return (tx >> 3) % 2 === (ty >> 3) % 2 ? "grass" : "meadow";
}

/** A 2 px line every 50 tiles (off the 2048 px patch edges), painted only where the bake's region reaches. */
const gridLines: DecorateFn = (ctx, w, h, region) => {
  const step = TILE * 50;
  ctx.fillStyle = EDG.black;
  for (let x = Math.ceil(region.originX / step) * step; x < Math.min(w, region.originX + region.width); x += step) {
    ctx.fillRect(x, region.originY, 2, region.height);
  }
  for (let y = Math.ceil(region.originY / step) * step; y < Math.min(h, region.originY + region.height); y += step) {
    ctx.fillRect(region.originX, y, region.width, 2);
  }
};

async function main(): Promise<void> {
  const params = new URLSearchParams(location.search);
  const mode = params.get("mode") === "painted" ? "painted" : "world";
  const textureLimit = Number(params.get("textureLimit") ?? 0);
  const tiles = Number(params.get("tiles") ?? 480);
  const pan = Number(params.get("pan") ?? 0);

  const canvas = document.getElementById("c") as HTMLCanvasElement;
  const camera = new Camera2D({
    worldUnitsX: canvas.clientWidth,
    worldUnitsY: canvas.clientHeight,
    centerX: 0,
    centerY: 0,
  });
  camera.setZoom(Number(params.get("zoom") ?? 1));
  const renderer = await createRenderer(canvas, camera, textureLimit > 0 ? { textureLimit } : {});
  renderer.clearColor = EDG.navy;

  let worldW: number;
  let worldH: number;
  if (mode === "painted") {
    const image = await loadPatchedImage("/painted/patches.json");
    renderer.bakeStaticImage(image);
    worldW = image.manifest.width;
    worldH = image.manifest.height;
  } else {
    renderer.addAtlas(await makeAtlas());
    const sprites: Sprite[] = [];
    for (let ty = 0; ty < tiles; ty++) {
      for (let tx = 0; tx < tiles; tx++) {
        sprites.push({
          x: tx * TILE + TILE / 2,
          y: ty * TILE + TILE / 2,
          width: TILE,
          height: TILE,
          frame: frameAt(tx, ty, tiles),
          atlasId: "harness",
          rotation: 0,
          layer: 0,
          alpha: 1,
        });
      }
    }
    worldW = worldH = tiles * TILE;
    renderer.bakeStaticLayer(sprites, worldW, worldH, gridLines);
  }
  camera.setCenter(worldW / 2, worldH / 2);

  let maxLive = 0;
  let maxLargest = 0;
  let frames = 0;
  window.__patchHarness = () => ({ mode, info: renderer.staticLayerInfo(), maxLive, maxLargest, frames });
  window.__patchHarnessMove = (x, y, zoom) => {
    camera.setCenter(x, y);
    if (zoom !== undefined) camera.setZoom(zoom);
  };

  const frame = (): void => {
    if (pan > 0) {
      const halfView = camera.worldUnitsX / 2;
      let x = camera.centerX + pan;
      if (x + halfView > worldW) x = halfView;
      camera.setCenter(x, worldH / 2);
    }
    renderer.beginFrame();
    renderer.endFrame();
    const info = renderer.staticLayerInfo();
    maxLive = Math.max(maxLive, info.live);
    maxLargest = Math.max(maxLargest, info.largest);
    frames += 1;
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

void main();
