/**
 * Render-side agent animation (chunk hollow-09b) — walk-cycle phase, facing,
 * and the per-instance model-matrix assembly. The gait phase advances by the
 * ground covered (brief 27), not by the clock. Everything in this module
 * reads ONLY the render frame time (`performance.now()`, passed in as `nowMs` —
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

/**
 * Ground covered by one full gait cycle, in tiles. Measured, not guessed: the sim steps a walking
 * agent one tile (or one diagonal) per tick, and over 3 seeds x 1500 ticks x 20 agents the mean
 * interpolated distance per walking agent-tick was 1.23 tiles (1.20, 1.25, 1.25). The worker runs
 * 20 ticks per second at 1x, so a walker covers about 24.6 tiles/s, and
 * 24.6 tiles/s / 1.6 cycles/s = 15.4 tiles per cycle. At 1x this keeps the old 1.6 Hz.
 */
export const STRIDE_TILES = 15.4;

/** Cadence cap in cycles per second (owner, 2026-11-23). At 8x the ground speed asks for ~12.8 Hz,
 *  which would flicker the two gait meshes; past the cap the walker slides a little instead. */
export const MAX_GAIT_HZ = 4;

/** Longest frame step the cap trusts, in seconds, so a stalled tab doesn't spin the legs on return. */
const MAX_FRAME_DT_S = 0.25;

/** Deterministic per-agent phase offset in `[0, 1)` — NOT random (see
 *  `hashAgentId`'s doc) — so a crowd of walking agents doesn't step in
 *  lockstep. */
export function initialGaitPhase(agentId: number): number {
  return (hashAgentId(agentId) % 10000) / 10000;
}

/**
 * Pure: advance a gait phase by the ground covered this frame. `distanceTiles / STRIDE_TILES` cycles,
 * capped at `MAX_GAIT_HZ * dtSeconds`. No distance leaves the phase unchanged (a paused or blocked
 * walker holds mid-stride). Result in `[0, 1)`.
 */
export function advanceGaitPhase(phase: number, distanceTiles: number, dtSeconds: number): number {
  const dt = Math.min(Math.max(dtSeconds, 0), MAX_FRAME_DT_S);
  const cycles = Math.min(Math.max(distanceTiles, 0) / STRIDE_TILES, MAX_GAIT_HZ * dt);
  const t = phase + cycles;
  return t - Math.floor(t);
}

/** Which of the two stride-phase variant meshes to show at this gait phase. */
export function gaitPoseFor(phase: number): PoseKey {
  return phase < 0.5 ? "walkA" : "walkB";
}

const BOB_AMPLITUDE = 0.05;

/** A gentle vertical bob for a walking agent — two bounces per full stride
 *  (one per footfall), bounded to `[0, BOB_AMPLITUDE]`. Pure. */
export function walkBob(phase: number): number {
  return Math.abs(Math.sin(phase * Math.PI * 2)) * BOB_AMPLITUDE;
}

/** Stateful (render-only) per-agent gait phase, advanced by the interpolated ground each agent covers.
 *  Sits beside `AgentFacingTracker`: call `update` once per agent per frame, `prune` once per frame. */
export class AgentGaitTracker {
  private readonly lastPos = new Map<number, InterpPos>();
  private readonly phase = new Map<number, number>();
  private lastNowMs: number | undefined;
  private dtSeconds = 0;

  /** Call once per frame, before the agents' `update`s, with the render clock. */
  beginFrame(nowMs: number): void {
    this.dtSeconds = this.lastNowMs === undefined ? 0 : (nowMs - this.lastNowMs) / 1000;
    this.lastNowMs = nowMs;
  }

  update(agentId: number, pos: InterpPos): number {
    const prev = this.lastPos.get(agentId);
    const before = this.phase.get(agentId) ?? initialGaitPhase(agentId);
    const distance = prev ? Math.hypot(pos.x - prev.x, pos.y - prev.y) : 0;
    const next = advanceGaitPhase(before, distance, this.dtSeconds);
    this.phase.set(agentId, next);
    this.lastPos.set(agentId, pos);
    return next;
  }

  prune(aliveIds: ReadonlySet<number>): void {
    for (const id of this.phase.keys()) {
      if (!aliveIds.has(id)) {
        this.phase.delete(id);
        this.lastPos.delete(id);
      }
    }
  }
}

/**
 * The pose an agent should be drawn in RIGHT NOW: the gait pose while moving
 * (or while the sim's coarse `action` label says `"walk"`, even if this
 * particular render frame's interpolated delta happens to read as
 * stationary — e.g. blocked/at a tile boundary), otherwise the static pose
 * for its current action (`humanoid.ts`'s `poseForAction`).
 */
export function poseForAgent(action: string, moving: boolean, phase: number): PoseKey {
  if (moving || action === "walk") return gaitPoseFor(phase);
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
