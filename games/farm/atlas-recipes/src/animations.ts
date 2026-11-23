/**
 * Farm's declared animations (corpus brief 22): which frames make one, in order, for how long. The cook checks
 * the frame names against the recipes and writes each into its sheet's manifest; the sim builds its clip from the
 * same list with `clipFromDeclaration`. Plain data with no imports, so the sim reads it without pulling the
 * recipes (or the cook's file reads) into a client bundle. Exported as `@farm/atlas-recipes/animations`.
 */
export interface AnimationDecl {
  readonly name: string;
  readonly frames: readonly string[];
  readonly frameDurationMs: number | readonly number[];
  readonly mode: "loop" | "once";
}

/** The forge's fire: three frames, one 420 ms loop (140 ms a frame). */
export const FORGE_FIRE_ANIMATION = {
  name: "forge-fire",
  frames: ["structure/forge-fire-a", "structure/forge-fire-b", "structure/forge-fire-c"],
  frameDurationMs: 140,
  mode: "loop",
} as const satisfies AnimationDecl;

export const FARM_ANIMATIONS: readonly AnimationDecl[] = [FORGE_FIRE_ANIMATION];
