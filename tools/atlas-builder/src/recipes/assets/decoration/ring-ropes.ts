import { type PixelRecipe } from "../../types";

// A span of boxing-ring ropes between two short posts, 2×1 tiles (32×16),
// bottom-anchored. Two stubby red turnbuckle posts (R/x) at each end with three
// taut white ropes (w) strung across and a hint of canvas mat (h) below.
const recipe: PixelRecipe = {
  name: "decoration/ring-ropes",
  size: 16,
  width: 32,
  height: 16,
  pixels: [
    "................................",
    ".xRx........................xRx.",
    ".RRR........................RRR.",
    ".RRRwwwwwwwwwwwwwwwwwwwwwwwwRRR.",
    ".RRR........................RRR.",
    ".RRRwwwwwwwwwwwwwwwwwwwwwwwwRRR.",
    ".RRR........................RRR.",
    ".RRRwwwwwwwwwwwwwwwwwwwwwwwwRRR.",
    ".RRR........................RRR.",
    ".RRR........................RRR.",
    ".xRx........................xRx.",
    ".dDd........................dDd.",
    ".dDd........................dDd.",
    ".kQk........................kQk.",
    "hhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhh",
    "................................",
  ],
};

export default recipe;
