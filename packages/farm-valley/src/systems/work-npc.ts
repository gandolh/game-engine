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
    npc.timer = STEP_TICKS;

    // Step one tile toward the station (Manhattan: x first, then y).
    const dx = station.tileX - transform.x;
    const dy = station.tileY - transform.y;
    if (dx !== 0) {
      transform.x += Math.sign(dx);
    } else if (dy !== 0) {
      transform.y += Math.sign(dy);
    }

    // Arrived?
    if (transform.x === station.tileX && transform.y === station.tileY) {
      npc.phase = "working";
      npc.timer = DWELL_TICKS;
      npc.facing = station.facing;
      npc.flipX = station.flipX;
    }
    return;
  }

  // phase === "working": face the prop, play the pose, dwell.
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

  // Advance to the next station and start walking.
  npc.stationIndex = (npc.stationIndex + 1) % npc.stations.length;
  npc.phase = "walking";
  npc.timer = STEP_TICKS;
  npc.poseFrame = npc.idlePose;
}
