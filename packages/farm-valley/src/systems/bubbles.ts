/**
 * BubbleSystem — manages the drifting "bubble spots" around the fishing isle.
 *
 * A bubble is a transient patch of churning water (rising fish) on a NON-walkable
 * ocean tile in the ring immediately around the fishing isle. Casting into a
 * bubble tile (from the isle edge) skews the catch toward rarer fish; plain
 * ocean skews to minnows (see ActSystem.handleFish).
 *
 * Each new day the system clears the previous day's bubbles and re-rolls a fresh
 * set on random ring tiles, so the spots visibly drift day to day. Deterministic
 * via the seeded Rng (mirrors TileFeatureSystem's day-triggered, shuffle-based
 * spawn). Determinism depends only on the day index + seed.
 */

import type { SimContext, System, World, Rng } from "@engine/core";
import type { GameEntity } from "../components";
import { ONT_SIMULATION } from "../protocols";
import { getRegion, isWalkable, FISHING_ISLE_IDS } from "../world/regions";

/** How many bubbles drift around EACH fishing isle at once. */
export const BUBBLE_COUNT = 5;

/**
 * Ocean tiles in the 1-tile ring just outside one fishing isle's bounds. These
 * are the fishable bubble candidates: non-walkable (ocean) and adjacent to a
 * walkable isle edge tile, so a farmer on the isle can cast into them.
 */
function ringTilesFor(isleId: (typeof FISHING_ISLE_IDS)[number]): Array<{ x: number; y: number }> {
  const b = getRegion(isleId).bounds;
  const out: Array<{ x: number; y: number }> = [];
  for (let y = b.minY - 1; y <= b.maxY + 1; y++) {
    for (let x = b.minX - 1; x <= b.maxX + 1; x++) {
      // Skip the isle interior/edge itself — only the surrounding ring.
      if (x >= b.minX && x <= b.maxX && y >= b.minY && y <= b.maxY) continue;
      if (isWalkable(x, y)) continue; // must be ocean (the bridge tiles are walkable → skipped)
      // Must touch at least one walkable isle tile (so it's castable from shore).
      const touchesIsle =
        (x >= b.minX && x <= b.maxX && (y === b.minY - 1 || y === b.maxY + 1)) ||
        (y >= b.minY && y <= b.maxY && (x === b.minX - 1 || x === b.maxX + 1));
      if (touchesIsle) out.push({ x, y });
    }
  }
  return out;
}

/** Per-isle candidate rings, computed once (the isles never move). */
function bubbleRingsByIsle(): ReadonlyArray<ReadonlyArray<{ x: number; y: number }>> {
  return FISHING_ISLE_IDS.map((id) => ringTilesFor(id));
}

export class BubbleSystem implements System {
  readonly name = "BubbleSystem";
  private lastDayProcessed = -1;
  private readonly rings = bubbleRingsByIsle();
  private readonly rng: Rng;

  constructor(
    private readonly world: World<GameEntity>,
    rng: Rng,
  ) {
    this.rng = rng.fork("bubbles");
  }

  run(_ctx: SimContext): void {
    // Trigger once per new day (same DAY_START snoop pattern as TileFeatureSystem).
    let newDay: number | null = null;
    for (const station of this.world.query("weatherStation", "inbox")) {
      for (const msg of station.inbox.messages) {
        if (msg.ontology === ONT_SIMULATION.DAY_START) {
          const day = (msg.body as { day: number }).day;
          if (day > this.lastDayProcessed) newDay = day;
        }
      }
      break;
    }
    if (newDay === null) return;
    this.lastDayProcessed = newDay;

    // Clear yesterday's bubbles.
    for (const e of this.world.query("fishingSpot")) {
      this.world.despawn(e);
    }

    // Re-roll BUBBLE_COUNT fresh bubbles around EACH isle. Rings are processed
    // in a fixed order (FISHING_ISLE_IDS) so the rng draws stay deterministic.
    for (const ring of this.rings) {
      if (ring.length === 0) continue;
      const pool = ring.slice();
      for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(this.rng.nextFloat() * (i + 1));
        const a = pool[i]!;
        const b = pool[j]!;
        pool[i] = b;
        pool[j] = a;
      }
      const n = Math.min(BUBBLE_COUNT, pool.length);
      for (let i = 0; i < n; i++) {
        const t = pool[i]!;
        this.world.spawn({
          transform: { x: t.x, y: t.y, prevX: t.x, prevY: t.y, rotation: 0 },
          sprite: { atlasId: "main", frame: "structure/fishing-spot", layer: 4, tintRgba: 0xffffffff },
          fishingSpot: { isFishingSpot: true, tileX: t.x, tileY: t.y },
        });
      }
    }
  }
}
