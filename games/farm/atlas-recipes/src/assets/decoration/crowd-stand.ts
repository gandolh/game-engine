import { type PixelRecipe } from "../../types";

// A small grandstand of cheering spectators, 1×1 tile (16×16), bottom-anchored.
// Tiered structure-blue bleachers (S/s) packed with a colourful crowd of heads
// (r/o/y/R/U) over body dots (k), framed by a dark rail (k).
const recipe: PixelRecipe = {
  name: "decoration/crowd-stand",
  size: 16,
  pixels: [
    "................",
    "..kkkkkkkkkkkk..",
    "..kroyRoUryoRk..",
    "..kkkkkkkkkkkk..",
    "..kSsSsSsSsSsk..",
    "..kUryoRyoUryk..",
    "..kkkkkkkkkkkk..",
    "..kSsSsSsSsSsk..",
    "..kyoRUryoRyok..",
    "..kkkkkkkkkkkk..",
    "..kSsSsSsSsSsk..",
    "..kRoyUryoRUyk..",
    "..kkkkkkkkkkkk..",
    "..kSSSSSSSSSSk..",
    "..kkkkkkkkkkkk..",
    "................",
  ],
};

export default recipe;
