import type { GameEntity } from "../../components";
import { recordReason } from "../../components";
import { isFishingIsle } from "../../world/regions";
import { FISHING_CAST_TILES } from "./shared";

/**
 * Discretionary fishing trip for AI farmers. Every `period` days a farmer with
 * spare AP heads to the fishing isle and casts a few times (each cast 1 AP +
 * a 5–30 s busy window, landing a fish for gold). Low priority so the AP pruner
 * drops it first when the day is busy — fishing is a "nothing better to do"
 * side income, not a core strategy. Bounded to `casts` per trip so it can't
 * monopolise the day. Deterministic: gated purely on day + region + AP.
 */
export function deliberateFishing(
  farmer: GameEntity,
  period: number,
  casts: number,
  priority: number,
): void {
  if (!farmer.intentions || !farmer.beliefs || !farmer.farmer || !farmer.ap) return;
  const day = (farmer.beliefs.data.currentDay as number | undefined) ?? 0;
  if (day === 0) return; // settle in first
  if (day % period !== 0) return;
  // Only fish with comfortable AP headroom (don't starve core farm work).
  if (farmer.ap.current < 30) return;
  // Don't double-queue a fishing trip.
  if (farmer.intentions.queue.some((i) => i.kind === "fish")) return;
  // Must hold a rod (everyone starts with one, but be defensive).
  if (!(farmer.inventory?.tools ?? []).some((t) => t.kind === "fishing-rod")) return;

  if (!isFishingIsle(farmer.farmer.currentRegion ?? null)) {
    if (!farmer.intentions.queue.some((i) => i.kind === "travel" && i.data.targetTile)) {
      // Head to whichever isle's cast tile is nearest (Manhattan).
      const t = farmer.transform;
      const cast = t
        ? [...FISHING_CAST_TILES].sort(
            (a, b) =>
              (Math.abs(a.x - t.x) + Math.abs(a.y - t.y)) -
              (Math.abs(b.x - t.x) + Math.abs(b.y - t.y)),
          )[0]!
        : FISHING_CAST_TILES[0];
      farmer.intentions.queue.push({
        kind: "travel",
        data: { targetTile: { x: cast.x, y: cast.y } },
        priority: priority - 1,
      });
    }
  }
  const n = Math.max(1, casts);
  for (let i = 0; i < n; i++) {
    farmer.intentions.queue.push({
      kind: "fish",
      data: {},
      priority: priority + i,
    });
  }
  recordReason(farmer, `fishing trip (day ${day}, ${n} casts)`);
}
