import type { GameEntity } from "../../components";
import { recordReason } from "../../components";
import { CORAL_REEFS, isCoralReefTile, isDockTile, nearestReef } from "../../world/coral";

/**
 * Discretionary coral-fishing trip every `period` days (coral-trout=12g, lobster=20g vs salmon=5g).
 * Emits one phase per deliberation cycle (not a linear script):
 *   on foot, not at dock → travel to dock; at dock → board-boat
 *   aboard, not at reef  → travel to reef; at reef → fish-coral × casts
 *   aboard, back at dock → return-to-shore
 * board-boat and reef-travel are on SEPARATE cycles (board flips `aboard`; travel reads it next tick).
 * Deterministic: gated on day + AP + position.
 */
export function deliberateCoralFishing(
  farmer: GameEntity,
  period: number,
  casts: number,
  priority: number,
  apFloor: number,
): void {
  if (!farmer.intentions || !farmer.beliefs || !farmer.farmer || !farmer.ap || !farmer.transform) return;
  const day = (farmer.beliefs.data.currentDay as number | undefined) ?? 0;
  // Don't re-plan a coral step while one's already queued (avoids double-queue).
  if (
    farmer.intentions.queue.some(
      (i) => i.kind === "board-boat" || i.kind === "fish-coral" || i.kind === "return-to-shore",
    )
  ) {
    return;
  }

  const fx = Math.round(farmer.transform.x);
  const fy = Math.round(farmer.transform.y);
  const aboard = farmer.farmer.aboard === true;
  const onDock = isDockTile(fx, fy);
  const onReef = isCoralReefTile(fx, fy);
  const hasRod = (farmer.inventory?.tools ?? []).some((t) => t.kind === "fishing-rod");

  // Aboard logic runs unconditionally so a farmer is never stranded if AP runs out.
  if (aboard) {
    // Cast cap tracked in beliefs by day; resets implicitly when day changes.
    const castDay = farmer.beliefs.data["coralCastDay"] as number | undefined;
    const castsDone = castDay === day ? ((farmer.beliefs.data["coralCastsDone"] as number | undefined) ?? 0) : 0;
    const tripStillWorth =
      hasRod && day % period === 0 && farmer.ap.current >= apFloor && castsDone < Math.max(1, casts);
    if (onReef && tripStillWorth) {
      const n = Math.max(1, casts) - castsDone;
      for (let i = 0; i < n; i++) {
        farmer.intentions.queue.push({ kind: "fish-coral", data: {}, priority: priority + i });
      }
      farmer.beliefs.data["coralCastDay"] = day;
      farmer.beliefs.data["coralCastsDone"] = castsDone + n;
      recordReason(farmer, `fish coral reef (day ${day}, ${n} casts)`);
      return;
    }
    // Dock is both start and end of the trip; disambiguate by tripStillWorth.
    const reef = nearestReef(fx, fy) ?? CORAL_REEFS[0]!;
    if (onDock && tripStillWorth) {
      farmer.intentions.queue.push({
        kind: "travel",
        data: { targetTile: { x: reef.reef.x, y: reef.reef.y } },
        priority,
      });
      recordReason(farmer, `row out to coral reef (day ${day})`);
      return;
    }
    if (onDock) {
      farmer.intentions.queue.push({ kind: "return-to-shore", data: {}, priority });
      recordReason(farmer, `return to shore (day ${day})`);
      return;
    }
    // In open water: row to reef if trip still on, else back to dock.
    const target = onReef || !tripStillWorth ? reef.dock : reef.reef;
    farmer.intentions.queue.push({
      kind: "travel",
      data: { targetTile: { x: target.x, y: target.y } },
      priority,
    });
    return;
  }

  if (day === 0) return;
  if (day % period !== 0) return;
  if (farmer.ap.current < apFloor) return;
  if (!hasRod) return;

  if (onDock) {
    farmer.intentions.queue.push({ kind: "board-boat", data: {}, priority });
    recordReason(farmer, `board boat at dock (day ${day})`);
    return;
  }
  // Winning priority so the dock travel claims queue[0] over routine farm work.
  const reef = nearestReef(fx, fy);
  farmer.intentions.queue.push({
    kind: "travel",
    data: { targetTile: { x: reef.dock.x, y: reef.dock.y } },
    priority,
  });
  recordReason(farmer, `row to coral reef — special fish worth the trip, deadline-free (day ${day})`);
}
