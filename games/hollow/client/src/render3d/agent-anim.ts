/**
 * Render-clock agent animation (chunk hollow-09b) — walk-cycle phase, facing,
 * and the per-instance model-matrix assembly. Everything in this module
 * reads ONLY the RENDER clock (`performance.now()`, passed in as `nowMs` —
 * never read directly here so it stays pure/testable) plus the render-side
 * interpolated agent positions from `interp.ts` — never sim state, never
 * `Math.random` (see CLAUDE.md's sim/render boundary + determinism notes).
 * Per-agent variation (walk-phase offset, so a crowd isn't in lockstep) comes
 * from `humanoid.ts`'s deterministic `hashAgentId`, not randomness.
 */
import { multiply, rotationZ, scaling, translation, type Mat4, type Vec3 } from "@engine/core/render3d";
import type { InterpPos } from "./interp";
import { hashAgentId, poseForAction, type PoseKey } from "./humanoid";

// ---------------------------------------------------------------------------
// Walk-cycle phase
// ---------------------------------------------------------------------------

/** Stride cadence, in full gait cycles per second. */
const WALK_HZ = 1.6;

/** Deterministic per-agent phase offset in `[0, 1)` — NOT random (see
 *  `hashAgentId`'s doc) — so a crowd of walking agents doesn't step in
 *  lockstep. */
function phaseOffsetFor(agentId: number): number {
  return (hashAgentId(agentId) % 10000) / 10000;
}

/** This agent's fractional position within its walk cycle at `nowMs`, in
 *  `[0, 1)`. Pure; deterministic for a given `(nowMs, agentId)` pair. */
export function walkPhase(nowMs: number, agentId: number): number {
  const t = (nowMs / 1000) * WALK_HZ + phaseOffsetFor(agentId);
  return t - Math.floor(t);
}

/** Which of the two stride-phase variant meshes to show right now. */
export function gaitPoseFor(nowMs: number, agentId: number): PoseKey {
  return walkPhase(nowMs, agentId) < 0.5 ? "walkA" : "walkB";
}

const BOB_AMPLITUDE = 0.05;

/** A gentle vertical bob for a walking agent — two bounces per full stride
 *  (one per footfall), bounded to `[0, BOB_AMPLITUDE]`. Pure. */
export function walkBob(nowMs: number, agentId: number): number {
  const phase = walkPhase(nowMs, agentId);
  return Math.abs(Math.sin(phase * Math.PI * 2)) * BOB_AMPLITUDE;
}

/**
 * The pose an agent should be drawn in RIGHT NOW: the gait pose while moving
 * (or while the sim's coarse `action` label says `"walk"`, even if this
 * particular render frame's interpolated delta happens to read as
 * stationary — e.g. blocked/at a tile boundary), otherwise the static pose
 * for its current action (`humanoid.ts`'s `poseForAction`).
 */
export function poseForAgent(action: string, moving: boolean, nowMs: number, agentId: number): PoseKey {
  if (moving || action === "walk") return gaitPoseFor(nowMs, agentId);
  return poseForAction(action);
}

// ---------------------------------------------------------------------------
// Facing
// ---------------------------------------------------------------------------

/** Squared grid-distance below which a frame-to-frame position delta is
 *  treated as "not actually moving" (float/interpolation noise, not a real
 *  step) — small relative to a single tile. */
const MOVE_EPS_SQ = 1e-6;

export interface FacingResult {
  /** World-space yaw, radians — `0` means facing local +x (see
   *  `humanoid.ts`'s header for the local-forward convention). */
  readonly facing: number;
  readonly moving: boolean;
}

/**
 * Pure: derive this frame's facing + moving flag from a previous and next
 * interpolated position (or `undefined` `prev` for a never-before-seen
 * agent — e.g. just born, or the very first frame) and the agent's last
 * known facing. A still (or brand-new) agent KEEPS its last facing rather
 * than snapping to some arbitrary default.
 */
export function computeFacing(prev: InterpPos | undefined, next: InterpPos, lastFacing: number): FacingResult {
  if (!prev) return { facing: lastFacing, moving: false };
  const dx = next.x - prev.x;
  const dy = next.y - prev.y;
  if (dx * dx + dy * dy <= MOVE_EPS_SQ) return { facing: lastFacing, moving: false };
  return { facing: Math.atan2(dy, dx), moving: true };
}

/** Stateful (render-only) per-agent facing tracker — call `update` once per
 *  agent per render frame with its CURRENT interpolated position. Keeps a
 *  small `Map<id, ...>` of each agent's last position/facing across frames
 *  so a still agent keeps its last heading instead of resetting. */
export class AgentFacingTracker {
  private readonly lastPos = new Map<number, InterpPos>();
  private readonly lastFacing = new Map<number, number>();

  update(agentId: number, pos: InterpPos): FacingResult {
    const prev = this.lastPos.get(agentId);
    const result = computeFacing(prev, pos, this.lastFacing.get(agentId) ?? 0);
    this.lastFacing.set(agentId, result.facing);
    this.lastPos.set(agentId, pos);
    return result;
  }

  /** Drop tracked state for agents no longer present (despawned) — call
   *  once per frame with the current alive id set to bound memory over a
   *  long play session. */
  prune(aliveIds: ReadonlySet<number>): void {
    for (const id of this.lastPos.keys()) {
      if (!aliveIds.has(id)) {
        this.lastPos.delete(id);
        this.lastFacing.delete(id);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Model-matrix assembly
// ---------------------------------------------------------------------------

export interface AgentModelInputs {
  readonly pos: { readonly x: number; readonly y: number };
  /** Terrain height under the agent's feet (`groundHeightAt`), world-space z. */
  readonly groundZ: number;
  /** World-space yaw, radians (0 = local forward, +x). */
  readonly facing: number;
  /** Heritable height gene (`HollowAppearanceSnapshot.height`) — scales z. */
  readonly heightGene: number;
  /** Heritable build gene (`HollowAppearanceSnapshot.build`) — scales x/y. */
  readonly buildGene: number;
  /** Life-stage overall multiplier (`stageScale(agent.stage)`). */
  readonly stageScale: number;
  /** Extra world-z offset added on top of `groundZ` (the walk-cycle bob;
   *  `0` for a stationary agent). */
  readonly bobOffset: number;
}

/**
 * Compose one agent's per-instance model matrix: `translation * rotationZ *
 * scaling`, applied right-to-left to a local-space vertex (scale first, then
 * rotate to face `facing`, then translate to world position) — the standard
 * column-vector TRS order. Because the humanoid mesh's feet sit at local
 * z = 0 (see `humanoid.ts`'s `buildHumanoid`), and neither scaling nor a
 * z-axis rotation moves a z=0 point off the z=0 plane, every foot vertex
 * lands at world z = `groundZ + bobOffset` EXACTLY, regardless of x/y
 * position or facing — this is what places feet on the terrain.
 */
export function agentModelMatrix(inputs: AgentModelInputs): Mat4 {
  const { pos, groundZ, facing, heightGene, buildGene, stageScale, bobOffset } = inputs;
  const scaleVec: Vec3 = [buildGene * stageScale, buildGene * stageScale, heightGene * stageScale];
  return multiply(translation([pos.x, pos.y, groundZ + bobOffset]), multiply(rotationZ(facing), scaling(scaleVec)));
}
