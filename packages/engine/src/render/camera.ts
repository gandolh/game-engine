// brief-60: shared zoom bounds — import these in any handler that clamps zoom.
/** Minimum zoom level (zoomed out). A separate brief owns the zoom-out end. */
export const MIN_ZOOM = 0.5;
/** Maximum zoom level (zoomed in). At 6× a 16px tile is 96 canvas px — crisp under nearest-neighbor. */
export const MAX_ZOOM = 6;

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
   * Set zoom level, clamped to [MIN_ZOOM, MAX_ZOOM].
   * Zoom > 1 shows less of the world (zoomed in), < 1 shows more.
   */
  setZoom(z: number): void {
    this.zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z));
    this.worldUnitsX = this.baseUnitsX / this.zoom;
    this.worldUnitsY = this.baseUnitsY / this.zoom;
  }

}
