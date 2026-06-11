import { Canvas2dRenderer } from "@engine/core";
import type { Season } from "../protocols/weather";
import { frameToAtlasId, resolveFrameAndBob } from "./frames";

const TILE = 16;

/**
 * Push dynamic snapshot sprites, meet bubbles, and intention bubbles.
 * Meet bubble takes priority over intention bubble for the same farmer.
 */
export function pushSnapshotSprites(
  renderer: Canvas2dRenderer,
  sprites: import("../snapshot").SnapshotSprite[],
  meets: import("../snapshot").SnapshotMeet[],
  farmerPositions: Map<number, { x: number; y: number }>,
  nowMs: number = 0,
  season: Season = "spring",
): void {
  const meetFarmerIds = new Set<number>(meets.map((m) => m.farmerId));

  for (const s of sprites) {
    const { frame, bobY } = resolveFrameAndBob(s, nowMs, season);
    // Pseudo-3D height (tile units → px). z=0/undefined keeps the exact grounded behaviour.
    const zPx = s.z ? s.z * TILE : 0;
    if (s.id !== null) {
      // Drop-shadow stays on the ground (no z lift) and shrinks/fades as the sprite rises.
      // Fully gone by HEIGHT_FADE_PX so a high jump reads as airborne; clamped so it never inverts.
      const HEIGHT_FADE_PX = TILE * 3;
      const t = zPx > 0 ? Math.max(0, 1 - zPx / HEIGHT_FADE_PX) : 1;
      if (t > 0) {
        renderer.pushShadow(s.x, s.y + TILE * 0.35, TILE * 0.32 * t, TILE * 0.12 * t, 0.45 * t);
      }
    }
    renderer.push({
      x: s.x,
      y: s.y + bobY,
      ...(zPx > 0 ? { z: zPx } : {}),
      width: TILE,
      height: TILE,
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
        layer: 89, // below meet bubble (90) so meet always wins visually
        alpha: 1,
      });
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
