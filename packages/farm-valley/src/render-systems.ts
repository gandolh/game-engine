import type { Renderer, LoadedAtlas, World, SpriteInstance } from "@engine/core";
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

function pushTile(
  push: (s: SpriteInstance) => void,
  atlas: LoadedAtlas,
  tile: BgTile,
): void {
  const uv = atlas.frameUv(tile.frame);
  push({
    x: tile.tx * TILE + TILE / 2,
    y: tile.ty * TILE + TILE / 2,
    width: TILE,
    height: TILE,
    uvX: uv.u, uvY: uv.v, uvW: uv.w, uvH: uv.h,
    tintR: 1, tintG: 1, tintB: 1, tintA: 1,
    rotation: tile.rotation,
    layer: tile.layer,
  });
}

export function buildSpriteFrame(
  renderer: Renderer,
  world: World<GameEntity>,
  atlas: LoadedAtlas,
  alpha: number,
): void {
  const batch = renderer.spriteBatch;
  const push = (s: SpriteInstance) => batch.push(s);

  for (const tile of BACKGROUND) pushTile(push, atlas, tile);
  for (const fence of FENCES) pushTile(push, atlas, fence);

  for (const plot of world.query("plot")) {
    const px = plot.plot.tileX * TILE + TILE / 2;
    const py = plot.plot.tileY * TILE + TILE / 2;
    const dirtUv = atlas.frameUv("tile/dirt");
    push({
      x: px, y: py, width: TILE, height: TILE,
      uvX: dirtUv.u, uvY: dirtUv.v, uvW: dirtUv.w, uvH: dirtUv.h,
      tintR: 1, tintG: 1, tintB: 1, tintA: 1,
      rotation: 0, layer: 2,
    });
    if (plot.plot.state.kind === "planted") {
      const crop = plot.plot.state.crop;
      const days = plot.plot.state.daysGrowing;
      const ready = plot.plot.state.readyAtDay;
      const stage = days >= ready ? "mature" : days > 0 ? "growing" : "seed";
      const cuv = atlas.frameUv(`crop/${crop}/${stage}`);
      push({
        x: px, y: py, width: TILE, height: TILE,
        uvX: cuv.u, uvY: cuv.v, uvW: cuv.w, uvH: cuv.h,
        tintR: 1, tintG: 1, tintB: 1, tintA: 1,
        rotation: 0, layer: 10,
      });
    }
  }

  for (const entity of world.query("sprite", "transform")) {
    const t = entity.transform;
    const x = t.prevX + (t.x - t.prevX) * alpha;
    const y = t.prevY + (t.y - t.prevY) * alpha;
    const s = entity.sprite;
    const uv = atlas.frameUv(s.frame);
    const tint = s.tintRgba >>> 0;
    push({
      x, y, width: TILE, height: TILE,
      uvX: uv.u, uvY: uv.v, uvW: uv.w, uvH: uv.h,
      tintR: ((tint >> 24) & 0xff) / 255,
      tintG: ((tint >> 16) & 0xff) / 255,
      tintB: ((tint >> 8) & 0xff) / 255,
      tintA: (tint & 0xff) / 255,
      rotation: t.rotation,
      layer: s.layer,
    });
  }
}
