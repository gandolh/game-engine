import type { RendererLike } from "@engine/core";
import type { Season } from "../protocols/weather";
import { frameToAtlasId, resolveFrameAndBob } from "./frames";

const TILE = 16;

function foliageSway(
  frame: string,
  wx: number,
  wy: number,
): { swayAmp: number; swayPhase: number } | undefined {
  const tx = Math.floor(wx / TILE);
  const ty = Math.floor(wy / TILE);

  const hash = ((Math.imul(tx, 2654435761) ^ Math.imul(ty, 2246822519)) >>> 0);
  const phase = (hash / 0x100000000) * (Math.PI * 2);

  if (frame.startsWith("crop/")) {
    return { swayAmp: 0.5, swayPhase: phase };
  }
  if (
    frame.startsWith("structure/tree") ||      
    frame.startsWith("structure/fruit-tree") || 
    frame.startsWith("structure/bush") ||       
    frame === "decoration/bush"
  ) {
    return { swayAmp: 1.0, swayPhase: phase };
  }
  return undefined;
}

export function pushSnapshotSprites(
  renderer: RendererLike,
  sprites: import("../snapshot").SnapshotSprite[],
  meets: import("../snapshot").SnapshotMeet[],
  farmerPositions: Map<number, { x: number; y: number }>,
  nowMs: number = 0,
  season: Season = "spring",
  playerId: number | null = null,
): void {
  const meetFarmerIds = new Set<number>(meets.map((m) => m.farmerId));

  for (const s of sprites) {
    const { frame, bobY, scale } = resolveFrameAndBob(s, nowMs, season);
    const size = scale ? TILE * scale : TILE;

    const zPx = s.z ? s.z * TILE : 0;
    if (s.id !== null) {

      const HEIGHT_FADE_PX = TILE * 3;
      const t = zPx > 0 ? Math.max(0, 1 - zPx / HEIGHT_FADE_PX) : 1;
      if (t > 0) {
        renderer.pushShadow(s.x, s.y + TILE * 0.35, TILE * 0.32 * t, TILE * 0.12 * t, 0.45 * t);
      }
    }

    const isAnimatedEntity = s.id !== null && (frame.startsWith("farmer/") || frame.startsWith("npc/"));
    const sway = isAnimatedEntity ? undefined : foliageSway(frame, s.x, s.y);
    renderer.push({
      x: s.x,
      y: s.y + bobY,
      ...(zPx > 0 ? { z: zPx } : {}),
      ...(s.id !== null && s.id === playerId ? { occludable: true } : {}),
      ...(sway !== undefined ? { swayAmp: sway.swayAmp, swayPhase: sway.swayPhase } : {}),
      width: size,
      height: size,
      frame,
      atlasId: frameToAtlasId(frame),
      rotation: s.rotation,
      layer: s.layer,
      alpha: s.alpha,
      flipX: s.flipX ?? false,
      tintRgba: s.tintRgba ?? 0xffffffff,
    });

    if (
      s.bubble !== null &&
      s.bubble !== undefined &&
      s.id !== null &&
      !meetFarmerIds.has(s.id)
    ) {
      renderer.push({
        x: s.x,
        y: s.y - TILE,
        width: TILE,
        height: TILE,
        frame: s.bubble,
        atlasId: "items-ui",
        rotation: 0,
        layer: 89, 
        alpha: 1,
      });
    }

    if (s.healthFrac !== undefined && s.id !== null) {
      const BAR_W = TILE * 0.875;        
      const BAR_H = TILE * 0.1875;       
      const barY = s.y - TILE * 0.75;    
      renderer.push({
        x: s.x,
        y: barY,
        width: BAR_W,
        height: BAR_H,
        frame: "indicator/hpbar-bg",
        atlasId: "items-ui",
        rotation: 0,
        layer: 88, 
        alpha: 1,
      });
      const frac = s.healthFrac;
      if (frac > 0) {
        const fillW = BAR_W * frac;

        renderer.push({
          x: s.x - (BAR_W - fillW) / 2,
          y: barY,
          width: fillW,
          height: BAR_H,
          frame: "indicator/hpbar-fill",
          atlasId: "items-ui",
          rotation: 0,
          layer: 88,
          alpha: 1,
        });
      }
    }
  }

  for (const meet of meets) {
    const pos = farmerPositions.get(meet.farmerId);
    if (!pos) continue;
    renderer.push({
      x: pos.x,
      y: pos.y - TILE,
      width: TILE,
      height: TILE,
      frame: "indicator/meet",
      atlasId: "items-ui",
      rotation: 0,
      layer: 90,
      alpha: 1,
    });
  }
}
