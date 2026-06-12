import type { RendererLike } from "@engine/core";
import type { NoiseGenerator } from "@engine/core";
import { makeGroundNoiseDecorator, GROUND_NOISE_AMPLITUDE } from "../render/ground-noise";
import { makeWaterDepthDecorator } from "../render/water-depth";
import { makeShoreDescentDecorator } from "../render/shore-descent";
import { TILE } from "./config";
import type { SimClient } from "../worker/sim-client";
import type { AmbientLayer } from "./ambient";
import { WORLD_WIDTH, WORLD_HEIGHT, isWalkable } from "@farm/sim-core/world/regions";

/**
 * Maximum BFS depth for the wide shore-proximity gradient uploaded to the GPU depth mask.
 * Chosen to be wide enough (14 tiles) for a smooth shore→deep color blend in the shader.
 * Kept separate from COAST_DEPTH_MAX (4) so other consumers (water-depth.ts, water-decor.ts,
 * oceanDepthAt) are unaffected.
 */
const GRADIENT_DEPTH_MAX = 14;

/**
 * Build the per-tile depth mask for the GPU water pass (brief 13 follow-up: wide gradient).
 * Returns a Uint8Array of tilesX × tilesY bytes.
 *
 * Each byte encodes a normalized shore-proximity value (0..255):
 *   255 = tile immediately adjacent to land (BFS distance 1)
 *   0   = land tile, out-of-grid, or ≥ GRADIENT_DEPTH_MAX tiles from any land
 *
 * Uses a multi-source BFS seeded from coast-adjacent ocean tiles, matching the pattern of
 * oceanDepthAt / OCEAN_DEPTH in geometry.ts but with a wider radius (GRADIENT_DEPTH_MAX=14
 * vs COAST_DEPTH_MAX=4). Inlined here because @farm/sim-core resolves to the main-tree
 * package at typecheck time and cannot surface new exports from the worktree (see CLAUDE.md
 * "KNOWN QUIRK").
 */
function buildDepthMask(tilesX: number, tilesY: number): Uint8Array {
  // Step 1: BFS from coast — store raw integer distance (1 = adjacent to land).
  const dist = new Int16Array(tilesX * tilesY); // 0 = land or unvisited
  const queue: number[] = [];

  for (let ty = 0; ty < tilesY; ty++) {
    for (let tx = 0; tx < tilesX; tx++) {
      if (isWalkable(tx, ty)) continue; // land → leave at 0
      const touchesLand =
        isWalkable(tx, ty - 1) || isWalkable(tx, ty + 1) ||
        isWalkable(tx - 1, ty) || isWalkable(tx + 1, ty);
      if (touchesLand) {
        dist[ty * tilesX + tx] = 1;
        queue.push(ty * tilesX + tx);
      }
    }
  }

  for (let head = 0; head < queue.length; head++) {
    const i = queue[head]!;
    const d = dist[i]!;
    if (d >= GRADIENT_DEPTH_MAX) continue;
    const x = i % tilesX;
    const y = (i - x) / tilesX;
    const nbrs = [
      x + 1 < tilesX  ? i + 1      : -1,
      x - 1 >= 0      ? i - 1      : -1,
      y + 1 < tilesY  ? i + tilesX : -1,
      y - 1 >= 0      ? i - tilesX : -1,
    ];
    for (const ni of nbrs) {
      if (ni < 0) continue;
      if (dist[ni] !== 0) continue; // visited or land
      const nx = ni % tilesX;
      const ny = (ni - nx) / tilesX;
      if (isWalkable(nx, ny)) continue; // don't bleed onto land
      dist[ni] = d + 1;
      queue.push(ni);
    }
  }

  // Step 2: Normalize to 0..255.
  // distance 1 → 255 (closest to shore); distance GRADIENT_DEPTH_MAX → floor(1/14*255)≈18.
  // distance 0 (land / unvisited open ocean) → 0.
  const data = new Uint8Array(tilesX * tilesY);
  for (let i = 0; i < dist.length; i++) {
    const d = dist[i]!;
    data[i] = d > 0 ? Math.round(((GRADIENT_DEPTH_MAX - d + 1) / GRADIENT_DEPTH_MAX) * 255) : 0;
  }
  return data;
}

/**
 * Type guard: true when renderer exposes setWaterDepthMask (WebGPU backend, brief 13).
 * Canvas2D renderer does not implement it — depth is baked into the static layer there.
 * Using a local interface + type guard avoids requiring RendererLike to declare this
 * method, since the RendererLike contract is resolved through the shared node_modules
 * at typecheck time and may lag the engine worktree.
 */
interface RendererWithDepthMask {
  setWaterDepthMask(
    data: Uint8Array,
    tilesX: number,
    tilesY: number,
    worldWidthPx: number,
    worldHeightPx: number,
    tilePxSize: number,
  ): void;
}
function supportsDepthMask(r: RendererLike): r is RendererLike & RendererWithDepthMask {
  return typeof (r as Partial<RendererWithDepthMask>).setWaterDepthMask === "function";
}

// Bake static-layer sprites once; JS fBm ground noise bypasses WASM (per-cell
// hash, not fBm). noiseGen param kept for signature compatibility but unused.
export function bakeStaticLayer(
  client: SimClient,
  renderer: RendererLike,
  _noiseGen: NoiseGenerator | null,
  seed: number,
  ambient: AmbientLayer,
  onBaked?: () => void,
): void {
  const groundNoise = makeGroundNoiseDecorator(seed, TILE, GROUND_NOISE_AMPLITUDE);
  const shoreDescent = makeShoreDescentDecorator(TILE);
  const waterDepth = makeWaterDepthDecorator(TILE, seed);
  // Combined post-bake pass: per-tile ground brightness, the sandy-shore descent darkening on the
  // land side of beaches, then the coastal shallow-water tint over ocean (land slope → water shallows).
  const decorate = (ctx: Parameters<typeof groundNoise>[0], w: number, h: number): void => {
    groundNoise(ctx, w, h);
    shoreDescent(ctx, w, h);
    waterDepth(ctx, w, h);
  };
  client.onStaticLayer((msg) => {
    renderer.bakeStaticLayer(
      msg.sprites,
      msg.worldWidthPx,
      msg.worldHeightPx,
      decorate,
    );
    // pixelScale 3: chunky wave pixels survive downscale at low zoom.
    renderer.bakeWaterPattern("tile/ocean", "terrain", TILE, 3);

    // Brief 13 follow-up: upload the wide shore-proximity gradient as the GPU depth mask.
    // Only the WebGPU renderer supports this; Canvas2D bakes depth into the static layer.
    if (supportsDepthMask(renderer)) {
      const maskData = buildDepthMask(WORLD_WIDTH, WORLD_HEIGHT);
      renderer.setWaterDepthMask(
        maskData,
        WORLD_WIDTH,
        WORLD_HEIGHT,
        WORLD_WIDTH * TILE,
        WORLD_HEIGHT * TILE,
        TILE,
      );
    }

    ambient.init(msg.sprites, seed);
    onBaked?.();
  });
}
