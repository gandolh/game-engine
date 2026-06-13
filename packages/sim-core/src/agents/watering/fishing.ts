import type { GameEntity } from "../../components";
import { recordReason } from "../../components";
import { isFishingIsle } from "../../world/regions";
import { FISHING_CAST_TILES } from "./shared";

export function deliberateFishing(
  farmer: GameEntity,
  period: number,
  casts: number,
  priority: number,
): void {
  if (!farmer.intentions || !farmer.beliefs || !farmer.farmer || !farmer.ap) return;
  const day = (farmer.beliefs.data.currentDay as number | undefined) ?? 0;
  if (day === 0) return;
  if (day % period !== 0) return;
  if (farmer.ap.current < 30) return;
  if (farmer.intentions.queue.some((i) => i.kind === "fish")) return;
  if (!(farmer.inventory?.tools ?? []).some((t) => t.kind === "fishing-rod")) return;

  if (!isFishingIsle(farmer.farmer.currentRegion ?? null)) {
    if (!farmer.intentions.queue.some((i) => i.kind === "travel" && i.data.targetTile)) {
      const t = farmer.transform;
      const cast = t
        ? [...FISHING_CAST_TILES].sort(
            (a, b) =>
              (Math.abs(a.x - t.x) + Math.abs(a.y - t.y)) -
              (Math.abs(b.x - t.x) + Math.abs(b.y - t.y)),
          )[0]!
        : FISHING_CAST_TILES[0]!;
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
