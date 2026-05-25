import type { Renderer, LoadedAtlas, World, SpriteInstance } from "@engine/core";
import { Canvas2dRenderer } from "@engine/core";
import type { Canvas2dSprite } from "@engine/core";
import type { GameEntity } from "./components";

const TILE = 16;
const TILES_X = 20;
const TILES_Y = 12;

interface BgTile {
  tx: number;
  ty: number;
  frame: string;
  rotation: number;
  layer: number;
}

const BACKGROUND: BgTile[] = (() => {
  const out: BgTile[] = [];
  for (let ty = 0; ty < TILES_Y; ty++) {
    for (let tx = 0; tx < TILES_X; tx++) {
      out.push({ tx, ty, frame: "tile/grass", rotation: 0, layer: 0 });
    }
  }
  for (let tx = 0; tx < TILES_X; tx++) {
    out.push({ tx, ty: 5, frame: "tile/path", rotation: 0, layer: 1 });
  }
  for (let ty = 0; ty < TILES_Y; ty++) {
    out.push({ tx: 9, ty, frame: "tile/path", rotation: 0, layer: 1 });
    out.push({ tx: 10, ty, frame: "tile/path", rotation: 0, layer: 1 });
  }
  return out;
})();

const FARM_FENCE_REGIONS: ReadonlyArray<{ left: number; right: number; top: number; bottom: number }> = [
  { left: 2, right: 5, top: 1, bottom: 4 },
  { left: 14, right: 17, top: 1, bottom: 4 },
  { left: 2, right: 5, top: 7, bottom: 10 },
  { left: 14, right: 17, top: 7, bottom: 10 },
];

const FENCES: BgTile[] = (() => {
  const out: BgTile[] = [];
  for (const r of FARM_FENCE_REGIONS) {
    for (let tx = r.left; tx <= r.right; tx++) {
      out.push({ tx, ty: r.top, frame: "tile/fence-h", rotation: 0, layer: 20 });
      out.push({ tx, ty: r.bottom, frame: "tile/fence-h", rotation: 0, layer: 20 });
    }
  }
  return out;
})();

interface LogicalSprite {
  x: number;
  y: number;
  width: number;
  height: number;
  frame: string;
  rotation: number;
  layer: number;
  tintR: number;
  tintG: number;
  tintB: number;
  tintA: number;
}

function* iterSceneSprites(world: World<GameEntity>, alpha: number): Generator<LogicalSprite> {
  for (const tile of BACKGROUND) {
    yield {
      x: tile.tx * TILE + TILE / 2,
      y: tile.ty * TILE + TILE / 2,
      width: TILE,
      height: TILE,
      frame: tile.frame,
      rotation: tile.rotation,
      layer: tile.layer,
      tintR: 1, tintG: 1, tintB: 1, tintA: 1,
    };
  }

  for (const fence of FENCES) {
    yield {
      x: fence.tx * TILE + TILE / 2,
      y: fence.ty * TILE + TILE / 2,
      width: TILE,
      height: TILE,
      frame: fence.frame,
      rotation: fence.rotation,
      layer: fence.layer,
      tintR: 1, tintG: 1, tintB: 1, tintA: 1,
    };
  }

  for (const plot of world.query("plot")) {
    const px = plot.plot.tileX * TILE + TILE / 2;
    const py = plot.plot.tileY * TILE + TILE / 2;
    yield {
      x: px, y: py, width: TILE, height: TILE,
      frame: "tile/dirt",
      rotation: 0, layer: 2,
      tintR: 1, tintG: 1, tintB: 1, tintA: 1,
    };
    if (plot.plot.state.kind === "planted") {
      const crop = plot.plot.state.crop;
      const days = plot.plot.state.daysGrowing;
      const ready = plot.plot.state.readyAtDay;
      const stage = days >= ready ? "mature" : days > 0 ? "growing" : "seed";
      yield {
        x: px, y: py, width: TILE, height: TILE,
        frame: `crop/${crop}/${stage}`,
        rotation: 0, layer: 10,
        tintR: 1, tintG: 1, tintB: 1, tintA: 1,
      };
    }
  }

  for (const entity of world.query("sprite", "transform")) {
    const t = entity.transform;
    const x = t.prevX + (t.x - t.prevX) * alpha;
    const y = t.prevY + (t.y - t.prevY) * alpha;
    const s = entity.sprite;
    const tint = s.tintRgba >>> 0;
    yield {
      x, y, width: TILE, height: TILE,
      frame: s.frame,
      rotation: t.rotation,
      layer: s.layer,
      tintR: ((tint >> 24) & 0xff) / 255,
      tintG: ((tint >> 16) & 0xff) / 255,
      tintB: ((tint >> 8) & 0xff) / 255,
      tintA: (tint & 0xff) / 255,
    };
  }
}

export function buildSpriteFrame(
  renderer: Renderer,
  world: World<GameEntity>,
  atlas: LoadedAtlas,
  alpha: number,
): void {
  const batch = renderer.spriteBatch;
  const push = (s: SpriteInstance) => batch.push(s);

  for (const ls of iterSceneSprites(world, alpha)) {
    const uv = atlas.frameUv(ls.frame);
    push({
      x: ls.x, y: ls.y, width: ls.width, height: ls.height,
      uvX: uv.u, uvY: uv.v, uvW: uv.w, uvH: uv.h,
      tintR: ls.tintR, tintG: ls.tintG, tintB: ls.tintB, tintA: ls.tintA,
      rotation: ls.rotation,
      layer: ls.layer,
    });
  }
}

export function buildCanvasFrame(
  renderer: Canvas2dRenderer,
  world: World<GameEntity>,
  alpha: number,
): void {
  for (const ls of iterSceneSprites(world, alpha)) {
    const sprite: Canvas2dSprite = {
      x: ls.x,
      y: ls.y,
      width: ls.width,
      height: ls.height,
      frame: ls.frame,
      rotation: ls.rotation,
      layer: ls.layer,
      alpha: ls.tintA,
    };
    renderer.push(sprite);
  }
}
