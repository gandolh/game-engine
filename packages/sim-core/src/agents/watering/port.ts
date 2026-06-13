import type { GameEntity } from "../../components";
import { recordReason } from "../../components";
import { PORTS, isPortDockTile, nearestPort, portAtDockTile, type Port } from "../../world/ports";

/**
 * Discretionary port-hop: a light, periodic boat trip to a neighbouring port
 * island (the world feels alive). Reuses the boat substrate (`aboard` flag +
 * boatGrid + board-boat/return-to-shore acts) — same machinery as coral fishing,
 * just port→port instead of dock→reef→dock.
 *
 * Phase machine (one phase per deliberation cycle; board flips `aboard`, travel
 * reads it next tick):
 *   on foot, away from any port      → travel to nearest port dock
 *   on foot, at a port dock          → board-boat
 *   aboard, not at the target dock   → travel to the target port dock
 *   aboard, at the target dock       → return-to-shore (disembark)
 *
 * Deterministic: target port is chosen by a fixed rule (next port in PORTS order
 * after the nearest), gated on day-period + AP + position. No randomness.
 */
export function deliberatePortHop(
  farmer: GameEntity,
  period: number,
  priority: number,
  apFloor: number,
): void {
  if (!farmer.intentions || !farmer.beliefs || !farmer.farmer || !farmer.ap || !farmer.transform) return;
  // Don't re-plan a hop step while a board/disembark is already queued.
  if (farmer.intentions.queue.some((i) => i.kind === "board-boat" || i.kind === "return-to-shore")) {
    return;
  }

  const day = (farmer.beliefs.data.currentDay as number | undefined) ?? 0;
  const fx = Math.round(farmer.transform.x);
  const fy = Math.round(farmer.transform.y);
  const aboard = farmer.farmer.aboard === true;
  const onPortDock = isPortDockTile(fx, fy);

  // Resolve / persist the trip target across cycles (beliefs-tracked by day).
  const targetId = resolveTarget(farmer, day, fx, fy);
  const target = PORTS.find((p) => p.id === targetId);

  // ---- Aboard: row to the target dock, then disembark. Runs unconditionally so
  //      a farmer is never stranded mid-water if AP runs out. ----
  if (aboard) {
    if (!target) {
      // No target (shouldn't happen) — disembark at the nearest dock if on one.
      if (onPortDock) farmer.intentions.queue.push({ kind: "return-to-shore", data: {}, priority });
      return;
    }
    const atTarget = portAtDockTile(fx, fy)?.id === target.id;
    if (atTarget) {
      farmer.intentions.queue.push({ kind: "return-to-shore", data: {}, priority });
      clearTrip(farmer);
      recordReason(farmer, `arrive at ${target.id}, disembark (day ${day})`);
      return;
    }
    farmer.intentions.queue.push({
      kind: "travel",
      data: { targetTile: { x: target.dock.x, y: target.dock.y } },
      priority,
    });
    recordReason(farmer, `sail to ${target.id} (day ${day})`);
    return;
  }

  // ---- On foot: only START a hop on the gated cadence. ----
  if (day === 0) return;
  if (day % period !== 0) return;
  if (farmer.ap.current < apFloor) return;
  if (!target) return;

  if (onPortDock) {
    farmer.intentions.queue.push({ kind: "board-boat", data: {}, priority });
    recordReason(farmer, `board boat for ${target.id} (day ${day})`);
    return;
  }

  // Walk (on foot, land grid) to the nearest port dock to embark.
  const start = nearestPort(fx, fy);
  farmer.intentions.queue.push({
    kind: "travel",
    data: { targetTile: { x: start.dock.x, y: start.dock.y } },
    priority,
  });
  recordReason(farmer, `walk to ${start.id} for a boat trip (day ${day})`);
}

/** A port other than the one nearest the farmer — the next in PORTS order, wrapping. */
function pickTarget(fx: number, fy: number): Port {
  const near = nearestPort(fx, fy);
  const i = PORTS.findIndex((p) => p.id === near.id);
  return PORTS[(i + 1) % PORTS.length]!;
}

/** Persist the chosen target for the duration of the trip so it doesn't flip
 *  mid-hop as the farmer's nearest port changes. Keyed by day in beliefs. */
function resolveTarget(farmer: GameEntity, day: number, fx: number, fy: number): Port["id"] {
  const b = farmer.beliefs!.data;
  const tripDay = b["portHopDay"] as number | undefined;
  const tripTarget = b["portHopTarget"] as Port["id"] | undefined;
  if (tripDay === day && tripTarget) return tripTarget;
  const t = pickTarget(fx, fy).id;
  b["portHopDay"] = day;
  b["portHopTarget"] = t;
  return t;
}

function clearTrip(farmer: GameEntity): void {
  delete farmer.beliefs!.data["portHopDay"];
  delete farmer.beliefs!.data["portHopTarget"];
}
