import type { Renderer, LoadedAtlas, World } from "@engine/core";
import type { GameEntity } from "./components";

const TILE = 16;

export function buildSpriteFrame(
  renderer: Renderer,
  world: World<GameEntity>,
  atlas: LoadedAtlas,
  alpha: number,
): void {
  const batch = renderer.spriteBatch;

  for (const plot of world.query("plot")) {
    const px = plot.plot.tileX * TILE + TILE / 2;
    const py = plot.plot.tileY * TILE + TILE / 2;
    const tileFrame = plot.plot.state.kind === "empty" ? "tile/dirt" : "tile/dirt";
    const uv = atlas.frameUv(tileFrame);
    batch.push({
      x: px, y: py, width: TILE, height: TILE,
      uvX: uv.u, uvY: uv.v, uvW: uv.w, uvH: uv.h,
      tintR: 1, tintG: 1, tintB: 1, tintA: 1,
      rotation: 0, layer: 0,
    });
    if (plot.plot.state.kind === "planted") {
      const crop = plot.plot.state.crop;
      const days = plot.plot.state.daysGrowing;
      const ready = plot.plot.state.readyAtDay;
      const stage = days >= ready ? "mature" : days > 0 ? "growing" : "seed";
      const cropFrame = `crop/${crop}/${stage}`;
      const cuv = atlas.frameUv(cropFrame);
      batch.push({
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
    batch.push({
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
