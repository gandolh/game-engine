export interface CameraConfig {
  worldUnitsX: number;
  worldUnitsY: number;
  centerX: number;
  centerY: number;
}

export class Camera2D {
  /** Base world-unit dimensions (unzoomed). */
  private readonly baseUnitsX: number;
  private readonly baseUnitsY: number;
  worldUnitsX: number;
  worldUnitsY: number;
  centerX: number;
  centerY: number;
  /** Current zoom level (1 = default). Higher = closer in. */
  zoom: number = 1;

  constructor(cfg: CameraConfig) {
    this.baseUnitsX = cfg.worldUnitsX;
    this.baseUnitsY = cfg.worldUnitsY;
    this.worldUnitsX = cfg.worldUnitsX;
    this.worldUnitsY = cfg.worldUnitsY;
    this.centerX = cfg.centerX;
    this.centerY = cfg.centerY;
  }

  // brief-11: focus-camera setters
  /** Recenter the camera on (x, y) in world-pixel coordinates. */
  setCenter(x: number, y: number): void {
    this.centerX = x;
    this.centerY = y;
  }

  /**
   * Set zoom level, clamped to [0.5, 3].
   * Zoom > 1 shows less of the world (zoomed in), < 1 shows more.
   */
  setZoom(z: number): void {
    this.zoom = Math.max(0.5, Math.min(3, z));
    this.worldUnitsX = this.baseUnitsX / this.zoom;
    this.worldUnitsY = this.baseUnitsY / this.zoom;
  }

  viewProjection(): Float32Array {
    const halfW = this.worldUnitsX / 2;
    const halfH = this.worldUnitsY / 2;
    const l = this.centerX - halfW;
    const r = this.centerX + halfW;
    const t = this.centerY - halfH;
    const b = this.centerY + halfH;
    const sx = 2 / (r - l);
    const sy = 2 / (t - b);
    const tx = -(r + l) / (r - l);
    const ty = -(t + b) / (t - b);
    return new Float32Array([
      sx, 0,  0, 0,
      0,  sy, 0, 0,
      0,  0,  1, 0,
      tx, ty, 0, 1,
    ]);
  }
}
