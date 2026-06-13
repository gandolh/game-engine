/** One renderable sprite in tile coordinates (renderer converts to px). */
export interface SnapshotSprite {
  /** Stable entity id when this sprite is an entity (for focus halo lookup). */
  id: number | null;
  /** Tile-space position this tick. */
  x: number;
  y: number;
  rotation: number;
  layer: number;
  /** Base atlas frame. For farmers/Pip this is the direction-less look ("farmer/<p>");
   *  the renderer resolves facing + the walk/idle/action animation from it. */
  frame: string;
  /** Per-sprite alpha (from tint), 0..1. */
  alpha: number;
  /** 0xRRGGBBAA tint. Absent = 0xffffffff (no tint). Used by indicators for state washes. */
  tintRgba?: number;
  /** Pseudo-3D height above the ground in tile units (renderer lifts the sprite up by z·TILE and
   *  shrinks/fades its drop-shadow). Absent/0 = grounded. Reserved for jumps/thrown items; inert today. */
  z?: number;
  /** True for farmer entities — main thread interpolates these against prev. */
  interpolate: boolean;
  /** Current action (intentions head); used to pick work-pose. null for non-farmers. */
  action: string | null;
  /** True while a farmer/Pip is walking this tick — drives the render-side walk cycle. */
  moving?: boolean;
  /** Display name shown in the hover tooltip. null for anonymous sprites (crops, plots). */
  label: string | null;
  /** Longer description shown under the label in the hover tooltip. null for none. */
  description?: string | null;
  /** "down" = front (base), "up" = back, "side" = right profile. Persists while idle. null = non-directional. */
  facing?: "down" | "up" | "side" | null;
  /** Mirror the sprite horizontally (used with facing "side" for leftward movement). */
  flipX?: boolean;
  /** Intention bubble frame shown for a window after an intention change. null = no bubble. */
  bubble?: string | null;
  /** Combat HP fraction (current/max) in [0,1]; present only while the farmer is FIGHTING.
   *  The renderer draws an over-sprite HP bar when set; absent/undefined = no bar (normal state). */
  healthFrac?: number;
}

/** Active MEET indicator for a farmer this tick. */
export interface SnapshotMeet {
  farmerId: number;
}

/** One formatted activity-feed line (newest entries are last in the array). */
export interface SnapshotEvent {
  /** Sim day for the "Day N —" prefix. */
  day: number;
  /** Narration text (no prefix). */
  text: string;
  /** Drama score in [0, 1]; higher = more significant. From drama.ts. */
  drama: number;
  /** Entity id of the primary farmer involved; main thread zooms to them on click. */
  farmerId?: number | null;
}

/** A one-time shock event, surfaced once in the snapshot it fires on. */
export interface SnapshotShock {
  kind: string;
  day: number;
  targetFarmerId: number;
  targetName: string;
  plotsWiped: number;
}
