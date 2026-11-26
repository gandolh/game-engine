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

/** The sea foam: three terrain frames over a 1800 ms loop. Nothing samples it at run time; a test does. */
export const FOAM_ANIMATION = {
  name: "foam",
  frames: ["tile/foam-a", "tile/foam-b", "tile/foam-c"],
  frameDurationMs: 600,
  mode: "loop",
} as const satisfies AnimationDecl;

/** The forge chimney's smoke: a 700 ms loop. 700 / 3 is not whole, but three of them sum to exactly 700. */
export const FORGE_SMOKE_ANIMATION = {
  name: "forge-smoke",
  frames: ["structure/forge-smoke-a", "structure/forge-smoke-b", "structure/forge-smoke-c"],
  frameDurationMs: 700 / 3,
  mode: "loop",
} as const satisfies AnimationDecl;

/** The waterfall's falling water: a 540 ms loop, each row on its own phase. */
export const WATERFALL_FALL_ANIMATION = {
  name: "waterfall-fall",
  frames: ["tile/waterfall-fall-a", "tile/waterfall-fall-b", "tile/waterfall-fall-c"],
  frameDurationMs: 180,
  mode: "loop",
} as const satisfies AnimationDecl;

/** A campfire: a 390 ms loop. */
export const CAMPFIRE_ANIMATION = {
  name: "campfire",
  frames: ["structure/campfire-a", "structure/campfire-b", "structure/campfire-c"],
  frameDurationMs: 130,
  mode: "loop",
} as const satisfies AnimationDecl;

/** The weather beacon's blink: two frames, a 1000 ms loop. */
export const WEATHER_BEACON_ANIMATION = {
  name: "weather-beacon",
  frames: ["structure/weather-beacon-a", "structure/weather-beacon-b"],
  frameDurationMs: 500,
  mode: "loop",
} as const satisfies AnimationDecl;

/** A fishing spot's bubbles: a 1200 ms loop, each tile on its own phase. */
export const FISHING_SPOT_ANIMATION = {
  name: "fishing-spot",
  frames: ["structure/fishing-spot", "structure/fishing-spot-b", "structure/fishing-spot-c"],
  frameDurationMs: 400,
  mode: "loop",
} as const satisfies AnimationDecl;

/** A bird's wing flap: two frames on the props sheet, a 400 ms loop. */
export const BIRD_FLAP_ANIMATION = {
  name: "bird-flap",
  frames: ["decoration/bird-a", "decoration/bird-b"],
  frameDurationMs: 200,
  mode: "loop",
} as const satisfies AnimationDecl;

export const FARM_ANIMATIONS: readonly AnimationDecl[] = [
  FOAM_ANIMATION,
  FORGE_FIRE_ANIMATION,
  FORGE_SMOKE_ANIMATION,
  WATERFALL_FALL_ANIMATION,
  CAMPFIRE_ANIMATION,
  WEATHER_BEACON_ANIMATION,
  FISHING_SPOT_ANIMATION,
  BIRD_FLAP_ANIMATION,
];
