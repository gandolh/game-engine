export interface Canvas2dSprite {
  x: number;
  y: number;
  width: number;
  height: number;
  frame: string;

  atlasId: string;
  rotation: number;
  layer: number;
  alpha: number;

  sortY?: number;

  z?: number;

  occludable?: boolean;
  flipX?: boolean;

  tintRgba?: number;

  swayPhase?: number;

  swayAmp?: number;
}

export type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
