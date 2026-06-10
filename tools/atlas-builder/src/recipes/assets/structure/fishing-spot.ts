import { type PixelRecipe } from "../../types";

// ── Fishing ──────────────────────────────────────────────────────────────────
// Fishing spot — THREE rising bubbles animated over a 3-frame cycle (A→B→C),
// drawn on its non-walkable ocean tile (layer 4). Each frame the three bubbles
// climb a little higher and grow, then pop into a foam crest at the top and
// restart from the seabed — a looping "glug glug" of bubbles rising to the
// surface so the spot reads as fish stirring the water. The three bubbles sit
// in three columns (left/center/right) and are staggered in phase so they
// don't rise in lockstep. Transparent base (.) so the ocean shows through;
// q = soft bubble outline (light stone), e = bright ocean-foam ring/body,
// w = white highlight + foam crest where a bubble pops at the surface.
// `structure/fishing-spot` is frame A — it is the frame the BubbleSystem
// spawns + the snapshot carries; the render loop swaps in -a/-b/-c for the
// animation (see main.ts).
//
// Frame A — bubbles low (near the seabed), small.
const recipe: PixelRecipe =
  {
    name: "structure/fishing-spot",
    size: 16,
    pixels: [
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
      "...q........q...",
      "..qeq......qeq..",
      "...q...qq...q...",
      ".......qeq......",
      "........q.......",
      "................",
      "................",
    ],
  }
;

export default recipe;
