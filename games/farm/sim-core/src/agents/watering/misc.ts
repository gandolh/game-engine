import type { GameEntity } from "../../components";
import { recordReason } from "../../components";
import { isLingeringAtFestival } from "./social";

export function deliberateSleep(farmer: GameEntity): void {
  if (!farmer.intentions || !farmer.farmer) return;

  if (farmer.farmer.aboard) return;
  const phase = farmer.beliefs?.data.phase as string | undefined;

  if (phase !== "evening" && phase !== "work") return;

  // Festival-day linger (2026-07-16 brief: festival-day priority bump): don't
  // pull a farmer who has reached the podium back home mid-festival — see
  // isLingeringAtFestival's doc comment in social.ts for why this was needed
  // (deliberateFestivalGather alone can't prevent the eviction; it only
  // controls the trip THERE).
  if (isLingeringAtFestival(farmer)) return;

  const homeRegion = farmer.farmer.homeRegion;
  if (!homeRegion) return;
  if (farmer.farmer.currentRegion === homeRegion && !farmer.farmer.path) return;

  if (farmer.intentions.queue.some(i => i.kind === "travel" && i.data.targetRegionId === homeRegion)) return;

  farmer.intentions.queue.push({
    kind: "travel",
    data: { targetRegionId: homeRegion },
    priority: -1, 
  });
  recordReason(farmer, `head home (${phase})`);
}
