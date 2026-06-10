/**
 * render-systems/snapshot-sprites.ts — push snapshot (dynamic) sprites into
 * the renderer each frame.
 */

import { Canvas2dRenderer } from "@engine/core";
import type { Season } from "../protocols/weather";
import { frameToAtlasId, resolveFrameAndBob } from "./frames";

const TILE = 16;

/**
 * Push snapshot sprites (dynamic layer from the sim worker) into the renderer.
 * Each SnapshotSprite is already in pixel space and has alpha pre-computed.
 * Width/height default to TILE (16) for all snapshot sprites.
 *
 * This also draws:
 *  - MEET bubble (indicator/meet) sprites above each active meet farmer.
 *  - INTENTION bubble (indicator/intention-*) above each AI farmer for the
 *    brief window after an intention change. If a meet bubble and an intention
 *    bubble would both appear for the same farmer, the meet bubble takes
 *    priority (higher signal moment) and the intention bubble is suppressed.
 *    Brief 40.
 */
export function pushSnapshotSprites(
  renderer: Canvas2dRenderer,
  sprites: import("../snapshot").SnapshotSprite[],
  meets: import("../snapshot").SnapshotMeet[],
  farmerPositions: Map<number, { x: number; y: number }>,
  nowMs: number = 0,
  season: Season = "spring",
): void {
  // Build a Set of farmer ids that have an active meet bubble, so intention
  // bubbles can be suppressed for those farmers. Brief 40.
  const meetFarmerIds = new Set<number>(meets.map((m) => m.farmerId));

  // Sprites + ground drop-shadows for characters (sprites with an entity id).
  for (const s of sprites) {
    const { frame, bobY } = resolveFrameAndBob(s, nowMs, season);
    // Shadow: small ellipse at feet (bottom edge of sprite), drawn under all sprites.
    if (s.id !== null) {
      renderer.pushShadow(s.x, s.y + TILE * 0.35, TILE * 0.32, TILE * 0.12, 0.45);
    }
    renderer.push({
      x: s.x,
      y: s.y + bobY,
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

    // Brief 40 — intention bubble. Only for AI farmers that have a bubble glyph
    // set AND are not currently showing a meet bubble (meet takes priority).
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
        layer: 89, // just below meet bubble (90) so meet always wins visually
        alpha: 1,
      });
    }
  }

  // Meet bubbles (one tile above farmer)
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
