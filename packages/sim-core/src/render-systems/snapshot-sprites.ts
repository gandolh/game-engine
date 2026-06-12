import type { RendererLike } from "@engine/core";
import type { Season } from "../protocols/weather";
import { frameToAtlasId, resolveFrameAndBob } from "./frames";

const TILE = 16;

// ── Foliage wind-sway (brief 16) ─────────────────────────────────────────────
//
// Which frames sway: crops (prefix "crop/"), world trees (prefix "structure/tree"
// or "structure/fruit-tree"), and bushes ("structure/bush", "decoration/bush").
// Farmers, NPCs, buildings, UI, water tiles, and particles are rigid (amp 0).
//
// swayAmp is the peak horizontal displacement at the sprite's top edge (world px).
// Subtle at typical zoom 2: crops ~0.5 px, tree canopies ~1.0 px.
//
// swayPhase: deterministic from tile position so every plant has a unique, stable
// phase with NO Math.random(). Hash: (tx * 2654435761 ^ ty * 2246822519) & 0x7fffffff
// mapped to [0, 2π). The large primes scatter phases across the grid without repeat.

function foliageSway(
  frame: string,
  wx: number,
  wy: number,
): { swayAmp: number; swayPhase: number } | undefined {
  const tx = Math.floor(wx / TILE);
  const ty = Math.floor(wy / TILE);
  // Integer hash → [0, 2π) — bitwise truncation keeps it inside 32-bit range.
  const hash = ((Math.imul(tx, 2654435761) ^ Math.imul(ty, 2246822519)) >>> 0);
  const phase = (hash / 0x100000000) * (Math.PI * 2);

  if (frame.startsWith("crop/")) {
    return { swayAmp: 0.5, swayPhase: phase };
  }
  if (
    frame === "structure/tree" ||
    frame === "structure/tree-autumn" ||
    frame === "structure/tree-bare" ||
    frame.startsWith("structure/fruit-tree") ||
    frame === "structure/bush" ||
    frame === "decoration/bush"
  ) {
    return { swayAmp: 1.0, swayPhase: phase };
  }
  return undefined;
}

/**
 * Push dynamic snapshot sprites, meet bubbles, and intention bubbles.
 * Meet bubble takes priority over intention bubble for the same farmer.
 */
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
    // Apply sway to static foliage only (never to farmers, NPCs, or animated entities).
    // Farmer/NPC frames start with "farmer/" or "npc/"; any other frame is a candidate.
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
