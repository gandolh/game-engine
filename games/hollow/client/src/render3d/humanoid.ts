/**
 * Gene-driven low-poly humanoid meshes (chunk hollow-09b) — the pure, tested
 * core of the agent renderer. Builds a small readable humanoid from
 * primitives (legs+feet, torso, arms, head, hair cap) whose SKIN, HAIR, and
 * CLOTHING colors come from three material-key strings resolved at upload
 * time, and whose POSE (a fixed hinge-angle set, no skeletal blending) comes
 * from a small `PoseKey` enum.
 *
 * THE RENDERER CONSTRAINT this works around (see the brief): one instanced
 * draw gives every instance of a mesh the SAME per-material colors — only a
 * single per-instance RGBA tint varies. So per-agent skin/hair color can't
 * come from tint alone. The scheme here is MESH VARIANTS: a distinct tiny
 * mesh is built once per (skinKey, hairKey, poseKey) combination (see
 * `variantKey`/`VariantCache` below) and cached forever; per-agent identity
 * beyond that (position, facing, height/build genes, life-stage scale, walk
 * bob) lives entirely in the per-INSTANCE model matrix (`agent-anim.ts`).
 * Clothing uses one FIXED cozy role (`CLOTH_KEY`) for every agent, so it
 * doesn't multiply the variant count — only skin x hair x pose does.
 *
 * Local mesh coordinate convention (matches the engine's ground-plane-x/y,
 * z-up convention): +x is the humanoid's OWN forward direction, +y is its
 * left side, z=0 is the ground under its feet. `agent-anim.ts`'s
 * `agentModelMatrix` rotates this local forward to the agent's world facing
 * via `rotationZ`, so `poseForAction`/pose angles below only ever need a
 * single hinge axis (rotation about local +y, i.e. `rotateY` — a forward/back
 * swing in the local x-z plane), which is all a walk-cycle or a
 * reach/raise/lean gesture needs for a "readable, cozy" low-poly read.
 *
 * Pure + deterministic throughout: no RNG, no clock — `humanoidTint`'s
 * per-agent variation is a plain integer hash of the agent id, not `Math.random`.
 */
import { box, merge, translate, rotateY, type Mesh, type Vec3, type Material } from "@engine/core/render3d";
import { SKIN_TONE_ROLES, HAIR_TONE_ROLES } from "@hollow/sim-core/components";
import { HOLLOW_PAL } from "../render/hollow-palette";
import { toFloatRgb } from "./materials";

// ---------------------------------------------------------------------------
// Agent material table — appended to a COPY of the world's material keys by
// the app (see materials.ts's header seam note); never uploaded standalone.
// ---------------------------------------------------------------------------

/** Fixed cozy clothing role shared by every agent (torso/legs/feet) — keeping
 *  clothing OFF the variant key is what keeps the variant count to
 *  skin x hair x pose instead of skin x hair x cloth x pose. */
export const CLOTH_KEY = "clay" as const;

/** Ordered agent-only material keys: the 5 skin roles + 5 hair roles (kept in
 *  lockstep with @hollow/sim-core's genome role lists — see genome.ts's header)
 *  plus the one fixed clothing role. */
export const AGENT_MATERIAL_KEYS = [...SKIN_TONE_ROLES, ...HAIR_TONE_ROLES, CLOTH_KEY] as const;

export type AgentMaterialKey = (typeof AGENT_MATERIAL_KEYS)[number];

/** The `Material[]` for the agent-only keys, in the SAME order as
 *  {@link AGENT_MATERIAL_KEYS} — the app concatenates this after
 *  `buildWorldMaterialList()`'s output before the single combined
 *  `setMaterials` call. */
export function buildAgentMaterialList(): Material[] {
  return AGENT_MATERIAL_KEYS.map((k) => ({ color: toFloatRgb(HOLLOW_PAL[k]) }));
}

// ---------------------------------------------------------------------------
// Pose set
// ---------------------------------------------------------------------------

/** The tight pose set every one of the sim's 14 action labels maps onto (via
 *  `poseForAction`), plus the two gait phases `agent-anim.ts`'s walk-cycle
 *  picks between when an agent is moving. No skeletal blending — a "pose" is
 *  simply a fixed hinge-angle set baked into its own tiny variant mesh. */
export type PoseKey = "stand" | "walkA" | "walkB" | "work" | "interact" | "aggress" | "eat";

export const POSE_KEYS: readonly PoseKey[] = ["stand", "walkA", "walkB", "work", "interact", "aggress", "eat"];

interface PoseAngles {
  /** Shoulder hinge angle (rotate about local +y at the shoulder pivot). */
  readonly armL: number;
  readonly armR: number;
  /** Hip hinge angle (rotate about local +y at the hip pivot). */
  readonly legL: number;
  readonly legR: number;
  /** Whole-upper-body forward lean (rotate about local +y at the hip's
   *  center, applied to the ALREADY hinge-posed arms+torso+head+hair). */
  readonly lean: number;
}

const WALK_LEG_SWING = 0.45;
const WALK_ARM_SWING = 0.35;
const WALK_LEAN = 0.05;

/** Every angle is radians of rotation about local +y (see this module's
 *  header) — negative swings a limb toward local +x (forward), matching
 *  `rotateY`'s sign convention for a point hanging below its pivot. */
const POSES: Readonly<Record<PoseKey, PoseAngles>> = {
  stand: { armL: 0, armR: 0, legL: 0, legR: 0, lean: 0 },
  // Opposite-phase arm/leg swing, a natural gait — walkB is walkA mirrored.
  walkA: { armL: WALK_ARM_SWING, armR: -WALK_ARM_SWING, legL: -WALK_LEG_SWING, legR: WALK_LEG_SWING, lean: -WALK_LEAN },
  walkB: { armL: -WALK_ARM_SWING, armR: WALK_ARM_SWING, legL: WALK_LEG_SWING, legR: -WALK_LEG_SWING, lean: -WALK_LEAN },
  // Bent forward, arms down-forward (harvesting/laboring/helping/teaching).
  work: { armL: -0.85, armR: -0.85, legL: 0, legR: 0, lean: -0.35 },
  // One arm reaching forward (gift/share/trade).
  interact: { armL: 0, armR: -1.1, legL: 0, legR: 0, lean: -0.08 },
  // Both arms up/forward, aggressive lean (attack/sabotage/steal/rumor).
  aggress: { armL: -1.5, armR: -1.5, legL: 0, legR: 0, lean: -0.18 },
  // One arm raised toward the head.
  eat: { armL: 0, armR: -1.85, legL: 0, legR: 0, lean: 0 },
};

/** The 14 sim action labels (`HollowAgentSnapshot.action`), mapped onto the
 *  pose set above. `"walk"` intentionally maps to `"stand"` — the actual
 *  moving pose is `walkA`/`walkB`, picked by the render-clock gait phase in
 *  `agent-anim.ts` (see `poseForAgent`), never by this pure static table.
 *  Unrecognized labels defensively fall back to `"stand"`. */
const ACTION_POSE: Readonly<Record<string, PoseKey>> = {
  idle: "stand",
  rest: "stand",
  walk: "stand",
  work: "work",
  help: "work",
  teach: "work",
  gift: "interact",
  share: "interact",
  trade: "interact",
  attack: "aggress",
  sabotage: "aggress",
  steal: "aggress",
  rumor: "aggress",
  eat: "eat",
};

export function poseForAction(action: string): PoseKey {
  return ACTION_POSE[action] ?? "stand";
}

// ---------------------------------------------------------------------------
// Geometry constants (local mesh space — see this module's header)
// ---------------------------------------------------------------------------

const LEG_W = 0.16; // local-x thickness
const LEG_D = 0.16; // local-y width, per leg
const LEG_H = 0.7;
const LEG_GAP = 0.03; // half-gap between the two legs, centered on the y-axis
const HIP_Z = LEG_H;

const TORSO_W = 0.3;
const TORSO_D = 0.5;
const TORSO_H = 0.55;
const SHOULDER_Z = HIP_Z + TORSO_H;

const ARM_W = 0.14;
const ARM_D = 0.14;
const ARM_H = 0.5;
const ARM_GAP = 0.02;

const HEAD_SIZE = 0.32;
const NECK_GAP = 0.02;
const HEAD_Z = SHOULDER_Z + NECK_GAP;

const HAIR_PAD = 1.08;
const HAIR_H = HEAD_SIZE * 0.55;

const FOOT_LEN = 0.24;
const FOOT_H = 0.08;

/** World-space-equivalent LOCAL anchor point for a nametag/glyph — the top
 *  of the head, in the pre-scale/pre-facing local frame. Exposed for
 *  chunk hollow-09c's glyph/tag overlay to `transformPoint` through an
 *  agent's per-frame model matrix (see `app.ts`'s `agentRenderState` seam). */
export const HEAD_TOP_LOCAL: Vec3 = [0, 0, HEAD_Z + HEAD_SIZE];

// ---------------------------------------------------------------------------
// Part builders
// ---------------------------------------------------------------------------

/** Rotate `mesh` about local +y through `pivot`, by `rad`. A no-op (angle 0)
 *  returns `mesh` itself unchanged — keeps the bind ("stand") pose's vertex
 *  positions bit-identical rather than round-tripping through a 0-rad
 *  rotation. */
function rotateAboutPivotY(mesh: Mesh, pivot: Vec3, rad: number): Mesh {
  if (rad === 0) return mesh;
  const toOrigin: Vec3 = [-pivot[0], -pivot[1], -pivot[2]];
  return translate(rotateY(translate(mesh, toOrigin), rad), pivot);
}

function buildLeg(side: "L" | "R", clothKey: string, angle: number): Mesh {
  const sign = side === "L" ? -1 : 1; // left = -y, right = +y (arbitrary, symmetric)
  const yMin = sign < 0 ? -(LEG_GAP + LEG_D) : LEG_GAP;
  const yCenter = yMin + LEG_D / 2;
  const legBox = translate(box([LEG_W, LEG_D, LEG_H], clothKey), [-LEG_W / 2, yMin, 0]);
  const footBox = translate(box([FOOT_LEN, LEG_D, FOOT_H], clothKey), [-FOOT_LEN * 0.4, yMin, 0]);
  const pivot: Vec3 = [0, yCenter, HIP_Z];
  return rotateAboutPivotY(merge(legBox, footBox), pivot, angle);
}

function buildArm(side: "L" | "R", skinKey: string, angle: number): Mesh {
  const sign = side === "L" ? -1 : 1;
  const yMin = sign < 0 ? -(TORSO_D / 2 + ARM_GAP + ARM_D) : TORSO_D / 2 + ARM_GAP;
  const yCenter = yMin + ARM_D / 2;
  const armBox = translate(box([ARM_W, ARM_D, ARM_H], skinKey), [-ARM_W / 2, yMin, SHOULDER_Z - ARM_H]);
  const pivot: Vec3 = [0, yCenter, SHOULDER_Z];
  return rotateAboutPivotY(armBox, pivot, angle);
}

function buildTorso(clothKey: string): Mesh {
  return translate(box([TORSO_W, TORSO_D, TORSO_H], clothKey), [-TORSO_W / 2, -TORSO_D / 2, HIP_Z]);
}

function buildHead(skinKey: string): Mesh {
  return translate(box([HEAD_SIZE, HEAD_SIZE, HEAD_SIZE], skinKey), [-HEAD_SIZE / 2, -HEAD_SIZE / 2, HEAD_Z]);
}

function buildHairCap(hairKey: string): Mesh {
  const size = HEAD_SIZE * HAIR_PAD;
  const z = HEAD_Z + HEAD_SIZE - HAIR_H * 0.4;
  return translate(box([size, size, HAIR_H], hairKey), [-size / 2, -size / 2, z]);
}

// ---------------------------------------------------------------------------
// buildHumanoid
// ---------------------------------------------------------------------------

export interface BuildHumanoidOptions {
  readonly skinKey: string;
  readonly hairKey: string;
  readonly clothKey: string;
  readonly pose: PoseKey;
}

/** Build one (skinKey, hairKey, clothKey, pose) humanoid mesh — small, pure,
 *  deterministic. Upload ONCE per distinct variant and cache forever (see
 *  `VariantCache` below); never rebuild per-instance or per-frame. */
export function buildHumanoid(opts: BuildHumanoidOptions): Mesh {
  const { skinKey, hairKey, clothKey, pose } = opts;
  const angles = POSES[pose];

  const legL = buildLeg("L", clothKey, angles.legL);
  const legR = buildLeg("R", clothKey, angles.legR);
  const armL = buildArm("L", skinKey, angles.armL);
  const armR = buildArm("R", skinKey, angles.armR);
  const torso = buildTorso(clothKey);
  const head = buildHead(skinKey);
  const hair = buildHairCap(hairKey);

  const upperBodyBind = merge(torso, head, hair, armL, armR);
  const hipPivot: Vec3 = [0, 0, HIP_Z];
  const upperBody = rotateAboutPivotY(upperBodyBind, hipPivot, angles.lean);

  return merge(legL, legR, upperBody);
}

// ---------------------------------------------------------------------------
// Life-stage scale
// ---------------------------------------------------------------------------

const CHILD_STAGE_SCALE = 0.6;
const ADULT_STAGE_SCALE = 1.0;
/** Elder stays close to adult size — the "slightly stooped" read comes from
 *  an extra forward lean applied in `agent-anim.ts`'s model-matrix assembly,
 *  not from shrinking here. */
const ELDER_STAGE_SCALE = 0.94;

/** Overall size multiplier for an agent's life stage. Monotonic child <
 *  adult; unrecognized stages default to adult scale. Pure. */
export function stageScale(stage: string): number {
  if (stage === "child") return CHILD_STAGE_SCALE;
  if (stage === "elder") return ELDER_STAGE_SCALE;
  return ADULT_STAGE_SCALE;
}

// ---------------------------------------------------------------------------
// Deterministic per-agent hash + tint
// ---------------------------------------------------------------------------

/** Deterministic integer hash (Murmur-ish finalizer, same shape as
 *  household-layout.ts's `hashId`) — NOT an `Rng` (never fed into the sim,
 *  never affects sim state), just a stable id -> bits mapping so per-agent
 *  render variation (tint, walk-phase offset) doesn't look identical across
 *  agents while staying frame-to-frame stable for a given id. */
export function hashAgentId(id: number): number {
  let h = (id ^ 0x9e3779b9) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

const TINT_MIN = 0.92;
const TINT_MAX = 1.08;

/** A subtle, deterministic near-white per-instance tint derived from an
 *  agent's id (never RNG) — appearance color CORRECTNESS comes from the
 *  mesh-variant materials, this is just a tiny brightness jitter so a crowd
 *  of same-skin/same-hair agents doesn't look like perfect clones. */
export function humanoidTint(agentId: number): readonly [number, number, number, number] {
  const h = hashAgentId(agentId);
  const t = TINT_MIN + ((h % 10000) / 10000) * (TINT_MAX - TINT_MIN);
  return [t, t, t, 1];
}

// ---------------------------------------------------------------------------
// Variant memoization
// ---------------------------------------------------------------------------

/** The memoization key for one mesh variant — stable for identical inputs,
 *  distinct whenever skin, hair, or pose differ. Clothing is deliberately
 *  NOT part of the key (see `CLOTH_KEY`'s doc: one fixed role for every
 *  agent, so it can't fragment the variant count). */
export function variantKey(skinKey: string, hairKey: string, pose: PoseKey): string {
  return `${skinKey}|${hairKey}|${pose}`;
}

/** Generic memoizing cache keyed by a string (typically `variantKey`'s
 *  output) — used by the app to ensure each distinct humanoid variant (a
 *  `Mesh` + its uploaded `MeshHandle`) is built/uploaded exactly once, no
 *  matter how many agents/frames request it. */
export class VariantCache<T> {
  private readonly cache = new Map<string, T>();

  getOrBuild(key: string, build: () => T): T {
    let value = this.cache.get(key);
    if (value === undefined) {
      value = build();
      this.cache.set(key, value);
    }
    return value;
  }

  get size(): number {
    return this.cache.size;
  }
}
