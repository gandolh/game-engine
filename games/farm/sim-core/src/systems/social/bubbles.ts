

import type { SimContext, System, World, Rng } from "@engine/core";
import type { GameEntity } from "../../components";
import { ONT_SIMULATION } from "../../protocols";
import { getRegion, isWalkable, regionAt, FISHING_ISLE_IDS } from "../../world/regions";

export const BUBBLE_COUNT = 5;

function ringTilesFor(isleId: (typeof FISHING_ISLE_IDS)[number]): Array<{ x: number; y: number }> {
  const b = getRegion(isleId).bounds;
  const out: Array<{ x: number; y: number }> = [];
  // Organic masks: the isle perimeter is no longer the bounds rect. A candidate
  // ocean tile (non-walkable) belongs to the ring if any of its 4 neighbours is
  // a LAND tile of this isle. Walk the expanded bounds, y-outer then x-inner for
  // a deterministic order.
  const isIsleLand = (x: number, y: number): boolean => regionAt(x, y) === isleId;
  for (let y = b.minY - 1; y <= b.maxY + 1; y++) {
    for (let x = b.minX - 1; x <= b.maxX + 1; x++) {
      if (isWalkable(x, y)) continue; // only ocean tiles can hold a fishing spot

      const touchesIsle =
        isIsleLand(x - 1, y) || isIsleLand(x + 1, y) ||
        isIsleLand(x, y - 1) || isIsleLand(x, y + 1);
      if (touchesIsle) out.push({ x, y });
    }
  }
  return out;
}

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

    for (const e of this.world.query("fishingSpot")) this.world.despawn(e);

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
