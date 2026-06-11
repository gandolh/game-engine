import type { SimContext, System, World } from "@engine/core";
import type { GameEntity, WorkNpc } from "../components";

/**
 * Drives the craft NPCs (blacksmith, carpenter) around their props for ambient
 * life: walk one tile per few ticks toward the current station, then dwell there
 * playing the station's two-frame pose, then advance to the next station.
 *
 * Purely cosmetic. Deterministic on the sim tick (no wall-clock, no RNG), so it
 * doesn't affect sim outcomes — but it lives in the sim worker because the
 * NPC's `transform` is what the snapshot/interpolation pipeline reads, and we
 * want movement to flow through the same prev/next interpolation as farmers
 * (which also gives us facing-from-movement for free).
 */

/** Ticks between one-tile walk steps (matches farmer travel cadence feel). */
const STEP_TICKS = 4;
/** Ticks an NPC dwells at a station playing its pose before moving on. */
const DWELL_TICKS = 90; // ~4.5s at 20 Hz

/**
 * Scale a base cadence by the NPC's busyFactor (set by NpcDeliberateSystem):
 * <1 shortens it (busier), >1 lengthens it (idle). Clamped + integer-rounded so
 * the patrol stays deterministic and never degenerates to 0 ticks. Missing
 * factor → baseline (1).
 */
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
    // Idle figure while walking (never the building sprite).
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
    // Two-frame swing, ~5 frames per pose (toggle every 8 ticks).
    const phaseBit = Math.floor(npc.timer / 8) & 1;
    npc.poseFrame = `${station.pose}-${phaseBit ? "a" : "b"}`;
  } else {
    // No swing pose at this station (e.g. the oven) — stand idle, don't revert
    // to the building sprite.
    npc.poseFrame = npc.idlePose;
  }

  npc.timer -= 1;
  if (npc.timer > 0) return;

  npc.stationIndex = (npc.stationIndex + 1) % npc.stations.length;
  npc.phase = "walking";
  npc.timer = scaled(STEP_TICKS, npc.busyFactor);
  npc.poseFrame = npc.idlePose;
}
