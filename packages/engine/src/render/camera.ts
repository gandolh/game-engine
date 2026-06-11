export const MIN_ZOOM = 0.5;
/** At 6× a 16px tile = 96 canvas px — crisp under nearest-neighbor. */
export const MAX_ZOOM = 6;

export interface CameraConfig {
  worldUnitsX: number;
  worldUnitsY: number;
  centerX: number;
  centerY: number;
}

export class Camera2D {
  private readonly baseUnitsX: number; // unzoomed world-unit dimensions
  private readonly baseUnitsY: number;
  worldUnitsX: number;
  worldUnitsY: number;
  centerX: number;
  centerY: number;
  zoom: number = 1; // higher = closer in

  constructor(cfg: CameraConfig) {
    this.baseUnitsX = cfg.worldUnitsX;
    this.baseUnitsY = cfg.worldUnitsY;
    this.worldUnitsX = cfg.worldUnitsX;
    this.worldUnitsY = cfg.worldUnitsY;
    this.centerX = cfg.centerX;
    this.centerY = cfg.centerY;
  }

  setCenter(x: number, y: number): void {
    this.centerX = x;
    this.centerY = y;
  }

  setZoom(z: number): void {
    this.zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z));
    this.worldUnitsX = this.baseUnitsX / this.zoom;
    this.worldUnitsY = this.baseUnitsY / this.zoom;
  }

}

/** Frame-rate-independent exponential approach toward `target`. k≈8–12 (per-second rate). */
export function expSmooth(current: number, target: number, k: number, dtSec: number): number {
  return current + (target - current) * (1 - Math.exp(-k * dtSec));
}
