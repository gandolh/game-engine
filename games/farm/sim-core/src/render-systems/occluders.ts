import type { RendererLike } from "@engine/core";
import { OCCLUDER_WALLS, CLIFFS, BIG_STRUCTURES, BRIDGES } from "./geometry";
import { frameToAtlasId, seasonalTreeFrame } from "./frames";
import type { Season } from "../protocols/weather";
import { TILE } from "@engine/core/render";
import type { Sprite } from "@engine/core/render";

const BRIDGE_SWAY_AMP = 1.5;
const BRIDGE_ROPE_SAG = 4;

function bridgeSway(nowMs: number): number {
  const t = nowMs / 1000;
  const wobble = Math.sin(t * 2.3) * 0.62 + Math.sin(t * 1.07 + 1.7) * 0.38;
  const breathe = 0.85 + 0.15 * Math.sin(t * 0.37);
  return wobble * breathe * BRIDGE_SWAY_AMP;
}

const ENTITY_LAYER = 50;

/**
 * The wall and cliff sprites never change, so they are built once and the same objects are pushed every
 * frame. The renderer keeps a pushed sprite only until the frame ends and never writes to it.
 */
let staticOccluders: Sprite[] | null = null;

function buildStaticOccluders(): Sprite[] {
  const out: Sprite[] = [];
  for (const wall of OCCLUDER_WALLS) {
    out.push({
      x: wall.tx * TILE + TILE / 2,
      y: wall.ty * TILE + TILE / 2,
      sortY: (wall.ty + 1) * TILE,
      width: TILE,
      height: TILE,
      frame: wall.frame,
      atlasId: frameToAtlasId(wall.frame),
      rotation: wall.rotation,
      layer: ENTITY_LAYER,
      alpha: 1,
    });
  }
  for (const cliff of CLIFFS) {
    out.push({
      x: cliff.tx * TILE + TILE / 2,
      y: cliff.ty * TILE + TILE / 2,
      sortY: (cliff.ty + 1) * TILE,
      width: TILE,
      height: TILE,
      frame: cliff.frame,
      atlasId: frameToAtlasId(cliff.frame),
      rotation: 0,
      layer: ENTITY_LAYER,
      alpha: 1,
    });
  }
  return out;
}

export function pushOccluderSprites(renderer: Pick<RendererLike, "push">): void {
  staticOccluders ??= buildStaticOccluders();
  for (const sprite of staticOccluders) renderer.push(sprite);
}

/** One bridge's three sprites, reused every frame: only the sway moves `x`, `y` and the rope's sag. */
interface BridgeSprites {
  deck: Sprite;
  posts: Sprite;
  rope: Sprite;
}

let bridgePool: BridgeSprites[] | null = null;

function bridgeSprite(b: (typeof BRIDGES)[number], frame: string, layer: number): Sprite {
  return {
    x: 0,
    y: 0,
    width: TILE,
    height: TILE,
    frame,
    atlasId: frameToAtlasId(frame),
    rotation: b.rotation,
    layer,
    alpha: 1,
  };
}

export function pushBridgeSprites(renderer: Pick<RendererLike, "push">, nowMs: number): void {
  bridgePool ??= BRIDGES.map((b) => ({
    deck: bridgeSprite(b, "tile/bridge-h", 3),
    posts: bridgeSprite(b, "tile/bridge-rail-posts", ENTITY_LAYER + 2),
    rope: bridgeSprite(b, "tile/bridge-rail-rope", ENTITY_LAYER + 3),
  }));
  const sway = bridgeSway(nowMs);
  for (let i = 0; i < BRIDGES.length; i += 1) {
    const b = BRIDGES[i];
    const sprites = bridgePool[i];
    if (b === undefined || sprites === undefined) continue;
    const dx = b.runsVertical ? sway : 0;
    const dy = b.runsVertical ? 0 : sway;
    const x = b.tx * TILE + TILE / 2 + dx;
    const y = b.ty * TILE + TILE / 2 + dy;
    const sag = BRIDGE_ROPE_SAG * 4 * b.spanT * (1 - b.spanT);

    sprites.deck.x = x;
    sprites.deck.y = y;
    sprites.posts.x = x;
    sprites.posts.y = y;
    sprites.rope.x = x;
    sprites.rope.y = y + sag;
    renderer.push(sprites.deck);
    renderer.push(sprites.posts);
    renderer.push(sprites.rope);
  }
}

export function pushBuildingSprites(
  renderer: Pick<RendererLike, "push" | "pushShadow">,
  season: Season = "spring",
): void {
  for (const b of BIG_STRUCTURES) {
    const frame = seasonalTreeFrame(b.frame, season);

    renderer.pushShadow(
      b.baseTileX * TILE + b.wPx / 2 + TILE * 0.3,
      (b.baseTileY + 1) * TILE - TILE * 0.1,
      b.wPx * 0.5 + b.hPx * 0.12,
      TILE * 0.28,
      0.28,
    );
    renderer.push({
      x: b.baseTileX * TILE + b.wPx / 2,
      y: b.baseTileY * TILE + TILE - b.hPx / 2,
      sortY: (b.baseTileY + 1) * TILE,
      width: b.wPx,
      height: b.hPx,
      frame,
      atlasId: frameToAtlasId(frame),
      rotation: 0,
      layer: ENTITY_LAYER,
      alpha: 1,
    });
  }
}
