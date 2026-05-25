export interface CameraConfig {
  worldUnitsX: number;
  worldUnitsY: number;
  centerX: number;
  centerY: number;
}

export class Camera2D {
  worldUnitsX: number;
  worldUnitsY: number;
  centerX: number;
  centerY: number;

  constructor(cfg: CameraConfig) {
    this.worldUnitsX = cfg.worldUnitsX;
    this.worldUnitsY = cfg.worldUnitsY;
    this.centerX = cfg.centerX;
    this.centerY = cfg.centerY;
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
