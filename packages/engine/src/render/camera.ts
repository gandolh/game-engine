export const MIN_ZOOM = 0.5;

export const MAX_ZOOM = 6;

export interface CameraConfig {
  worldUnitsX: number;
  worldUnitsY: number;
  centerX: number;
  centerY: number;
}

export class Camera2D {
  private readonly baseUnitsX: number; 
  private readonly baseUnitsY: number;
  worldUnitsX: number;
  worldUnitsY: number;
  centerX: number;
  centerY: number;
  zoom: number = 1; 

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

export function expSmooth(current: number, target: number, k: number, dtSec: number): number {
  return current + (target - current) * (1 - Math.exp(-k * dtSec));
}
