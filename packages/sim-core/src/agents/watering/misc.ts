import type { GameEntity } from "../../components";
import { recordReason } from "../../components";

export function deliberateSleep(farmer: GameEntity): void {
  if (!farmer.intentions || !farmer.farmer) return;
  // Aboard farmers path only on water lanes — no route to home; coral deliberation steers them back to dock first.
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
