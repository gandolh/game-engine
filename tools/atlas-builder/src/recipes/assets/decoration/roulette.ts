import { type PixelRecipe } from "../../types";

// Roulette wheel at a slight angle, 2×2 tiles (32×32), bottom-anchored.
// Outer wood rim (d/D), a ring of alternating red (R/x) and black (k)
// number pockets, a gold (o) hub at the center, sitting on a small
// green-felt base (G/g/l).
const recipe: PixelRecipe = {
  name: "decoration/roulette",
  size: 32,
  width: 32,
  height: 32,
  pixels: [
    "................................",
    "................................",
    "...........kkkkkkkkkk...........",
    ".......kkkdddddddddddkkk........",
    ".....kkddDDDDDDDDDDDDDDddkk.....",
    "....kddDDkRkRkRkRkRkRkRDDdk.....",
    "...kdDDkRxkkRkkRkkRkkRxkDDdk....",
    "..kdDDRxqqqqqqqqqqqqqqxRkDDdk...",
    "..kdDkqqqGGGGGGGGGGGGqqkRDDdk...",
    ".kdDRqqGGgggggggggggGGqqxkDDdk..",
    ".kdDkqGGgggoooooogggggGGqRDDdk..",
    ".kdDRqGgggooooooooogggGqqkDDdk..",
    ".kdDkqGgggoooyyooooogggGqRDDdk..",
    ".kdDRqGgggooyooyoooogggGqkDDdk..",
    ".kdDkqGgggooyooyoooogggGqRDDdk..",
    ".kdDRqGgggoooyyooooogggGqkDDdk..",
    ".kdDkqGgggooooooooogggGGqRDDdk..",
    ".kdDRqqGgggoooooogggggGqqkDDdk..",
    "..kdDkqqGGgggggggggggGGqqRDDdk..",
    "..kdDRxqqGGGGGGGGGGGGqqxkDDdk...",
    "..kdDDkRqqqqqqqqqqqqqqRkDDDdk...",
    "...kdDDRxkkRkkRkkRkkRxkDDDdk....",
    "....kddDDkRkRkRkRkRkRkDDddk.....",
    ".....kkddDDDDDDDDDDDDDDdkk......",
    ".......kkkdddddddddddkkk........",
    "...........kkkkkkkkkk...........",
    "...........lGGGGGGGGl...........",
    "..........lGggggggggGl..........",
    "..........lGggggggggGl..........",
    "...........lGGGGGGGGl...........",
    "............kllllllk............",
    "................................",
  ],
};

export default recipe;
