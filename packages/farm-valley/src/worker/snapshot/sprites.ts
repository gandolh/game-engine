// Sprite and overlay snapshot types — the per-tick serializable geometry that
// the sim worker posts to the main thread. All positions are in tile-space;
// the renderer converts to pixels.

/** One renderable sprite in tile coordinates (renderer converts to px). */
export interface SnapshotSprite {
  /** Stable entity id when this sprite is an entity (for focus halo lookup). */
  id: number | null;
  /** Tile-space position this tick. */
  x: number;
  y: number;
  rotation: number;
  layer: number;
  /** Resolved atlas frame (farmer walk-cycle already applied worker-side). */
  frame: string;
  /** Per-sprite alpha (from tint), 0..1. */
  alpha: number;
  /**
   * Per-sprite RGB tint as 0xRRGGBBAA (the engine sprite tint format). Used by
   * the visual state indicators (snapshot-builder/indicators.ts) to wash a
   * sprite when a crop is thirsty/dying or a farmer is exhausted / has a broken
   * tool. Healthy/normal sprites carry 0xffffffff (no RGB shift). Optional so
   * untinted sprites may omit it; the renderer treats absent as 0xffffffff.
   */
  tintRgba?: number;
  /** True for farmer entities — main thread interpolates these against prev. */
  interpolate: boolean;
  /**
   * Current farmer action (from intentions queue head) — used by the main
   * thread to pick the work-pose frame or idle-bob offset.
   * null for non-farmer sprites.
   */
  action: string | null;
  /** Display name shown in the hover tooltip. null for anonymous sprites (crops, plots). */
  label: string | null;
  /** Longer description shown under the label in the hover tooltip. null for none. */
  description?: string | null;
  /**
   * Facing for directional sprites (farmers + work NPCs). "down" is the front
   * view (the base frame); "up" is the back; "side" is the right-facing profile.
   * Persists the last movement direction while idle. null for non-directional
   * sprites (structures, crops). See render-systems `resolveFrameAndBob`.
   */
  facing?: "down" | "up" | "side" | null;
  /** Mirror the sprite horizontally (used with facing "side" for leftward movement). */
  flipX?: boolean;
  /**
   * Intention bubble glyph frame (e.g. "indicator/intention-plant") to draw
   * above this AI farmer for the brief window after an intention change, or null
   * when no bubble should show. Only set for non-player farmer sprites; always
   * null for non-farmer sprites.
   * Brief 40.
   */
  bubble?: string | null;
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
  /**
   * The primary farmer entity id involved in this event (winner of auction,
   * target of shock, etc.), or null when none is identifiable. Used by the main
   * thread to zoom-to the relevant farmer when the user clicks the feed entry.
   * Brief 40.
   */
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
