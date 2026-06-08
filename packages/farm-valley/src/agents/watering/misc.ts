import type { GameEntity } from "../../components";
import { recordReason } from "../../components";

export function deliberateSleep(farmer: GameEntity): void {
  if (!farmer.intentions || !farmer.farmer) return;
  // brief 48 — an aboard farmer can only path on the boat grid (water lanes),
  // which has no route to a land home region. Don't queue a sail-home that would
  // just fail to path; the coral-trip deliberation always steers an aboard
  // farmer back to the dock first, where she disembarks and then sleeps on land.
  if (farmer.farmer.aboard) return;
  const phase = farmer.beliefs?.data.phase as string | undefined;
  // Only queue during evening (or work if already late).
  if (phase !== "evening" && phase !== "work") return;
  const homeRegion = farmer.farmer.homeRegion;
  if (!homeRegion) return;
  if (farmer.farmer.currentRegion === homeRegion && !farmer.farmer.path) return;
  // Don't double-queue home travel.
  if (farmer.intentions.queue.some(i => i.kind === "travel" && i.data.targetRegionId === homeRegion)) return;

  farmer.intentions.queue.push({
    kind: "travel",
    data: { targetRegionId: homeRegion },
    priority: -1, // higher than everything else
  });
  recordReason(farmer, `head home (${phase})`);
}
