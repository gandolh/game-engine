import type { GameEntity } from "../../components";
import { recordReason } from "../../components";
import { CORAL_REEFS, isCoralReefTile, isDockTile, nearestReef } from "../../world/coral";

/**
 * brief 48 — discretionary coral-fishing trip. Every `period` days a farmer with
 * spare AP rows out to a coral reef and lands a few high-value special fish
 * (coral-trout / the rare lobster), unavailable from shore. The premium
 * (coral-trout=12g, lobster=20g vs salmon=5g) is the payoff that justifies the
 * boat trip's travel time + AP — so this is a real per-personality choice.
 *
 * Like shore fishing, the trip is NOT a linear script. Each deliberation cycle
 * emits the SINGLE next phase based on the farmer's current (aboard, tile)
 * state, and re-deliberation on arrival / after a cast chains the phases:
 *
 *   on foot,  not at dock   → travel to the nearest dock (LAND grid)
 *   on foot,  at the dock   → board-boat (instant; aboard=true)
 *   aboard,   not at reef    → travel to the reef (BOAT grid: water lane)
 *   aboard,   at the reef    → fish-coral × `casts`
 *   aboard,   at the reef,    (after casting, the farmer heads home next trip's
 *             done casting     deliberation once AP is spent — return-to-shore
 *                              fires when she's back at a dock; see below)
 *   aboard,   back at dock    → return-to-shore (instant; aboard=false)
 *
 * Crucially board-boat and the reef-travel are emitted on SEPARATE cycles (never
 * the same tick) — board-boat flips `aboard`, and only the NEXT deliberation
 * (now aboard) routes onto the boat grid. Emitting both at once would no-op the
 * travel (TravelSystem read aboard=false at tick start).
 *
 * Deterministic: gated purely on day + AP + position. `apFloor` lets a
 * personality require more headroom (a conservative only goes when very free).
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

  // ── Aboard: finish/abandon the current trip. This runs REGARDLESS of the
  // period/AP gate so a farmer is NEVER stranded aboard once the trip's done
  // (or AP runs out). She keeps fishing only while AP + period still permit.
  if (aboard) {
    // Per-trip cast cap: once this day's coral casts are queued, the trip is
    // "done" and the farmer rows home — so a single trip lands ~`casts` specials
    // and doesn't loop the whole day draining AP. Tracked in beliefs keyed by
    // day (deterministic; reset implicitly when the day changes).
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
    // Dock is BOTH ends of the aboard journey, so disambiguate by tripStillWorth:
    //   just boarded + trip worth → row OUT to the reef;
    //   trip over / aborted       → step off (return-to-shore).
    const reef = nearestReef(fx, fy) ?? CORAL_REEFS[0]!;
    if (onDock && tripStillWorth) {
      // Just boarded at the dock and the trip's on → head out to the reef.
      farmer.intentions.queue.push({
        kind: "travel",
        data: { targetTile: { x: reef.reef.x, y: reef.reef.y } },
        priority,
      });
      recordReason(farmer, `row out to coral reef (day ${day})`);
      return;
    }
    if (onDock) {
      // Back at the dock, trip over/aborted → step off.
      farmer.intentions.queue.push({ kind: "return-to-shore", data: {}, priority });
      recordReason(farmer, `return to shore (day ${day})`);
      return;
    }
    // In open water (mid-lane, or done casting at the reef) → row to the reef if
    // the trip's still on, else back to the dock. dock/reef share an x.
    const target = onReef || !tripStillWorth ? reef.dock : reef.reef;
    farmer.intentions.queue.push({
      kind: "travel",
      data: { targetTile: { x: target.x, y: target.y } },
      priority,
    });
    return;
  }

  // ── On foot: only START a trip on a period day with comfortable AP headroom
  // (the round trip is pricey — don't starve core farm work).
  if (day === 0) return; // settle in first
  if (day % period !== 0) return;
  if (farmer.ap.current < apFloor) return;
  if (!hasRod) return;

  if (onDock) {
    // At the dock on foot → board (next cycle, now aboard, rows to the reef).
    farmer.intentions.queue.push({ kind: "board-boat", data: {}, priority });
    recordReason(farmer, `board boat at dock (day ${day})`);
    return;
  }
  // On land, not at a dock → walk to the nearest reef's dock. We give the trip a
  // WINNING (low) priority so the dock travel claims queue[0] over routine farm
  // work — the "committed excursion" pattern (brief 42); a low-priority travel
  // always loses to the farm loop and the feature stays dormant otherwise.
  const reef = nearestReef(fx, fy);
  farmer.intentions.queue.push({
    kind: "travel",
    data: { targetTile: { x: reef.dock.x, y: reef.dock.y } },
    priority,
  });
  recordReason(farmer, `row to coral reef — special fish worth the trip, deadline-free (day ${day})`);
}
