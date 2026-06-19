
export interface SnapshotSprite {

  id: number | null;

  x: number;
  y: number;
  rotation: number;
  layer: number;

  frame: string;

  alpha: number;

  tintRgba?: number;

  z?: number;

  interpolate: boolean;

  action: string | null;

  moving?: boolean;

  label: string | null;

  description?: string | null;

  facing?: "down" | "up" | "side" | null;

  flipX?: boolean;

  bubble?: string | null;

  healthFrac?: number;
}

export interface SnapshotMeet {
  farmerId: number;
}

export interface SnapshotEvent {

  day: number;

  text: string;

  drama: number;

  farmerId?: number | null;
}

export interface SnapshotShock {
  kind: string;
  day: number;
  targetFarmerId: number;
  targetName: string;
  plotsWiped: number;
}
