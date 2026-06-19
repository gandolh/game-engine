import type { SimContext, System, World } from "@engine/core";
import type { GameEntity, WorkNpc } from "../../components";

const STEP_TICKS = 4;

const DWELL_TICKS = 90; 

function scaled(base: number, busyFactor: number | undefined): number {
  const f = busyFactor ?? 1;
  const clamped = f < 0.25 ? 0.25 : f > 4 ? 4 : f;
  return Math.max(1, Math.round(base * clamped));
}

export class WorkNpcSystem implements System {
  readonly name = "WorkNpcSystem";

  constructor(private readonly world: World<GameEntity>) {}

  run(_ctx: SimContext): void {
    for (const e of this.world.query("workNpc", "transform")) {
      step(e.workNpc, e.transform);
    }
  }
}

function step(npc: WorkNpc, transform: GameEntity["transform"]): void {
  if (!transform || npc.stations.length === 0) return;
  const station = npc.stations[npc.stationIndex]!;

  if (npc.phase === "walking") {

    npc.poseFrame = npc.idlePose;
    npc.timer -= 1;
    if (npc.timer > 0) return;
    npc.timer = scaled(STEP_TICKS, npc.busyFactor);

    const dx = station.tileX - transform.x;
    const dy = station.tileY - transform.y;
    if (dx !== 0) {
      transform.x += Math.sign(dx);
    } else if (dy !== 0) {
      transform.y += Math.sign(dy);
    }

    if (transform.x === station.tileX && transform.y === station.tileY) {
      npc.phase = "working";
      npc.timer = scaled(DWELL_TICKS, npc.busyFactor);
      npc.facing = station.facing;
      npc.flipX = station.flipX;
    }
    return;
  }

  npc.facing = station.facing;
  npc.flipX = station.flipX;
  if (station.pose) {

    const phaseBit = Math.floor(npc.timer / 8) & 1;
    npc.poseFrame = `${station.pose}-${phaseBit ? "a" : "b"}`;
  } else {

    npc.poseFrame = npc.idlePose;
  }

  npc.timer -= 1;
  if (npc.timer > 0) return;

  npc.stationIndex = (npc.stationIndex + 1) % npc.stations.length;
  npc.phase = "walking";
  npc.timer = scaled(STEP_TICKS, npc.busyFactor);
  npc.poseFrame = npc.idlePose;
}
