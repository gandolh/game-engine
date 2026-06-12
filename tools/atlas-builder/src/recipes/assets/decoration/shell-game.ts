import { type PixelRecipe } from "../../types";

// Shell game: a small wooden street table (d/D/H top, legs) with three
// cream/stone cup domes (w/q/Q) in a row and a tiny red pea (r) beside one.
// 32×24, bottom-anchored.
const recipe: PixelRecipe = {
  name: "decoration/shell-game",
  size: 32,
  width: 32,
  height: 24,
  pixels: [
    "................................",
    "................................",
    "................................",
    ".......kkk....kkk....kkk........",
    "......kqQqk..kqQqk..kqQqk.......",
    ".....kqwwwk.kqwwwk.kqwwwk.......",
    ".....kwwwwQk.kwwwQk.kwwwQk......",
    ".....kwwwwQk.kwwwQk.kwwwQk......",
    ".....kQwwwQk.kQwwQk.kQwwQk......",
    ".....kQwwwQkrkQwwQk.kQwwQk......",
    ".....kQQQQQk.kQQQQk.kQQQQk......",
    "....kkkkkkkkkkkkkkkkkkkkkkk.....",
    "...kddddddddddddddddddddddddk...",
    "...kdDDDDDDDDDDDDDDDDDDDDDDHdk..",
    "...kdHHHHHHHHHHHHHHHHHHHHHHHdk..",
    "...kkkkkkkkkkkkkkkkkkkkkkkkkk...",
    "....kDk..............kDk........",
    "....kDk..............kDk........",
    "....kdk..............kdk........",
    "....kdk..............kdk........",
    "....kDk..............kDk........",
    "...kkDkk............kkDkk.......",
    "...kHHHk............kHHHk.......",
    "...kkkkk............kkkkk.......",
  ],
};

export default recipe;
