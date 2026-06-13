import type { GameEntity } from "../../components";
import { recordReason } from "../../components";
import { PORTS, isPortDockTile, nearestPort, portAtDockTile, type Port } from "../../world/ports";

export function deliberatePortHop(
  farmer: GameEntity,
  period: number,
  priority: number,
  apFloor: number,
): void {
  if (!farmer.intentions || !farmer.beliefs || !farmer.farmer || !farmer.ap || !farmer.transform) return;

  if (farmer.intentions.queue.some((i) => i.kind === "board-boat" || i.kind === "return-to-shore")) {
    return;
  }

  const day = (farmer.beliefs.data.currentDay as number | undefined) ?? 0;
  const fx = Math.round(farmer.transform.x);
  const fy = Math.round(farmer.transform.y);
  const aboard = farmer.farmer.aboard === true;
  const onPortDock = isPortDockTile(fx, fy);

  const targetId = resolveTarget(farmer, day, fx, fy);
  const target = PORTS.find((p) => p.id === targetId);

  if (aboard) {
    if (!target) {

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

  if (day === 0) return;
  if (day % period !== 0) return;
  if (farmer.ap.current < apFloor) return;
  if (!target) return;

  if (onPortDock) {
    farmer.intentions.queue.push({ kind: "board-boat", data: {}, priority });
    recordReason(farmer, `board boat for ${target.id} (day ${day})`);
    return;
  }

  const start = nearestPort(fx, fy);
  farmer.intentions.queue.push({
    kind: "travel",
    data: { targetTile: { x: start.dock.x, y: start.dock.y } },
    priority,
  });
  recordReason(farmer, `walk to ${start.id} for a boat trip (day ${day})`);
}

function pickTarget(fx: number, fy: number): Port {
  const near = nearestPort(fx, fy);
  const i = PORTS.findIndex((p) => p.id === near.id);
  return PORTS[(i + 1) % PORTS.length]!;
}

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
