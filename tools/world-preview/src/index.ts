import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";
import { bootstrapSim } from "farm-valley/src/sim-bootstrap";
import { decorateMarketAndShop } from "farm-valley/src/decorate";
import type { AtlasManifest } from "@engine/core";
import type { GameEntity } from "farm-valley/src/components";

const TILE = 16;
const WORLD_TILES_X = 20;
const WORLD_TILES_Y = 12;
const WORLD_W = WORLD_TILES_X * TILE;
const WORLD_H = WORLD_TILES_Y * TILE;
const SCALE = 3;

interface Frame {
  x: number;
  y: number;
  w: number;
  h: number;
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../../..");
const atlasDir = resolve(repoRoot, "packages/farm-valley/public/atlas");
const manifest: AtlasManifest = JSON.parse(
  readFileSync(resolve(atlasDir, "main.json"), "utf8"),
) as AtlasManifest;
const atlas = PNG.sync.read(readFileSync(resolve(atlasDir, "main.png")));

const out = new PNG({ width: WORLD_W, height: WORLD_H });
out.data.fill(0);

function clearToColor(r: number, g: number, b: number, a: number): void {
  for (let i = 0; i < out.data.length; i += 4) {
    out.data[i] = r;
    out.data[i + 1] = g;
    out.data[i + 2] = b;
    out.data[i + 3] = a;
  }
}

function blitFrame(
  frame: Frame,
  dstX: number,
  dstY: number,
): void {
  for (let y = 0; y < frame.h; y++) {
    const dy = dstY + y;
    if (dy < 0 || dy >= WORLD_H) continue;
    for (let x = 0; x < frame.w; x++) {
      const dx = dstX + x;
      if (dx < 0 || dx >= WORLD_W) continue;
      const srcIdx = ((frame.y + y) * atlas.width + (frame.x + x)) * 4;
      const a = atlas.data[srcIdx + 3] ?? 0;
      if (a === 0) continue;
      const dstIdx = (dy * WORLD_W + dx) * 4;
      if (a === 255) {
        out.data[dstIdx] = atlas.data[srcIdx]!;
        out.data[dstIdx + 1] = atlas.data[srcIdx + 1]!;
        out.data[dstIdx + 2] = atlas.data[srcIdx + 2]!;
        out.data[dstIdx + 3] = 255;
      } else {
        const sa = a / 255;
        const da = (out.data[dstIdx + 3] ?? 0) / 255;
        const outA = sa + da * (1 - sa);
        if (outA === 0) continue;
        out.data[dstIdx] = Math.round(
          (atlas.data[srcIdx]! * sa + (out.data[dstIdx] ?? 0) * da * (1 - sa)) / outA,
        );
        out.data[dstIdx + 1] = Math.round(
          (atlas.data[srcIdx + 1]! * sa + (out.data[dstIdx + 1] ?? 0) * da * (1 - sa)) / outA,
        );
        out.data[dstIdx + 2] = Math.round(
          (atlas.data[srcIdx + 2]! * sa + (out.data[dstIdx + 2] ?? 0) * da * (1 - sa)) / outA,
        );
        out.data[dstIdx + 3] = Math.round(outA * 255);
      }
    }
  }
}

function blitTile(frameName: string, tx: number, ty: number): void {
  const frame = manifest.frames[frameName];
  if (!frame) throw new Error(`No atlas frame: ${frameName}`);
  blitFrame(frame, tx * TILE, ty * TILE);
}

function blitCentered(frameName: string, cx: number, cy: number): void {
  const frame = manifest.frames[frameName];
  if (!frame) throw new Error(`No atlas frame: ${frameName}`);
  blitFrame(frame, Math.round(cx - frame.w / 2), Math.round(cy - frame.h / 2));
}

clearToColor(20, 24, 30, 255);

for (let ty = 0; ty < WORLD_TILES_Y; ty++) {
  for (let tx = 0; tx < WORLD_TILES_X; tx++) {
    blitTile("tile/grass", tx, ty);
  }
}

for (let tx = 0; tx < WORLD_TILES_X; tx++) {
  blitTile("tile/path", tx, 5);
}
for (let ty = 0; ty < WORLD_TILES_Y; ty++) {
  blitTile("tile/path", 9, ty);
  blitTile("tile/path", 10, ty);
}

const FENCE_REGIONS = [
  { left: 2, right: 5, top: 1, bottom: 4 },
  { left: 14, right: 17, top: 1, bottom: 4 },
  { left: 2, right: 5, top: 7, bottom: 10 },
  { left: 14, right: 17, top: 7, bottom: 10 },
];
for (const r of FENCE_REGIONS) {
  for (let tx = r.left; tx <= r.right; tx++) {
    blitTile("tile/fence-h", tx, r.top);
    blitTile("tile/fence-h", tx, r.bottom);
  }
}

const { world } = bootstrapSim({ seed: 0xc0ffee, ticksPerDay: 20 });
decorateMarketAndShop(world);

for (const plot of world.query("plot")) {
  blitTile("tile/dirt", plot.plot.tileX, plot.plot.tileY);
}

for (const e of world.query("sprite", "transform")) {
  if (!isFarmerOrStructure(e)) continue;
  blitCentered(e.sprite.frame, e.transform.x, e.transform.y);
}

function isFarmerOrStructure(e: GameEntity): e is GameEntity & {
  sprite: NonNullable<GameEntity["sprite"]>;
  transform: NonNullable<GameEntity["transform"]>;
} {
  return e.sprite !== undefined && e.transform !== undefined;
}

const upscaled = upscale(out, SCALE);
const outPath = resolve(repoRoot, "world-preview.png");
writeFileSync(outPath, PNG.sync.write(upscaled));

function upscale(src: PNG, scale: number): PNG {
  const dst = new PNG({ width: src.width * scale, height: src.height * scale });
  for (let y = 0; y < src.height; y++) {
    for (let x = 0; x < src.width; x++) {
      const sIdx = (y * src.width + x) * 4;
      const r = src.data[sIdx]!;
      const g = src.data[sIdx + 1]!;
      const b = src.data[sIdx + 2]!;
      const a = src.data[sIdx + 3]!;
      for (let dy = 0; dy < scale; dy++) {
        for (let dx = 0; dx < scale; dx++) {
          const di = ((y * scale + dy) * dst.width + (x * scale + dx)) * 4;
          dst.data[di] = r;
          dst.data[di + 1] = g;
          dst.data[di + 2] = b;
          dst.data[di + 3] = a;
        }
      }
    }
  }
  return dst;
}

const farmerCount = (() => {
  let n = 0;
  for (const _ of world.query("farmer")) n += 1;
  return n;
})();
const plotCount = (() => {
  let n = 0;
  for (const _ of world.query("plot")) n += 1;
  return n;
})();

console.log(
  `world-preview: ${WORLD_W}x${WORLD_H} world (${SCALE}x upscaled to ${WORLD_W * SCALE}x${WORLD_H * SCALE}) — ${farmerCount} farmers, ${plotCount} plots`,
);
console.log(`wrote ${outPath}`);
