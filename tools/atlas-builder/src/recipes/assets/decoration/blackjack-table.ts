import { type PixelRecipe } from "../../types";

// Half-round blackjack table, 2×1.5 tiles (32×24), bottom-anchored.
// Green felt (G/g/l) top with wood trim (d/D/H), three card rectangles (w)
// and chip stacks (o gold / r red / S blue) arranged across the felt.
const recipe: PixelRecipe = {
  name: "decoration/blackjack-table",
  size: 32,
  width: 32,
  height: 24,
  pixels: [
    "................................",
    "................................",
    "................................",
    "................................",
    "........kkkkkkkkkkkkkkkk........",
    ".....kkkddddddddddddddddkkk.....",
    "...kkdDDDDDDDDDDDDDDDDDDDDdkk...",
    "..kdDHGGGGGGGGGGGGGGGGGGGGHDDk..",
    ".kdDHGGgGGGgGGGGGGgGGGgGGGGHDDk.",
    ".kdHGGggwwGGwwGGGwwGGGwwGgGGHDk.",
    "kdDHGGgwwwGwwwGGwwwGGwwwGgGGHDDk",
    "kdHGGgGGGGGGGGGGGGGGGGGGGGgGGHDk",
    "kdHGorGGoGGGGSGGGGoGGGSGGGGGGHDk",
    "kdHGorGGoGGGGSGGGGoGGGSGGGGgGHDk",
    "kdDHGgGGGGGGGGGGGGGGGGGGGgGGGHDk",
    ".kdDHGGgGGGgGGGGGGGgGGgGGHGGHDk.",
    ".kdDDHHGGGGGGGGGGGGGGGGHHDDDDDk.",
    "..kdDDDHHHHHHHHHHHHHHHHDDDDDDk..",
    "...kkdDDDDDDDDDDDDDDDDDDDDdkk...",
    ".....kkkddddddddddddddddkkk.....",
    "........kkkkkkkkkkkkkkkk........",
    "..........kdk......kdk..........",
    "..........kDk......kDk..........",
    "..........kkk......kkk..........",
  ],
};

export default recipe;
