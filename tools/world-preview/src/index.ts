import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";
import { bootstrapSim } from "@farm/sim-core/sim-bootstrap";
import {
  WORLD_WIDTH,
  WORLD_HEIGHT,
  REGIONS,
  regionAt,
  isWalkable,
} from "@farm/sim-core/world/regions";
import type { AtlasManifest } from "@engine/core";
import type { GameEntity } from "@farm/sim-core/components";
import { PREFIX_TO_SHEET } from "../../atlas-builder/src/recipes";

const TILE = 16;
const WORLD_W = WORLD_WIDTH * TILE;
const WORLD_H = WORLD_HEIGHT * TILE;
const SCALE = 2;

interface Frame {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface BlitSprite {
  cx: number;
  cy: number;
  frame: string;
  rotation: number;
  layer: number;
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../../..");
const atlasDir = resolve(repoRoot, "packages/farm-valley/public/atlas");

interface AtlasIndex { sheets: Array<{ id: string; manifestUrl: string; imageUrl: string }> }
const atlasIndex = JSON.parse(readFileSync(resolve(atlasDir, "index.json"), "utf8")) as AtlasIndex;
const sheetManifests = new Map<string, AtlasManifest>();
const sheetPngs = new Map<string, PNG>();
for (const entry of atlasIndex.sheets) {
  const manifestPath = resolve(repoRoot, "packages/farm-valley/public", entry.manifestUrl.slice(1));
  const pngPath = resolve(repoRoot, "packages/farm-valley/public", entry.imageUrl.slice(1));
  sheetManifests.set(entry.id, JSON.parse(readFileSync(manifestPath, "utf8")) as AtlasManifest);
  sheetPngs.set(entry.id, PNG.sync.read(readFileSync(pngPath)));
}

function frameSheetId(frameName: string): string {
  const prefix = frameName.split("/")[0] ?? "";
  const id = PREFIX_TO_SHEET[prefix];
  if (!id) throw new Error(`world-preview: unknown frame prefix "${prefix}" in "${frameName}"`);
  return id;
}

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

// rotation ±90° transposes src (used for vertical fence segments).
function blitFrame(
  atlas: PNG,
  frame: Frame,
  dstX: number,
  dstY: number,
  rotation = 0,
): void {
  const quarterTurns = Math.round(rotation / (Math.PI / 2)) & 3;
  const swap = quarterTurns === 1 || quarterTurns === 3;
  const dw = swap ? frame.h : frame.w;
  const dh = swap ? frame.w : frame.h;
  for (let oy = 0; oy < dh; oy++) {
    const dy = dstY + oy;
    if (dy < 0 || dy >= WORLD_H) continue;
    for (let ox = 0; ox < dw; ox++) {
      const dx = dstX + ox;
      if (dx < 0 || dx >= WORLD_W) continue;
      let sxLocal: number;
      let syLocal: number;
      if (quarterTurns === 1) {
        sxLocal = oy;
        syLocal = frame.h - 1 - ox;
      } else if (quarterTurns === 3) {
        sxLocal = frame.w - 1 - oy;
        syLocal = ox;
      } else if (quarterTurns === 2) {
        sxLocal = frame.w - 1 - ox;
        syLocal = frame.h - 1 - oy;
      } else {
        sxLocal = ox;
        syLocal = oy;
      }
      const srcIdx = ((frame.y + syLocal) * atlas.width + (frame.x + sxLocal)) * 4;
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

function blitCentered(frameName: string, cx: number, cy: number, rotation = 0): void {
  const sheetId = frameSheetId(frameName);
  const sheetManifest = sheetManifests.get(sheetId);
  const sheetPng = sheetPngs.get(sheetId);
  if (!sheetManifest || !sheetPng) throw new Error(`No atlas sheet for: ${frameName} (sheet "${sheetId}")`);
  const frame = sheetManifest.frames[frameName];
  if (!frame) throw new Error(`No atlas frame: ${frameName}`);
  blitFrame(sheetPng, frame, Math.round(cx - frame.w / 2), Math.round(cy - frame.h / 2), rotation);
}

function backdropFrame(tx: number, ty: number): string | null {
  if (!isWalkable(tx, ty)) return null;
  const region = regionAt(tx, ty);
  if (region === null) return "tile/path";
  if (region === "village") return "tile/dirt";
  if (region.startsWith("farm-")) return "tile/grass";
  return null;
}

interface FenceTile {
  tx: number;
  ty: number;
  rotation: number;
}

function computeFences(): FenceTile[] {
  const out: FenceTile[] = [];
  for (const region of REGIONS) {
    if (region.kind !== "farm") continue;
    const { minX, minY, maxX, maxY } = region.bounds;
    for (let tx = minX; tx <= maxX; tx++) {
      if (!isWalkable(tx, minY - 1)) out.push({ tx, ty: minY, rotation: 0 });
      if (!isWalkable(tx, maxY + 1)) out.push({ tx, ty: maxY, rotation: 0 });
    }
    for (let ty = minY + 1; ty <= maxY - 1; ty++) {
      if (!isWalkable(minX - 1, ty)) out.push({ tx: minX, ty, rotation: Math.PI / 2 });
      if (!isWalkable(maxX + 1, ty)) out.push({ tx: maxX, ty, rotation: Math.PI / 2 });
    }
  }
  return out;
}

clearToColor(24, 20, 37, 255); // EDG.black (#181425)
for (let ty = 0; ty < WORLD_HEIGHT; ty++) {
  for (let tx = 0; tx < WORLD_WIDTH; tx++) {
    const frame = backdropFrame(tx, ty);
    if (frame === null) continue;
    blitCentered(frame, tx * TILE + TILE / 2, ty * TILE + TILE / 2);
  }
}

for (const fence of computeFences()) {
  blitCentered("tile/fence-h", fence.tx * TILE + TILE / 2, fence.ty * TILE + TILE / 2, fence.rotation);
}

const { world } = bootstrapSim({ seed: 0xc0ffee, ticksPerDay: 20 });

for (const plot of world.query("plot")) {
  blitCentered("tile/dirt", plot.plot.tileX * TILE + TILE / 2, plot.plot.tileY * TILE + TILE / 2);
}

const sprites: BlitSprite[] = [];
for (const e of world.query("sprite", "transform")) {
  const t = e.transform;
  sprites.push({
    cx: t.x * TILE + TILE / 2,
    cy: t.y * TILE + TILE / 2,
    frame: e.sprite.frame,
    rotation: t.rotation,
    layer: e.sprite.layer,
  });
}
sprites.sort((a, b) => a.layer - b.layer);
for (const s of sprites) {
  // tolerate atlas frame drift — if the sheet or frame is missing, skip
  try {
    const sid = frameSheetId(s.frame);
    const sm = sheetManifests.get(sid);
    if (!sm || !sm.frames[s.frame]) continue;
  } catch {
    continue;
  }
  blitCentered(s.frame, s.cx, s.cy, s.rotation);
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
