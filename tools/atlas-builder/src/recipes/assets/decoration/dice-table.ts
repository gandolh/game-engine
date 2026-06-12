import { type PixelRecipe } from "../../types";

// Craps / dice table: green felt (G/g) with a wood rail (d/D), two white
// dice (w with k pips) thrown on the felt and a couple chips (o gold / r red).
// Felt here is a brighter green than the blackjack table so they read apart.
// 32×24, bottom-anchored.
const recipe: PixelRecipe = {
  name: "decoration/dice-table",
  size: 32,
  width: 32,
  height: 24,
  pixels: [
    "................................",
    "................................",
    "................................",
    "....kkkkkkkkkkkkkkkkkkkkkkkk....",
    "...kddddddddddddddddddddddddk...",
    "..kdDHHHHHHHHHHHHHHHHHHHHHHDdk..",
    "..kdHGGGGGGGGGGGGGGGGGGGGGGHdk..",
    "..kdHGggggggggggggggggggggGHdk..",
    "..kdHGgggkkkkggggggkkkkgggGHdk..",
    "..kdHGggkwwwwkggggkwwwwkggGHdk..",
    "..kdHGggkwkwwkggggkwwkwkggHHdk..",
    "..kdHGggkwwwwkggggkwkwwkggGHdk..",
    "..kdHGggkwwkwkggggkwwwwkggGHdk..",
    "..kdHGggkkkkkggorggkkkkggggHdk..",
    "..kdHGgggggggggorgggggggggGHdk..",
    "..kdHGggggggggggggggggggggGHdk..",
    "..kdHGGGGGGGGGGGGGGGGGGGGGGHdk..",
    "..kdDHHHHHHHHHHHHHHHHHHHHHHDdk..",
    "...kddddddddddddddddddddddddk...",
    "....kkkkkkkkkkkkkkkkkkkkkkkk....",
    ".......kDk............kDk.......",
    ".......kDk............kDk.......",
    "......kkDkk..........kkDkk......",
    "......kkkkk..........kkkkk......",
  ],
};

export default recipe;
