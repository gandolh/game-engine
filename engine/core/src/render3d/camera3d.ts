/**
 * Orbit/pan/zoom perspective camera — the "god-cam" for a 3D top-down/angled
 * view over a z-up world. Pure state + math; no DOM/input handling here (a
 * client wires pointer/wheel events to `orbit`/`pan`/`zoom`).
 */
import type { Vec3 } from "./types";
import { add, cross, normalize } from "./geometry";
import { lookAt, perspective, type Mat4 } from "./mat4";

const WORLD_UP: Vec3 = [0, 0, 1];

function mulV3(v: Vec3, s: number): Vec3 {
  return [v[0] * s, v[1] * s, v[2] * s];
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

export interface OrbitCameraConfig {
  target: Vec3;
  distance: number;
  yaw: number;
  pitch: number;
  fovy: number;
  near: number;
  far: number;
  minPitch: number;
  maxPitch: number;
  minDistance: number;
  maxDistance: number;
}

/**
 * An orbit camera parameterized by a `target` point, a `distance` from it, and
 * `yaw`/`pitch` spherical angles. World is z-up: `eye()` at `yaw=0, pitch=0`
 * sits at `target + [distance, 0, 0]` (along +x), and increasing `pitch`
 * raises the eye toward +z.
 */
export class OrbitCamera {
  target: Vec3;
  distance: number;
  yaw: number;
  pitch: number;
  readonly fovy: number;
  readonly near: number;
  readonly far: number;
  readonly minPitch: number;
  readonly maxPitch: number;
  readonly minDistance: number;
  readonly maxDistance: number;

  constructor(config: OrbitCameraConfig) {
    this.target = config.target;
    this.distance = clamp(config.distance, config.minDistance, config.maxDistance);
    this.yaw = config.yaw;
    this.pitch = clamp(config.pitch, config.minPitch, config.maxPitch);
    this.fovy = config.fovy;
    this.near = config.near;
    this.far = config.far;
    this.minPitch = config.minPitch;
    this.maxPitch = config.maxPitch;
    this.minDistance = config.minDistance;
    this.maxDistance = config.maxDistance;
  }

  /** Unit vector from `target` toward the eye, for the current yaw/pitch. */
  private direction(): Vec3 {
    const cp = Math.cos(this.pitch);
    const sp = Math.sin(this.pitch);
    const cy = Math.cos(this.yaw);
    const sy = Math.sin(this.yaw);
    return [cp * cy, cp * sy, sp];
  }

  /** Add `dYaw`/`dPitch` (radians) to the current orbit angles, clamping
   *  pitch to `[minPitch, maxPitch]`. Yaw is unclamped (wraps freely). */
  orbit(dYaw: number, dPitch: number): void {
    this.yaw += dYaw;
    this.pitch = clamp(this.pitch + dPitch, this.minPitch, this.maxPitch);
  }

  /** Shift `target` by `dRight`/`dUp` along the camera's current right/up
   *  screen-plane axes (world-space, z-up). */
  pan(dRight: number, dUp: number): void {
    const dir = this.direction();
    let right = normalize(cross(WORLD_UP, dir));
    if (right[0] === 0 && right[1] === 0 && right[2] === 0) {
      // dir parallel to WORLD_UP (looking straight down/up the z axis) — fall
      // back to a stable right axis.
      right = [1, 0, 0];
    }
    const up = cross(dir, right);
    this.target = add(this.target, add(mulV3(right, dRight), mulV3(up, dUp)));
  }

  /** Scale `distance` by `factor` (>1 zooms out, <1 zooms in), clamped to
   *  `[minDistance, maxDistance]`. */
  zoom(factor: number): void {
    this.distance = clamp(this.distance * factor, this.minDistance, this.maxDistance);
  }

  /** World-space eye position: `target + distance * direction(yaw, pitch)`. */
  eye(): Vec3 {
    return add(this.target, mulV3(this.direction(), this.distance));
  }

  /** Right-handed view matrix looking from `eye()` at `target`, z-up world. */
  viewMatrix(): Mat4 {
    return lookAt(this.eye(), this.target, WORLD_UP);
  }

  /** WebGPU-convention (clip z ∈ [0,1]) perspective projection for the given
   *  viewport `aspect` ratio. */
  projMatrix(aspect: number): Mat4 {
    return perspective(this.fovy, aspect, this.near, this.far);
  }
}
